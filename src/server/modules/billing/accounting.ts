/**
 * QuickBooks Online sync (customers, invoices, payments). Runs only when features.quickbooksSyncEnabled.
 * A failed sync is recorded (AccountingSyncLog + per-record status) and can be retried from the admin;
 * it NEVER blocks invoicing or payments.
 */
import { prisma } from "../../db";
import { accounting } from "../../providers/registry";
import { getSetting } from "../../settings";

async function enabled() {
  return (await getSetting("features")).quickbooksSyncEnabled;
}

async function log(entity: string, entityId: string, status: "SYNCED" | "FAILED" | "SKIPPED", remoteId?: string, error?: string) {
  await prisma.accountingSyncLog.create({ data: { provider: accounting().name, entity, entityId, status, remoteId, error } }).catch(() => undefined);
}

export async function syncCustomer(customerId: string): Promise<string | null> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, include: { company: true } });
  if (!c) return null;
  if (c.qboCustomerId) return c.qboCustomerId;
  const { qboId } = await accounting().upsertCustomer({ id: c.id, name: c.name, email: c.email, companyName: c.company?.name });
  await prisma.customer.update({ where: { id: c.id }, data: { qboCustomerId: qboId } });
  await log("customer", c.id, "SYNCED", qboId);
  return qboId;
}

/** Push an issued invoice. Returns the final sync status. */
export async function syncInvoice(invoiceId: string, opts: { force?: boolean } = {}): Promise<string> {
  if (!opts.force && !(await enabled())) {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { qboSyncStatus: "DISABLED" } });
    return "DISABLED";
  }
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { lines: true } });
  if (!inv || inv.status === "DRAFT" || inv.status === "VOID") return inv?.qboSyncStatus ?? "DISABLED";
  try {
    const qboCustomerId = await syncCustomer(inv.customerId);
    if (!qboCustomerId) throw new Error("Customer could not be synced.");
    const { qboId } = inv.qboInvoiceId
      ? { qboId: inv.qboInvoiceId }
      : await accounting().pushInvoice({
          number: inv.number,
          qboCustomerId,
          dueAt: inv.dueAt?.toISOString(),
          lines: inv.lines.map((l) => ({ description: l.description, amountCents: l.totalCents })),
        });
    await prisma.invoice.update({ where: { id: inv.id }, data: { qboInvoiceId: qboId, qboSyncStatus: "SYNCED", qboError: null } });
    await log("invoice", inv.id, "SYNCED", qboId);
    return "SYNCED";
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    await prisma.invoice.update({ where: { id: inv.id }, data: { qboSyncStatus: "FAILED", qboError: msg } });
    await log("invoice", inv.id, "FAILED", undefined, msg);
    return "FAILED";
  }
}

export async function syncPayment(paymentId: string): Promise<void> {
  if (!(await enabled())) return;
  const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { invoice: true } });
  if (!p || p.status !== "SUCCEEDED" || p.kind === "REFUND" || p.qboPaymentId) return;
  try {
    if (!p.invoice) return await log("payment", p.id, "SKIPPED", undefined, "Not linked to an invoice (deposit); recorded on invoicing.");
    if (p.invoice.qboSyncStatus !== "SYNCED") await syncInvoice(p.invoice.id);
    const inv = await prisma.invoice.findUnique({ where: { id: p.invoice.id }, include: { customer: true } });
    if (!inv?.qboInvoiceId || !inv.customer.qboCustomerId) throw new Error("Invoice is not synced to QuickBooks yet.");
    const { qboId } = await accounting().pushPayment({ qboInvoiceId: inv.qboInvoiceId, qboCustomerId: inv.customer.qboCustomerId, amountCents: p.amountCents, date: p.createdAt.toISOString() });
    await prisma.payment.update({ where: { id: p.id }, data: { qboPaymentId: qboId } });
    await log("payment", p.id, "SYNCED", qboId);
  } catch (e) {
    await log("payment", p.id, "FAILED", undefined, (e as Error).message.slice(0, 500));
  }
}
