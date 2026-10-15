/**
 * Payments: online checkout (Stripe or mock), success handling (webhook / mock confirm),
 * manual payments (check, ACH, cash, account) and refunds. Every success updates the order's
 * paymentStatus and the invoice balance, then emits payment.succeeded.
 */
import { prisma } from "../../db";
import { emit } from "../../lib/events";
import { HttpError } from "../../lib/errors";
import { payments } from "../../providers/registry";
import { syncPayment } from "./accounting";
import { webUrl } from "./money";

export type CheckoutTarget =
  | { kind: "DEPOSIT"; quotationId: string; orderId?: string | null }
  | { kind: "PAYMENT"; invoiceId: string }
  | { kind: "PAYMENT"; orderId: string };

/** Creates a PENDING payment + provider checkout session; returns the hosted checkout URL. */
export async function startCheckout(target: CheckoutTarget, amountCents: number, description: string, customerEmail: string, returnPath: string) {
  if (!Number.isInteger(amountCents) || amountCents < 50) throw new HttpError(400, "Amount is too small to pay online.");
  const provider = payments();
  const payment = await prisma.payment.create({
    data: {
      method: provider.name === "stripe" ? "stripe" : "mock",
      kind: target.kind,
      status: "PENDING",
      amountCents,
      quotationId: "quotationId" in target ? target.quotationId : null,
      orderId: "orderId" in target ? target.orderId ?? null : null,
      invoiceId: "invoiceId" in target ? target.invoiceId : null,
    },
  });
  const session = await provider.createCheckout({
    amountCents,
    description,
    customerEmail,
    metadata: { paymentId: payment.id, kind: target.kind },
    // Stripe replaces {CHECKOUT_SESSION_ID} so the confirmation page can poll the payment status
    successUrl: webUrl(`/pay/success?return=${encodeURIComponent(returnPath)}&session_id={CHECKOUT_SESSION_ID}`),
    cancelUrl: webUrl(returnPath),
  });
  await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: session.id } });
  return { paymentId: payment.id, url: session.url, provider: session.provider };
}

/** Recalculate an order's payment status from its succeeded payments. */
export async function refreshOrderPayment(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true, invoiceLines: { include: { invoice: true } } } });
  if (!order) return;
  const onOpenInvoice = order.invoiceLines.some((l) => !["VOID", "PAID"].includes(l.invoice.status));
  const onPaidInvoice = order.invoiceLines.some((l) => l.invoice.status === "PAID");
  const paid = order.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + (p.kind === "REFUND" ? -p.amountCents : p.amountCents), 0);
  const refunded = order.payments.some((p) => p.kind === "REFUND" && p.status === "SUCCEEDED");
  let status = order.paymentStatus;
  if (paid <= 0) status = refunded ? "REFUNDED" : order.paymentStatus === "INVOICED" || order.paymentStatus === "ACCOUNT" ? order.paymentStatus : "UNPAID";
  else if (onPaidInvoice || (order.retailCents != null && paid >= order.retailCents)) status = "PAID";
  else status = onOpenInvoice ? "INVOICED" : "DEPOSIT_PAID";
  if (paid <= 0 && onOpenInvoice) status = "INVOICED";
  if (status !== order.paymentStatus) await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: status } });
}

/** Recalculate an invoice's paid amount and status. */
export async function refreshInvoice(invoiceId: string) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
  if (!inv) return null;
  const paid = inv.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + (p.kind === "REFUND" ? -p.amountCents : p.amountCents), 0);
  let status = inv.status;
  if (inv.status !== "VOID" && inv.status !== "DRAFT") {
    const pastDue = !!inv.dueAt && inv.dueAt < new Date();
    if (paid >= inv.totalCents) status = "PAID"; // includes $0 balances fully covered by deposits
    else if (pastDue) status = "OVERDUE";
    else status = paid > 0 ? "PARTIAL" : "SENT";
  }
  const updated = await prisma.invoice.update({ where: { id: invoiceId }, data: { paidCents: Math.max(0, paid), status } });
  if (status === "PAID") {
    // Orders fully covered by a paid invoice are PAID
    const lines = await prisma.invoiceLine.findMany({ where: { invoiceId, orderId: { not: null } }, select: { orderId: true } });
    await prisma.order.updateMany({ where: { id: { in: lines.map((l) => l.orderId!) } }, data: { paymentStatus: "PAID" } });
  }
  return updated;
}

/**
 * Mark a checkout payment succeeded. Idempotent: webhooks may be delivered more than once.
 * Returns the payment (unchanged when it was already SUCCEEDED).
 */
export async function markCheckoutSucceeded(providerRef: string) {
  const payment = await prisma.payment.findUnique({ where: { providerRef } });
  if (!payment) throw new HttpError(404, "Payment not found.");
  if (payment.status === "SUCCEEDED") return payment;
  // Conditional update guards against two concurrent deliveries both applying effects
  const res = await prisma.payment.updateMany({ where: { id: payment.id, status: { not: "SUCCEEDED" } }, data: { status: "SUCCEEDED" } });
  if (res.count === 0) return prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  await applyPaymentEffects(payment.id);
  return prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
}

export async function markCheckoutFailed(providerRef: string) {
  await prisma.payment.updateMany({ where: { providerRef, status: "PENDING" }, data: { status: "FAILED" } });
}

async function applyPaymentEffects(paymentId: string) {
  const p = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  // A deposit paid on a quotation is attached to the order created at acceptance
  if (p.quotationId && !p.orderId) {
    const order = await prisma.order.findUnique({ where: { quotationId: p.quotationId } });
    if (order) await prisma.payment.update({ where: { id: p.id }, data: { orderId: order.id } });
  }
  const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (fresh.orderId) await refreshOrderPayment(fresh.orderId);
  if (fresh.invoiceId) await refreshInvoice(fresh.invoiceId);
  if (fresh.orderId) {
    await prisma.orderEvent.create({
      data: { orderId: fresh.orderId, type: "NOTE", detail: `${fresh.kind === "DEPOSIT" ? "Deposit" : "Payment"} received`, actorType: "system", customerVisible: false },
    });
  }
  await emit("payment.succeeded", { paymentId: fresh.id, orderId: fresh.orderId ?? undefined, invoiceId: fresh.invoiceId ?? undefined, quotationId: fresh.quotationId ?? undefined });
  void syncPayment(fresh.id);
}

/** Staff-recorded payment (check, ACH, cash, account credit). */
export async function recordManualPayment(input: { method: "check" | "ach" | "cash" | "account"; amountCents: number; invoiceId?: string; orderId?: string; note?: string; recordedBy: string }) {
  if (!input.invoiceId && !input.orderId) throw new HttpError(400, "Choose an invoice or an order.");
  const payment = await prisma.payment.create({
    data: { method: input.method, kind: "PAYMENT", status: "SUCCEEDED", amountCents: input.amountCents, invoiceId: input.invoiceId, orderId: input.orderId, note: input.note, recordedBy: input.recordedBy },
  });
  await applyPaymentEffects(payment.id);
  return payment;
}

/** Refund (full or partial). Online payments are refunded through the provider first. */
export async function refundPayment(paymentId: string, amountCents: number | undefined, recordedBy: string, note?: string) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { invoice: true } });
  if (!p || p.status !== "SUCCEEDED" || p.kind === "REFUND") throw new HttpError(400, "Only a succeeded payment can be refunded.");
  const already = await prisma.payment.aggregate({ where: { note: { startsWith: `refund-of:${p.id}` }, status: "SUCCEEDED" }, _sum: { amountCents: true } });
  const remaining = p.amountCents - (already._sum.amountCents ?? 0);
  const amount = amountCents ?? remaining;
  if (amount <= 0 || amount > remaining) throw new HttpError(400, `Refund must be between $0.01 and ${(remaining / 100).toFixed(2)}.`);
  let providerRef: string | undefined;
  if ((p.method === "stripe" || p.method === "mock") && p.providerRef) {
    const r = await payments().refund(p.providerRef, amount);
    if (!r.ok) throw new HttpError(502, "The payment provider did not accept the refund. Nothing was changed.");
    providerRef = r.id;
  }
  const refund = await prisma.payment.create({
    data: {
      method: p.method,
      kind: "REFUND",
      status: "SUCCEEDED",
      amountCents: amount,
      orderId: p.orderId,
      invoiceId: p.invoiceId,
      quotationId: p.quotationId,
      providerRef,
      recordedBy,
      note: `refund-of:${p.id}${note ? ` ${note}` : ""}`,
    },
  });
  if (p.orderId) await refreshOrderPayment(p.orderId);
  if (p.invoiceId) await refreshInvoice(p.invoiceId);
  return refund;
}
