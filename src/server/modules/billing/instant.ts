/**
 * Instant pricing & booking (backend for the wave-2 booking UI).
 * Available ONLY when features.pricingEnabled AND features.instantBookingEnabled are on (owner approval
 * after test orders). Standard requests only: custom-quote / special-route requests and any price that
 * fails the engine guardrails (manual review) never receive an instant price.
 * Customers only ever see the retail price; the signed price token binds that price to the exact request.
 */
import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import type { QuoteRequest } from "@/lib/quote-schema";
import { prisma } from "../../db";
import { decideRoute } from "../../engines/decision-engine";
import { priceLocal } from "../../engines/pricing/local";
import { priceStorage } from "../../engines/pricing/storage";
import { env } from "../../lib/env";
import { emit } from "../../lib/events";
import { HttpError } from "../../lib/errors";
import { publicToken, quotationReference } from "../../lib/reference";
import { maps } from "../../providers/registry";
import { createOrder } from "../../services/orders";
import { getActiveRules, getSetting } from "../../settings";
import { startCheckout } from "./payments";

const TOKEN_TTL_SECONDS = 15 * 60;
const secret = () => `${env.jwtSecret}:instant-price`;
const fingerprint = (r: QuoteRequest) =>
  createHash("sha256").update(JSON.stringify({ s: r.serviceType, p: r.pickup, d: r.delivery, i: r.items, dt: r.serviceDate, tw: r.timeWindow, sp: r.speed, st: [r.storageStart, r.storageEnd] })).digest("hex");

export async function instantAvailable() {
  const f = await getSetting("features");
  return f.pricingEnabled && f.instantBookingEnabled;
}

type Priced = { retailCents: number; costCents: number; lines: { label: string; cents: number }[]; engine: "local" | "storage" };

async function priceRequest(r: QuoteRequest): Promise<Priced | { unavailable: string }> {
  const decision = decideRoute(r, await getSetting("thresholds"));
  if (decision.route !== "standard-quote") return { unavailable: "This request needs a planned quotation from our dispatch team." };
  if (decision.engine === "storage") {
    if (!r.storageStart || !r.storageEnd) return { unavailable: "Storage dates are required." };
    const p = priceStorage({ start: new Date(r.storageStart), end: new Date(r.storageEnd), pieces: decision.totalPieces, withPickup: r.storageWithPickup, withDelivery: r.storageWithDelivery }, await getActiveRules("storage"));
    if (p.manualReview) return { unavailable: "This request needs a quick review by our team." };
    return { retailCents: p.retailCents, costCents: p.costCents, lines: p.lines, engine: "storage" };
  }
  if (decision.engine !== "local") return { unavailable: "Nationwide shipping prices are confirmed by quotation." };
  const dist = await maps().distance(r.pickup.address, r.delivery.address);
  const p = priceLocal(
    {
      pickupZone: r.pickup.market,
      deliveryZone: r.delivery.market,
      miles: dist.miles,
      pieces: r.items.map((i) => ({ category: i.category, quantity: i.quantity })),
      pickupLocationType: r.pickup.type,
      deliveryLocationType: r.delivery.type,
      sameDay: r.speed === "same-day",
      urgent: r.speed === "urgent",
      afterHours: r.timeWindow === "after-hours",
    },
    await getActiveRules("local"),
  );
  if (p.manualReview) return { unavailable: "This request needs a quick review by our team." };
  return { retailCents: p.retailCents, costCents: p.costCents, lines: p.lines, engine: "local" };
}

/** Customer-safe instant quote: retail price + customer-facing line labels + signed token. */
export async function instantQuote(r: QuoteRequest) {
  if (!(await instantAvailable())) throw new HttpError(404, "Instant pricing is not available. Please request a quote.");
  const priced = await priceRequest(r);
  if ("unavailable" in priced) return { ok: true as const, available: false as const, reason: priced.unavailable };
  const token = jwt.sign({ fp: fingerprint(r), retail: priced.retailCents }, secret(), { expiresIn: TOKEN_TTL_SECONDS });
  return {
    ok: true as const,
    available: true as const,
    retailCents: priced.retailCents,
    lines: priced.lines.map((l) => ({ label: l.label })), // labels only; amounts would leak structure, total is what's offered
    expiresInSeconds: TOKEN_TTL_SECONDS,
    priceToken: token,
  };
}

/** Book & pay an instant price: quotation(source=instant, ACCEPTED) → order → checkout for the full amount. */
export async function instantBook(r: QuoteRequest, priceToken: string, acceptance: { name: string; ip?: string; userAgent?: string }) {
  if (!(await instantAvailable())) throw new HttpError(404, "Instant booking is not available. Please request a quote.");
  let claims: { fp: string; retail: number };
  try {
    claims = jwt.verify(priceToken, secret()) as { fp: string; retail: number };
  } catch {
    throw new HttpError(409, "This price has expired. Please refresh your price.");
  }
  if (claims.fp !== fingerprint(r)) throw new HttpError(409, "Your request changed. Please refresh your price.");
  const priced = await priceRequest(r);
  if ("unavailable" in priced) throw new HttpError(409, priced.unavailable);
  if (priced.retailCents !== claims.retail) throw new HttpError(409, "Prices were updated. Please refresh your price.");

  const email = r.contact.email.toLowerCase();
  const customer = await prisma.customer.upsert({
    where: { email },
    update: { name: r.contact.name, phone: r.contact.phone },
    create: { email, name: r.contact.name, phone: r.contact.phone, preferredContact: r.contact.preferredContact },
  });
  const now = new Date();
  const quotation = await prisma.quotation.create({
    data: {
      reference: quotationReference(),
      customerId: customer.id,
      source: "instant",
      status: "ACCEPTED",
      title: `Instant booking: ${r.serviceType.replace(/-/g, " ")}`,
      subtotalCents: priced.retailCents,
      totalCents: priced.retailCents,
      costCents: priced.costCents,
      marginPct: priced.retailCents > 0 ? Math.round(((priced.retailCents - priced.costCents) / priced.retailCents) * 1000) / 10 : 0,
      publicToken: publicToken(),
      acceptedAt: now,
      acceptedName: acceptance.name,
      acceptedIp: acceptance.ip,
      acceptedUserAgent: acceptance.userAgent?.slice(0, 300),
      lines: { create: [{ kind: priced.engine === "storage" ? "storage" : "transport", description: priced.lines.map((l) => l.label).join(" · ").slice(0, 500), quantity: 1, unitCents: priced.retailCents, unitCostCents: priced.costCents, totalCents: priced.retailCents }] },
    },
  });
  const order = await createOrder(
    {
      customerId: customer.id,
      serviceType: r.serviceType,
      fulfillment: priced.engine === "storage" ? "storage" : "local",
      quotationId: quotation.id,
      pickup: r.pickup,
      delivery: r.delivery,
      extraStops: r.extraStops,
      serviceDate: new Date(r.serviceDate),
      timeWindow: r.timeWindow,
      market: r.pickup.market,
      pieces: r.items.flatMap((i) => Array.from({ length: i.quantity }, () => ({ category: i.category, description: i.description || undefined, weightLbs: i.weightLbs, lengthIn: i.lengthIn, widthIn: i.widthIn, heightIn: i.heightIn }))),
      retailCents: priced.retailCents,
      costCents: priced.costCents,
      specialHandling: r.specialHandling || null,
      accessNotes: r.accessNotes || null,
      customerNotes: r.notes || null,
    },
    { type: "customer", id: customer.id, name: customer.name },
  );
  await prisma.quotation.update({ where: { id: quotation.id }, data: { status: "CONVERTED" } });
  await emit("quotation.accepted", { quotationId: quotation.id, orderId: order.id });
  const checkout = await startCheckout({ kind: "PAYMENT", orderId: order.id }, priced.retailCents, `Express Bags order ${order.reference}`, email, `/pay/status?order=${order.reference}`);
  return { ok: true as const, orderReference: order.reference, checkoutUrl: checkout.url };
}
