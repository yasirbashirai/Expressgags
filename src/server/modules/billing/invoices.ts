/**
 * Invoices: created from one or more orders (company accounts can be invoiced monthly with PO /
 * cost center), numbered EB-INV-000001 from an atomic sequence, terms from the company's payment
 * terms, overdue detection, aging buckets and email delivery with a secure public link.
 */
import { prisma } from "../../db";
import { emit } from "../../lib/events";
import { brandedHtml, sendMail } from "../../lib/email";
import { HttpError } from "../../lib/errors";
import { publicToken } from "../../lib/reference";
import { syncInvoice } from "./accounting";
import { fmtUsd, invoiceNumber, nextSequence, webUrl } from "./money";

/** Due at the end of the due day (local server time). */
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

type ExtraLine = { description: string; quantity: number; unitCents: number };

export async function createInvoice(input: {
  orderIds: string[];
  customerId?: string;
  extraLines?: ExtraLine[];
  poNumber?: string | null;
  costCenter?: string | null;
  notes?: string | null;
  dueDays?: number;
}) {
  const orders = input.orderIds.length
    ? await prisma.order.findMany({ where: { id: { in: input.orderIds } }, include: { payments: true, customer: true, invoiceLines: { include: { invoice: true } } } })
    : [];
  if (orders.length !== input.orderIds.length) throw new HttpError(404, "One or more orders were not found.");
  const customerId = input.customerId ?? orders[0]?.customerId;
  if (!customerId) throw new HttpError(400, "Choose a customer or at least one order.");
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, include: { company: true } });
  if (!customer) throw new HttpError(404, "Customer not found.");

  for (const o of orders) {
    if (o.status === "CANCELLED") throw new HttpError(400, `Order ${o.reference} is cancelled.`);
    if (o.retailCents == null) throw new HttpError(400, `Order ${o.reference} has no price yet.`);
    const invoiced = o.invoiceLines.some((l) => l.invoice.status !== "VOID");
    if (invoiced) throw new HttpError(409, `Order ${o.reference} is already on an invoice.`);
    const sameAccount = o.customerId === customerId || (customer.companyId && o.companyId === customer.companyId);
    if (!sameAccount) throw new HttpError(400, `Order ${o.reference} belongs to a different customer.`);
  }

  // Lines: each order at its retail price, less any deposits already collected
  const lines: { description: string; quantity: number; unitCents: number; totalCents: number; orderId?: string }[] = [];
  for (const o of orders) {
    const date = o.serviceDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    lines.push({ description: `Order ${o.reference} · ${o.serviceType.replace(/-/g, " ")} · ${date}${o.guestName ? ` · Guest: ${o.guestName}` : ""}`, quantity: 1, unitCents: o.retailCents!, totalCents: o.retailCents!, orderId: o.id });
    const deposits = o.payments.filter((p) => p.status === "SUCCEEDED" && p.kind === "DEPOSIT" && !p.invoiceId).reduce((s, p) => s + p.amountCents, 0);
    if (deposits > 0) lines.push({ description: `Less deposit received for ${o.reference}`, quantity: 1, unitCents: -deposits, totalCents: -deposits, orderId: o.id });
  }
  for (const l of input.extraLines ?? []) lines.push({ ...l, totalCents: Math.round(l.quantity * l.unitCents) });
  if (!lines.length) throw new HttpError(400, "An invoice needs at least one line.");

  const subtotal = lines.reduce((s, l) => s + l.totalCents, 0);
  const number = invoiceNumber(await nextSequence("invoice"));
  const invoice = await prisma.invoice.create({
    data: {
      number,
      customerId,
      companyId: customer.companyId,
      status: "DRAFT",
      poNumber: input.poNumber ?? orders.find((o) => o.poNumber)?.poNumber ?? null,
      costCenter: input.costCenter ?? orders.find((o) => o.costCenter)?.costCenter ?? null,
      notes: input.notes ?? null,
      subtotalCents: subtotal,
      totalCents: Math.max(0, subtotal),
      publicToken: publicToken(),
      dueAt: null,
      lines: { create: lines.map((l, i) => ({ description: l.description, quantity: l.quantity, unitCents: l.unitCents, totalCents: l.totalCents, orderId: l.orderId, sortOrder: i })) },
    },
  });
  await prisma.order.updateMany({ where: { id: { in: input.orderIds }, paymentStatus: { in: ["UNPAID", "DEPOSIT_PAID", "ACCOUNT"] } }, data: { paymentStatus: "INVOICED" } });
  // Deposits stay linked to their order; the "Less deposit" lines keep the invoice balance correct
  return invoice;
}

/** Issue (SENT) with due date from terms, email the customer, sync to QuickBooks. */
export async function issueInvoice(invoiceId: string, opts: { email?: boolean; dueDays?: number } = {}) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true, company: true } });
  if (!inv) throw new HttpError(404, "Invoice not found.");
  if (inv.status === "VOID") throw new HttpError(400, "A void invoice cannot be sent.");
  const terms = opts.dueDays ?? inv.company?.paymentTermsDays ?? 0;
  const issuedAt = inv.issuedAt ?? new Date();
  const dueAt = inv.dueAt ?? endOfDay(new Date(issuedAt.getTime() + terms * 86400000));
  await prisma.invoice.update({ where: { id: inv.id }, data: { status: inv.status === "DRAFT" ? "SENT" : inv.status, issuedAt, dueAt } });
  const updated = await refreshAfterIssue(inv.id);
  if (opts.email !== false) {
    const to = inv.company?.billingEmail || inv.customer.email;
    const link = webUrl(`/invoice/${inv.publicToken}`);
    await sendMail({
      to,
      subject: `Invoice ${inv.number} from Express Bags, Inc.`,
      text: `Hello ${inv.customer.name},\n\nInvoice ${inv.number} for ${fmtUsd(updated.totalCents - updated.paidCents)} is ready. View and pay securely: ${link}\n\nDue: ${dueAt.toDateString()}\n\nThank you,\nExpress Bags, Inc.`,
      html: brandedHtml(`Invoice ${inv.number}`, [
        `Hello ${inv.customer.name},`,
        `Your invoice for ${fmtUsd(updated.totalCents - updated.paidCents)} is ready, due ${dueAt.toDateString()}.`,
        `View, download and pay securely: ${link}`,
        "Thank you for choosing Express Bags.",
      ]),
    });
  }
  await emit("invoice.issued", { invoiceId: inv.id });
  void syncInvoice(inv.id);
  return updated;
}

async function refreshAfterIssue(invoiceId: string) {
  const { refreshInvoice } = await import("./payments");
  return (await refreshInvoice(invoiceId))!;
}

export async function voidInvoice(invoiceId: string) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true, lines: true } });
  if (!inv) throw new HttpError(404, "Invoice not found.");
  if (inv.payments.some((p) => p.status === "SUCCEEDED" && p.kind !== "REFUND")) throw new HttpError(400, "Refund or reassign payments before voiding this invoice.");
  await prisma.invoice.update({ where: { id: inv.id }, data: { status: "VOID" } });
  const orderIds = inv.lines.map((l) => l.orderId).filter((x): x is string => !!x);
  await prisma.order.updateMany({ where: { id: { in: orderIds }, paymentStatus: "INVOICED" }, data: { paymentStatus: "UNPAID" } });
}

/** Mark SENT/PARTIAL invoices past due as OVERDUE (idempotent; safe to run daily or on read). */
export async function refreshOverdue(now = new Date()) {
  const r = await prisma.invoice.updateMany({ where: { status: { in: ["SENT", "PARTIAL"] }, dueAt: { lt: now } }, data: { status: "OVERDUE" } });
  return r.count;
}

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";
export const AGING_BUCKETS: AgingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

/** Days past due → bucket. Not yet due (or no due date) is "current". */
export function agingBucket(dueAt: Date | null, now = new Date()): AgingBucket {
  if (!dueAt || dueAt >= now) return "current";
  const days = Math.floor((now.getTime() - dueAt.getTime()) / 86400000);
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

/** Open-balance aging by bucket and by customer. */
export async function agingReport(now = new Date()) {
  const open = await prisma.invoice.findMany({
    where: { status: { in: ["SENT", "PARTIAL", "OVERDUE"] } },
    include: { customer: { select: { id: true, name: true, email: true } }, company: { select: { name: true } } },
    orderBy: { dueAt: "asc" },
  });
  const buckets = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>;
  const byCustomer = new Map<string, { customerId: string; name: string; balanceCents: number; buckets: Record<AgingBucket, number> }>();
  for (const inv of open) {
    const bal = inv.totalCents - inv.paidCents;
    if (bal <= 0) continue;
    const b = agingBucket(inv.dueAt, now);
    buckets[b] += bal;
    const key = inv.customerId;
    const row = byCustomer.get(key) ?? { customerId: key, name: inv.company?.name ?? inv.customer.name, balanceCents: 0, buckets: Object.fromEntries(AGING_BUCKETS.map((x) => [x, 0])) as Record<AgingBucket, number> };
    row.balanceCents += bal;
    row.buckets[b] += bal;
    byCustomer.set(key, row);
  }
  return {
    totalCents: Object.values(buckets).reduce((a, b) => a + b, 0),
    buckets,
    customers: [...byCustomer.values()].sort((a, b) => b.balanceCents - a.balanceCents),
    invoices: open.map((i) => ({ id: i.id, number: i.number, customer: i.company?.name ?? i.customer.name, dueAt: i.dueAt, balanceCents: i.totalCents - i.paidCents, bucket: agingBucket(i.dueAt, now), status: i.status })),
  };
}
