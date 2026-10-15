/**
 * Quotations: staff-built, itemized offers (Master Requirements §6.4).
 * Flow: build (from a quote request or blank) → send (secure link) → customer views → accepts with an
 * electronic acceptance record (typed name, title, agreement, timestamp, IP, user agent) or declines →
 * deposit checkout (if any) → order created. Acceptance is idempotent.
 */
import type { QuoteRequest } from "@/lib/quote-schema";
import { prisma } from "../../db";
import type { Prisma } from "../../generated/prisma/client";
import { brandedHtml, sendMail } from "../../lib/email";
import { emit } from "../../lib/events";
import { HttpError } from "../../lib/errors";
import { publicToken, quotationReference } from "../../lib/reference";
import { createOrder } from "../../services/orders";
import { fmtUsd, lineTotal, quotationMath, webUrl, type LineInput } from "../billing/money";
import { startCheckout } from "../billing/payments";

export type DetailsInput = {
  serviceType: string;
  fulfillment?: "local" | "nationwide" | "storage" | "custom";
  pickup: Record<string, unknown>;
  delivery: Record<string, unknown>;
  extraStops?: unknown[];
  serviceDate: string;
  timeWindow?: string | null;
  market: string;
  items: { category: string; quantity: number; description?: string; weightLbs?: number; lengthIn?: number; widthIn?: number; heightIn?: number }[];
  poNumber?: string | null;
  costCenter?: string | null;
};

export type QuotationInput = {
  title: string;
  scope?: string | null;
  terms?: string | null;
  validUntil?: string | null;
  depositType: "none" | "percent" | "flat";
  depositValue: number;
  lines: LineInput[];
  details: DetailsInput;
};

export const DEFAULT_TERMS =
  "Pricing is based on the route, schedule, item count, vehicle, labor and access described above. Changes to scope, waiting time beyond the agreed window, additional stops or items may change the price and are confirmed with you first. Cancellations follow the stage of the job at the time of cancellation (before dispatch, after dispatch, after pickup). Prohibited, hazardous or illegal items are not accepted. Every route, time window, vehicle and access requirement is confirmed by our dispatch team.";

const DEFAULT_SCOPE = "Pickup, careful handling, transport and documented handoff of the items listed, between the locations and within the time window below.";

/** Quote-request payload → builder details. */
export function detailsFromQuoteRequest(qr: { serviceType: string; payload: unknown }): DetailsInput {
  const p = qr.payload as QuoteRequest;
  return {
    serviceType: qr.serviceType,
    fulfillment: qr.serviceType === "storage" ? "storage" : qr.serviceType === "nationwide-shipping" ? "nationwide" : qr.serviceType === "group-event" ? "custom" : "local",
    pickup: p.pickup as unknown as Record<string, unknown>,
    delivery: p.delivery as unknown as Record<string, unknown>,
    extraStops: p.extraStops,
    serviceDate: p.serviceDate,
    timeWindow: p.timeWindow,
    market: p.pickup.market,
    items: p.items.map((i) => ({ category: i.category, quantity: i.quantity, description: i.description || undefined, weightLbs: i.weightLbs, lengthIn: i.lengthIn, widthIn: i.widthIn, heightIn: i.heightIn })),
  };
}

function detailsData(d: DetailsInput) {
  return {
    serviceType: d.serviceType,
    fulfillment: d.fulfillment ?? "local",
    pickup: d.pickup as Prisma.InputJsonValue,
    delivery: d.delivery as Prisma.InputJsonValue,
    extraStops: (d.extraStops ?? undefined) as Prisma.InputJsonValue | undefined,
    serviceDate: new Date(d.serviceDate),
    timeWindow: d.timeWindow ?? null,
    market: d.market,
    items: d.items as unknown as Prisma.InputJsonValue,
    poNumber: d.poNumber ?? null,
    costCenter: d.costCenter ?? null,
  };
}

function linesData(lines: LineInput[]) {
  return lines.map((l, i) => ({
    kind: l.kind,
    description: l.description,
    quantity: l.quantity,
    unit: l.unit ?? null,
    unitCents: Math.abs(l.unitCents),
    unitCostCents: l.unitCostCents ?? null,
    totalCents: lineTotal(l),
    sortOrder: i,
  }));
}

function totalsData(input: Pick<QuotationInput, "lines" | "depositType" | "depositValue">) {
  const m = quotationMath(input.lines, { type: input.depositType, value: input.depositValue });
  return {
    subtotalCents: m.subtotalCents,
    discountCents: m.discountCents,
    totalCents: m.totalCents,
    costCents: m.costCents,
    marginPct: m.marginPercent,
    depositType: input.depositType,
    depositValue: input.depositValue,
    depositCents: m.depositCents,
  };
}

export async function createQuotation(input: QuotationInput & { customerId: string; quoteRequestId?: string | null }, userId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new HttpError(404, "Customer not found.");
  const q = await prisma.quotation.create({
    data: {
      reference: quotationReference(),
      quoteRequestId: input.quoteRequestId ?? null,
      customerId: input.customerId,
      createdById: userId,
      title: input.title,
      scope: input.scope ?? DEFAULT_SCOPE,
      terms: input.terms ?? DEFAULT_TERMS,
      validUntil: input.validUntil ? new Date(input.validUntil) : new Date(Date.now() + 14 * 86400000),
      publicToken: publicToken(),
      ...totalsData(input),
      lines: { create: linesData(input.lines) },
    },
  });
  await prisma.quotationDetails.create({ data: { quotationId: q.id, companyId: customer.companyId, ...detailsData(input.details) } });
  if (input.quoteRequestId) {
    await prisma.quoteEvent.create({ data: { quoteId: input.quoteRequestId, type: "quotation", detail: `Quotation ${q.reference} drafted` } }).catch(() => undefined);
  }
  return q;
}

/** Edit a draft in place, or REVISE a sent quotation (snapshot → new version, back to DRAFT). */
export async function updateQuotation(id: string, input: QuotationInput, user: { id: string; email: string }, reason?: string) {
  const q = await prisma.quotation.findUnique({ where: { id }, include: { lines: true } });
  if (!q) throw new HttpError(404, "Quotation not found.");
  if (["ACCEPTED", "CONVERTED"].includes(q.status)) throw new HttpError(409, "An accepted quotation cannot be changed. Duplicate it instead.");
  if (q.status !== "DRAFT") {
    const details = await prisma.quotationDetails.findUnique({ where: { quotationId: id } });
    const versions = await prisma.quotationRevision.count({ where: { quotationId: id } });
    await prisma.quotationRevision.create({ data: { quotationId: id, version: versions + 1, snapshot: JSON.parse(JSON.stringify({ quotation: q, details })), reason: reason ?? "Revised", createdBy: user.email } });
  }
  await prisma.quotationLine.deleteMany({ where: { quotationId: id } });
  const updated = await prisma.quotation.update({
    where: { id },
    data: {
      title: input.title,
      scope: input.scope ?? null,
      terms: input.terms ?? null,
      validUntil: input.validUntil ? new Date(input.validUntil) : q.validUntil,
      status: "DRAFT",
      // A revised quotation gets a fresh link so the old one stops working
      publicToken: q.status === "DRAFT" ? q.publicToken : publicToken(),
      viewedAt: null,
      declinedAt: null,
      declineReason: null,
      ...totalsData(input),
      lines: { create: linesData(input.lines) },
    },
  });
  await prisma.quotationDetails.upsert({ where: { quotationId: id }, update: detailsData(input.details), create: { quotationId: id, ...detailsData(input.details) } });
  return updated;
}

export async function duplicateQuotation(id: string, userId: string) {
  const q = await prisma.quotation.findUnique({ where: { id }, include: { lines: true } });
  const d = await prisma.quotationDetails.findUnique({ where: { quotationId: id } });
  if (!q || !d) throw new HttpError(404, "Quotation not found.");
  return createQuotation(
    {
      customerId: q.customerId,
      quoteRequestId: q.quoteRequestId,
      title: `${q.title} (copy)`,
      scope: q.scope,
      terms: q.terms,
      validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
      depositType: q.depositType as "none" | "percent" | "flat",
      depositValue: q.depositValue,
      lines: q.lines.map((l) => ({ kind: l.kind as LineInput["kind"], description: l.description, quantity: l.quantity, unit: l.unit, unitCents: l.unitCents, unitCostCents: l.unitCostCents })),
      details: {
        serviceType: d.serviceType,
        fulfillment: d.fulfillment as DetailsInput["fulfillment"],
        pickup: d.pickup as Record<string, unknown>,
        delivery: d.delivery as Record<string, unknown>,
        extraStops: (d.extraStops as unknown[]) ?? undefined,
        serviceDate: d.serviceDate.toISOString(),
        timeWindow: d.timeWindow,
        market: d.market,
        items: d.items as DetailsInput["items"],
        poNumber: d.poNumber,
        costCenter: d.costCenter,
      },
    },
    userId,
  );
}

export async function sendQuotation(id: string) {
  const q = await prisma.quotation.findUnique({ where: { id }, include: { customer: true, lines: true } });
  if (!q) throw new HttpError(404, "Quotation not found.");
  if (!q.lines.length || q.totalCents <= 0) throw new HttpError(400, "Add at least one priced line before sending.");
  if (["ACCEPTED", "CONVERTED", "DECLINED"].includes(q.status)) throw new HttpError(409, `This quotation is ${q.status.toLowerCase()}.`);
  if (q.validUntil && q.validUntil < new Date()) throw new HttpError(400, "The validity date has passed. Update it before sending.");
  const link = webUrl(`/q/${q.publicToken}`);
  const status = await sendMail({
    to: q.customer.email,
    subject: `Your Express Bags quotation ${q.reference}`,
    text: `Hello ${q.customer.name},\n\nYour quotation "${q.title}" for ${fmtUsd(q.totalCents)} is ready. Review and accept it online: ${link}\n\nValid until ${q.validUntil?.toDateString() ?? "-"}.\n\nExpress Bags, Inc.`,
    html: brandedHtml(`Quotation ${q.reference}`, [
      `Hello ${q.customer.name},`,
      `Your quotation "${q.title}" is ready: ${fmtUsd(q.totalCents)}${q.depositCents ? `, with a ${fmtUsd(q.depositCents)} deposit on acceptance` : ""}.`,
      `Review, download and accept it securely: ${link}`,
      `This quotation is valid until ${q.validUntil?.toDateString() ?? "-"}. Every route, time window, vehicle and access requirement is confirmed by our dispatch team.`,
    ]),
  });
  const updated = await prisma.quotation.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
  if (q.quoteRequestId) {
    await prisma.quoteRequest.update({ where: { id: q.quoteRequestId }, data: { status: "QUOTED" } }).catch(() => undefined);
    await prisma.quoteEvent.create({ data: { quoteId: q.quoteRequestId, type: "quotation", detail: `Quotation ${q.reference} sent (${status.toLowerCase()})` } }).catch(() => undefined);
  }
  await emit("quotation.sent", { quotationId: id });
  return { quotation: updated, emailStatus: status, link };
}

/** Expire sent/viewed/draft quotations past their validity date. */
export async function expireQuotations(now = new Date()) {
  const r = await prisma.quotation.updateMany({ where: { status: { in: ["DRAFT", "SENT", "VIEWED"] }, validUntil: { lt: now } }, data: { status: "EXPIRED" } });
  return r.count;
}

/** Load by public token (constant shape for unknown tokens → 404 without hints). */
export async function quotationByToken(token: string) {
  if (!/^[2-9A-HJ-NP-Z]{32}$/.test(token)) throw new HttpError(404, "This quotation link is not valid.");
  await expireQuotations();
  const q = await prisma.quotation.findUnique({
    where: { publicToken: token },
    include: { lines: { orderBy: { sortOrder: "asc" } }, customer: { include: { company: true } }, order: true, payments: true },
  });
  if (!q || q.status === "DRAFT") throw new HttpError(404, "This quotation link is not valid.");
  if (q.status === "SENT") await prisma.quotation.update({ where: { id: q.id }, data: { status: "VIEWED", viewedAt: new Date() } });
  const details = await prisma.quotationDetails.findUnique({ where: { quotationId: q.id } });
  return { q: q.status === "SENT" ? { ...q, status: "VIEWED" } : q, details };
}

/** Customer-safe view of a quotation (NO cost, margin, unit cost). */
export function publicQuotationView(q: Awaited<ReturnType<typeof quotationByToken>>["q"], details: Awaited<ReturnType<typeof quotationByToken>>["details"]) {
  const depositPaid = q.payments.some((p) => p.kind === "DEPOSIT" && p.status === "SUCCEEDED");
  return {
    reference: q.reference,
    status: q.status,
    title: q.title,
    scope: q.scope,
    terms: q.terms,
    validUntil: q.validUntil,
    sentAt: q.sentAt,
    customer: { name: q.customer.name, company: q.customer.company?.name ?? null },
    lines: q.lines.map((l) => ({ kind: l.kind, description: l.description, quantity: l.quantity, unit: l.unit, unitCents: l.unitCents, totalCents: l.totalCents })),
    subtotalCents: q.subtotalCents,
    discountCents: q.discountCents,
    taxCents: q.taxCents,
    totalCents: q.totalCents,
    depositCents: q.depositCents,
    depositPaid,
    acceptedAt: q.acceptedAt,
    acceptedName: q.acceptedName,
    declinedAt: q.declinedAt,
    orderReference: q.order?.reference ?? null,
    details: details
      ? { serviceType: details.serviceType, serviceDate: details.serviceDate, timeWindow: details.timeWindow, pickup: details.pickup, delivery: details.delivery, market: details.market }
      : null,
  };
}

/**
 * Accept (idempotent). The conditional status update means two simultaneous clicks create one order.
 * Returns the order and, when a deposit is due, a checkout URL.
 */
export async function acceptQuotation(token: string, a: { name: string; title?: string; ip?: string; userAgent?: string }) {
  const { q } = await quotationByToken(token);
  if (q.status === "CONVERTED" || q.status === "ACCEPTED") return finishAcceptance(q.id);
  if (!["SENT", "VIEWED"].includes(q.status)) throw new HttpError(409, q.status === "EXPIRED" ? "This quotation has expired. Please contact us for an updated quotation." : `This quotation is ${q.status.toLowerCase()}.`);
  const claimed = await prisma.quotation.updateMany({
    where: { id: q.id, status: { in: ["SENT", "VIEWED"] } },
    data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedName: a.name, acceptedTitle: a.title ?? null, acceptedIp: a.ip ?? null, acceptedUserAgent: a.userAgent?.slice(0, 300) ?? null },
  });
  if (claimed.count === 1) {
    const details = await prisma.quotationDetails.findUnique({ where: { quotationId: q.id } });
    if (!details) throw new HttpError(500, "Quotation details are missing.");
    const items = details.items as DetailsInput["items"];
    const order = await createOrder(
      {
        customerId: q.customerId,
        companyId: details.companyId,
        serviceType: details.serviceType,
        fulfillment: details.fulfillment as "local" | "nationwide" | "storage" | "custom",
        quoteId: q.quoteRequestId && !(await prisma.order.findUnique({ where: { quoteId: q.quoteRequestId } })) ? q.quoteRequestId : null,
        quotationId: q.id,
        pickup: details.pickup as Prisma.InputJsonValue,
        delivery: details.delivery as Prisma.InputJsonValue,
        extraStops: (details.extraStops ?? undefined) as Prisma.InputJsonValue | undefined,
        serviceDate: details.serviceDate,
        timeWindow: details.timeWindow,
        market: details.market,
        pieces: items.flatMap((i) => Array.from({ length: Math.min(i.quantity, 2000) }, () => ({ category: i.category, description: i.description, weightLbs: i.weightLbs, lengthIn: i.lengthIn, widthIn: i.widthIn, heightIn: i.heightIn }))).slice(0, 2000),
        retailCents: q.totalCents,
        costCents: q.costCents,
        depositCents: q.depositCents || null,
        poNumber: details.poNumber,
        costCenter: details.costCenter,
        paymentStatus: q.depositCents > 0 ? "UNPAID" : "UNPAID",
      },
      { type: "customer", id: q.customerId, name: a.name },
    );
    await prisma.quotation.update({ where: { id: q.id }, data: { status: "CONVERTED" } });
    if (q.quoteRequestId) {
      await prisma.quoteRequest.update({ where: { id: q.quoteRequestId }, data: { status: "WON" } }).catch(() => undefined);
      await prisma.quoteEvent.create({ data: { quoteId: q.quoteRequestId, type: "quotation", detail: `Quotation ${q.reference} accepted by ${a.name}; order ${order.reference}` } }).catch(() => undefined);
    }
    // Deposit paid before acceptance completed (rare race) gets attached to the order
    await prisma.payment.updateMany({ where: { quotationId: q.id, orderId: null }, data: { orderId: order.id } });
    await emit("quotation.accepted", { quotationId: q.id, orderId: order.id });
  }
  return finishAcceptance(q.id);
}

async function finishAcceptance(quotationId: string) {
  // Wait briefly for a concurrent acceptance to finish creating the order
  let order = await prisma.order.findUnique({ where: { quotationId } });
  for (let i = 0; !order && i < 20; i++) {
    await new Promise((r) => setTimeout(r, 100));
    order = await prisma.order.findUnique({ where: { quotationId } });
  }
  if (!order) throw new HttpError(409, "Your acceptance is being processed. Please refresh in a moment.");
  return { orderReference: order.reference, orderId: order.id };
}

/** Start (or resume) the deposit checkout for an accepted quotation. */
export async function depositCheckout(token: string) {
  const { q } = await quotationByToken(token);
  if (!["ACCEPTED", "CONVERTED"].includes(q.status)) throw new HttpError(409, "Accept the quotation before paying the deposit.");
  if (!q.depositCents) throw new HttpError(400, "No deposit is due on this quotation.");
  if (q.payments.some((p) => p.kind === "DEPOSIT" && p.status === "SUCCEEDED")) throw new HttpError(409, "The deposit has already been paid. Thank you.");
  const order = await prisma.order.findUnique({ where: { quotationId: q.id } });
  return startCheckout({ kind: "DEPOSIT", quotationId: q.id, orderId: order?.id }, q.depositCents, `Deposit for quotation ${q.reference}`, q.customer.email, `/q/${token}`);
}

export async function declineQuotation(token: string, reason: string) {
  const { q } = await quotationByToken(token);
  if (!["SENT", "VIEWED"].includes(q.status)) throw new HttpError(409, `This quotation is ${q.status.toLowerCase()}.`);
  await prisma.quotation.update({ where: { id: q.id }, data: { status: "DECLINED", declinedAt: new Date(), declineReason: reason.slice(0, 1000) } });
  if (q.quoteRequestId) await prisma.quoteRequest.update({ where: { id: q.quoteRequestId }, data: { status: "LOST" } }).catch(() => undefined);
}
