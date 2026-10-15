/**
 * Instant nationwide shipping prices & booking for the quote wizard.
 * Available ONLY when the owner has approved public pricing (features.pricingEnabled AND
 * instantBookingEnabled AND carrierShippingEnabled). Customers receive Express Bags service names,
 * retail prices and promised transit only; carrier cost, margin and raw carrier rates never leave the API.
 * Each offer carries a short-lived signed price token bound to the exact request + service level.
 */
import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import type { QuoteRequest } from "@/lib/quote-schema";
import { prisma } from "../../db";
import { decideRoute } from "../../engines/decision-engine";
import { env } from "../../lib/env";
import { emit } from "../../lib/events";
import { HttpError } from "../../lib/errors";
import { publicToken, quotationReference } from "../../lib/reference";
import { createOrder } from "../../services/orders";
import { getSetting } from "../../settings";
import { startCheckout } from "../billing/payments";
import { parseAddress } from "./address";
import { publicNationwide, quoteNationwide, type NationwideInput, type NationwideResult } from "./quote";

const TOKEN_TTL_SECONDS = 15 * 60;
const secret = () => `${env.jwtSecret}:carrier-instant-price`;

export async function nationwideInstantAvailable() {
  const f = await getSetting("features");
  return Boolean(f.pricingEnabled && f.instantBookingEnabled && f.carrierShippingEnabled);
}

const fingerprint = (r: QuoteRequest) =>
  createHash("sha256")
    .update(JSON.stringify({ p: r.pickup, d: r.delivery, i: r.items, dt: r.serviceDate, sp: r.speed }))
    .digest("hex");

/** QuoteRequest (wizard payload) → nationwide quote input. */
export function inputFromRequest(r: QuoteRequest): NationwideInput {
  return {
    destination: parseAddress(r.delivery.address),
    includePickup: r.pickup.type !== "storage",
    pieces: r.items.flatMap((i) =>
      Array.from({ length: i.quantity }, () => ({
        category: i.category,
        weightLbs: i.weightLbs,
        lengthIn: i.lengthIn,
        widthIn: i.widthIn,
        heightIn: i.heightIn,
      })),
    ),
  };
}

async function priceRequest(r: QuoteRequest): Promise<{ result: NationwideResult } | { unavailable: string }> {
  if (r.serviceType !== "nationwide-shipping") return { unavailable: "Instant shipping prices apply to luggage shipping only." };
  const decision = decideRoute(r, await getSetting("thresholds"));
  if (decision.route !== "standard-quote") return { unavailable: "This shipment needs a planned quotation from our team." };
  const input = inputFromRequest(r);
  if (input.destination.country === "US" && !input.destination.zip) return { unavailable: "Add the destination ZIP code to see instant prices." };
  return { result: await quoteNationwide(input) };
}

/** Customer-safe instant nationwide quote: service levels + retail + per-level signed tokens. */
export async function nationwideInstantQuote(r: QuoteRequest) {
  if (!(await nationwideInstantAvailable())) throw new HttpError(404, "Instant shipping prices are not available. Please request a quote.");
  const priced = await priceRequest(r);
  if ("unavailable" in priced) return { ok: true as const, available: false as const, reason: priced.unavailable };
  const pub = publicNationwide(priced.result);
  if (!pub.available) return { ok: true as const, available: false as const, reason: pub.reason };
  const fp = fingerprint(r);
  return {
    ok: true as const,
    available: true as const,
    pieces: pub.pieces,
    measurementsEstimated: pub.measurementsEstimated,
    expiresInSeconds: TOKEN_TTL_SECONDS,
    offers: pub.offers.map((o) => ({
      ...o,
      priceToken: jwt.sign({ fp, level: o.level, retail: Math.round(o.price * 100) }, secret(), { expiresIn: TOKEN_TTL_SECONDS }),
    })),
  };
}

/** Book & pay: re-price, verify the signed price, create quotation (instant) → order (nationwide) → checkout. */
export async function nationwideInstantBook(r: QuoteRequest, priceToken: string, acceptance: { name: string; ip?: string; userAgent?: string }) {
  if (!(await nationwideInstantAvailable())) throw new HttpError(404, "Instant shipping booking is not available. Please request a quote.");
  let claims: { fp: string; level: string; retail: number };
  try {
    claims = jwt.verify(priceToken, secret()) as typeof claims;
  } catch {
    throw new HttpError(409, "This price has expired. Please refresh your prices.");
  }
  if (claims.fp !== fingerprint(r)) throw new HttpError(409, "Your shipment changed. Please refresh your prices.");
  const priced = await priceRequest(r);
  if ("unavailable" in priced) throw new HttpError(409, priced.unavailable);
  if (priced.result.status !== "priced") throw new HttpError(409, priced.result.reason);
  const offer = priced.result.offers.find((o) => o.level === claims.level && !o.manualReview);
  if (!offer) throw new HttpError(409, "That service level is no longer available. Please refresh your prices.");
  if (offer.retailCents !== claims.retail) throw new HttpError(409, "Prices were updated. Please refresh your prices.");

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
      title: `Luggage shipping: ${offer.levelName}`,
      scope: `Express Bags pickup, processing and ${offer.levelName.toLowerCase()} shipping of ${priced.result.parcels.length} piece(s) to ${r.delivery.address}. Promised transit about ${offer.transitDays} business day(s) after handoff, subject to carrier performance.`,
      subtotalCents: offer.retailCents,
      totalCents: offer.retailCents,
      costCents: offer.costCents,
      marginPct: offer.marginPercent,
      publicToken: publicToken(),
      acceptedAt: now,
      acceptedName: acceptance.name,
      acceptedIp: acceptance.ip,
      acceptedUserAgent: acceptance.userAgent?.slice(0, 300),
      lines: {
        create: [
          { kind: "transport", description: `${offer.levelName} luggage shipping, ${priced.result.parcels.length} piece(s), including Express Bags pickup`, quantity: 1, unitCents: offer.retailCents, unitCostCents: offer.costCents, totalCents: offer.retailCents },
        ],
      },
    },
  });
  const order = await createOrder(
    {
      customerId: customer.id,
      serviceType: r.serviceType,
      fulfillment: "nationwide",
      quotationId: quotation.id,
      pickup: r.pickup,
      delivery: r.delivery,
      serviceDate: new Date(r.serviceDate),
      timeWindow: r.timeWindow,
      market: r.pickup.market,
      pieces: r.items.flatMap((i) => Array.from({ length: i.quantity }, () => ({ category: i.category, description: i.description || undefined, weightLbs: i.weightLbs, lengthIn: i.lengthIn, widthIn: i.widthIn, heightIn: i.heightIn }))),
      retailCents: offer.retailCents,
      costCents: offer.costCents,
      // Internal only: what was sold (staff buy the labels against this)
      pricingBreakdown: { engine: "carrier", level: offer.level, levelName: offer.levelName, carrier: offer.carrier, carrierService: offer.carrierService, transitDays: offer.transitDays, quotedAt: now.toISOString() },
      specialHandling: r.specialHandling || null,
      accessNotes: r.accessNotes || null,
      customerNotes: r.notes || null,
    },
    { type: "customer", id: customer.id, name: customer.name },
  );
  await prisma.quotation.update({ where: { id: quotation.id }, data: { status: "CONVERTED" } });
  await emit("quotation.accepted", { quotationId: quotation.id, orderId: order.id });
  const checkout = await startCheckout({ kind: "PAYMENT", orderId: order.id }, offer.retailCents, `Express Bags shipment ${order.reference}`, email, `/pay/status?order=${order.reference}`);
  return { ok: true as const, orderReference: order.reference, checkoutUrl: checkout.url };
}
