/**
 * Billing module.
 *  Admin   /v1/admin/billing     — invoices, payments, refunds, aging, CSV, cancellation rules, QuickBooks retry.
 *                                  Read: OWNER/STAFF/ACCOUNTING · record payments & refunds: OWNER/ACCOUNTING.
 *  Public  /v1/pay               — invoice view + pay, instant quote/book (flagged), payment status,
 *                                  dev-only mock checkout.
 *  Webhook /v1/webhooks/stripe   — signature-verified, de-duplicated Stripe events.
 */
import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import Stripe from "stripe";
import { z } from "zod";
import { quoteRequestSchema } from "@/lib/quote-schema";
import { audit, requireAuth, requireRole } from "../../auth";
import { prisma } from "../../db";
import type { Prisma } from "../../generated/prisma/client";
import { isProd } from "../../lib/env";
import { asyncHandler, HttpError } from "../../lib/errors";
import { payments } from "../../providers/registry";
import "../../providers/stripe"; // registers the real Stripe adapter when STRIPE_SECRET_KEY is set
import "../../providers/quickbooks"; // registers the real QuickBooks adapter when QBO_* keys are set
import type { PlatformModule } from "../types";
import { syncInvoice } from "./accounting";
import { getCancellationRules, refundSuggestion, saveCancellationRules } from "./cancellation";
import { instantBook, instantQuote } from "./instant";
import { agingReport, createInvoice, issueInvoice, refreshOverdue, voidInvoice } from "./invoices";
import { stripInternal } from "./money";
import { markCheckoutFailed, markCheckoutSucceeded, recordManualPayment, refundPayment, startCheckout } from "./payments";
import { renderInvoicePdf } from "./pdf";
import { expireQuotations } from "../quotations/service";

export const adminRouter = Router();
export const publicRouter = Router();
export const webhookRouter = Router();

const csv = (rows: (string | number | null | undefined)[][]) =>
  rows.map((r) => r.map((v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(",")).join("\n");
const dollars = (c: number) => (c / 100).toFixed(2);

/* ---------------------------------- Admin --------------------------------- */

adminRouter.use(asyncHandler(async (req, res, next) => requireAuth(req, res, next)));
adminRouter.use(requireRole("STAFF", "ACCOUNTING"));

adminRouter.get(
  "/invoices",
  asyncHandler(async (req, res) => {
    await refreshOverdue();
    const f = z.object({ status: z.string().max(20).optional(), q: z.string().max(100).optional(), customerId: z.string().max(40).optional() }).parse(req.query);
    const where: Prisma.InvoiceWhereInput = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(f.q ? { OR: [{ number: { contains: f.q, mode: "insensitive" } }, { customer: { name: { contains: f.q, mode: "insensitive" } } }, { company: { name: { contains: f.q, mode: "insensitive" } } }, { poNumber: { contains: f.q, mode: "insensitive" } }] } : {}),
    };
    const [rows, counts] = await Promise.all([
      prisma.invoice.findMany({ where, orderBy: { createdAt: "desc" }, take: 300, include: { customer: { select: { name: true, email: true } }, company: { select: { name: true } } } }),
      prisma.invoice.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    res.json({
      ok: true,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      invoices: rows.map((i) => ({ id: i.id, number: i.number, status: i.status, customer: i.company?.name ?? i.customer.name, customerEmail: i.customer.email, issuedAt: i.issuedAt, dueAt: i.dueAt, totalCents: i.totalCents, paidCents: i.paidCents, balanceCents: i.totalCents - i.paidCents, poNumber: i.poNumber, qboSyncStatus: i.qboSyncStatus, createdAt: i.createdAt })),
    });
  }),
);

adminRouter.get(
  "/invoices.csv",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.invoice.findMany({ orderBy: { createdAt: "desc" }, include: { customer: true, company: true } });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="express-bags-invoices.csv"');
    res.send(csv([["Number", "Status", "Customer", "Company", "Issued", "Due", "Total", "Paid", "Balance", "PO", "Cost center", "QuickBooks"], ...rows.map((i) => [i.number, i.status, i.customer.name, i.company?.name, i.issuedAt?.toISOString().slice(0, 10), i.dueAt?.toISOString().slice(0, 10), dollars(i.totalCents), dollars(i.paidCents), dollars(i.totalCents - i.paidCents), i.poNumber, i.costCenter, i.qboSyncStatus])]));
  }),
);

adminRouter.get(
  "/invoices/:id",
  asyncHandler(async (req, res) => {
    const inv = await prisma.invoice.findUnique({
      where: { id: String(req.params.id) },
      include: { lines: { orderBy: { sortOrder: "asc" }, include: { order: { select: { id: true, reference: true, status: true } } } }, payments: { orderBy: { createdAt: "desc" } }, customer: { include: { company: true } }, company: true },
    });
    if (!inv) throw new HttpError(404, "Invoice not found.");
    const syncLog = await prisma.accountingSyncLog.findMany({ where: { entity: "invoice", entityId: inv.id }, orderBy: { createdAt: "desc" }, take: 10 });
    res.json({ ok: true, invoice: inv, syncLog });
  }),
);

/** Orders available to invoice (priced, not cancelled, not already on a live invoice). */
adminRouter.get(
  "/uninvoiced-orders",
  asyncHandler(async (req, res) => {
    const f = z.object({ customerId: z.string().max(40).optional(), companyId: z.string().max(40).optional() }).parse(req.query);
    const rows = await prisma.order.findMany({
      where: {
        status: { not: "CANCELLED" },
        retailCents: { not: null },
        invoiceLines: { none: { invoice: { status: { not: "VOID" } } } },
        ...(f.companyId ? { companyId: f.companyId } : f.customerId ? { customerId: f.customerId } : {}),
      },
      orderBy: { serviceDate: "desc" },
      take: 300,
      include: { customer: { select: { id: true, name: true, email: true } }, company: { select: { id: true, name: true } }, payments: { where: { status: "SUCCEEDED" } } },
    });
    res.json({
      ok: true,
      orders: rows.map((o) => ({ id: o.id, reference: o.reference, status: o.status, serviceType: o.serviceType, serviceDate: o.serviceDate, customerId: o.customer.id, customer: o.customer.name, company: o.company?.name ?? null, companyId: o.company?.id ?? null, retailCents: o.retailCents, paidCents: o.payments.reduce((s, p) => s + (p.kind === "REFUND" ? -p.amountCents : p.amountCents), 0), poNumber: o.poNumber, paymentStatus: o.paymentStatus })),
    });
  }),
);

adminRouter.post(
  "/invoices",
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        orderIds: z.array(z.string().max(40)).max(200).default([]),
        customerId: z.string().max(40).optional(),
        extraLines: z.array(z.object({ description: z.string().min(1).max(300), quantity: z.number().positive().max(10000), unitCents: z.number().int().min(-100_000_000).max(100_000_000) })).max(50).optional(),
        poNumber: z.string().max(60).nullish(),
        costCenter: z.string().max(60).nullish(),
        notes: z.string().max(2000).nullish(),
        send: z.boolean().default(false),
        dueDays: z.number().int().min(0).max(180).optional(),
      })
      .parse(req.body);
    let inv = await createInvoice(b);
    if (b.send) inv = await issueInvoice(inv.id, { dueDays: b.dueDays });
    await audit(req, "create", "invoice", inv.id, { number: inv.number, orders: b.orderIds.length, sent: b.send });
    res.status(201).json({ ok: true, invoice: inv });
  }),
);

adminRouter.post(
  "/invoices/:id/send",
  asyncHandler(async (req, res) => {
    const b = z.object({ dueDays: z.number().int().min(0).max(180).optional(), email: z.boolean().default(true) }).parse(req.body ?? {});
    const inv = await issueInvoice(String(req.params.id), b);
    await audit(req, "send", "invoice", inv.id);
    res.json({ ok: true, invoice: inv });
  }),
);

adminRouter.post(
  "/invoices/:id/void",
  requireRole("ACCOUNTING"),
  asyncHandler(async (req, res) => {
    await voidInvoice(String(req.params.id));
    await audit(req, "void", "invoice", String(req.params.id));
    res.json({ ok: true });
  }),
);

adminRouter.post(
  "/invoices/:id/sync",
  asyncHandler(async (req, res) => {
    const status = await syncInvoice(String(req.params.id), { force: true });
    await audit(req, "sync", "invoice", String(req.params.id), { status });
    res.json({ ok: true, status });
  }),
);

adminRouter.get(
  "/invoices/:id/pdf",
  asyncHandler(async (req, res) => {
    const inv = await prisma.invoice.findUnique({ where: { id: String(req.params.id) }, select: { id: true, number: true } });
    if (!inv) throw new HttpError(404, "Invoice not found.");
    const pdf = await renderInvoicePdf(inv.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${inv.number}.pdf"`);
    res.send(Buffer.from(pdf));
  }),
);

adminRouter.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const f = z.object({ status: z.string().max(20).optional(), kind: z.string().max(20).optional() }).parse(req.query);
    const rows = await prisma.payment.findMany({
      where: { ...(f.status ? { status: f.status } : {}), ...(f.kind ? { kind: f.kind } : {}) },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { order: { select: { reference: true, customer: { select: { name: true } } } }, invoice: { select: { number: true, customer: { select: { name: true } } } }, quotation: { select: { reference: true } } },
    });
    res.json({
      ok: true,
      payments: rows.map((p) => ({ id: p.id, method: p.method, kind: p.kind, status: p.status, amountCents: p.amountCents, orderReference: p.order?.reference ?? null, invoiceNumber: p.invoice?.number ?? null, quotationReference: p.quotation?.reference ?? null, customer: p.order?.customer.name ?? p.invoice?.customer.name ?? null, note: p.note, recordedBy: p.recordedBy, createdAt: p.createdAt })),
    });
  }),
);

adminRouter.post(
  "/payments",
  requireRole("ACCOUNTING"),
  asyncHandler(async (req, res) => {
    const b = z.object({ method: z.enum(["check", "ach", "cash", "account"]), amountCents: z.number().int().min(1).max(100_000_000), invoiceId: z.string().max(40).optional(), orderId: z.string().max(40).optional(), note: z.string().max(500).optional() }).parse(req.body);
    const p = await recordManualPayment({ ...b, recordedBy: req.user!.email });
    await audit(req, "record", "payment", p.id, { method: b.method, amountCents: b.amountCents });
    res.status(201).json({ ok: true, payment: p });
  }),
);

adminRouter.post(
  "/payments/:id/refund",
  requireRole("ACCOUNTING"),
  asyncHandler(async (req, res) => {
    const b = z.object({ amountCents: z.number().int().min(1).max(100_000_000).optional(), note: z.string().max(500).optional() }).parse(req.body ?? {});
    const r = await refundPayment(String(req.params.id), b.amountCents, req.user!.email, b.note);
    await audit(req, "refund", "payment", String(req.params.id), { refundId: r.id, amountCents: r.amountCents });
    res.status(201).json({ ok: true, refund: r });
  }),
);

adminRouter.get(
  "/aging",
  asyncHandler(async (_req, res) => {
    await refreshOverdue();
    res.json({ ok: true, aging: await agingReport() });
  }),
);

adminRouter.get(
  "/aging.csv",
  asyncHandler(async (_req, res) => {
    const a = await agingReport();
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="express-bags-aging.csv"');
    res.send(csv([["Customer", "Balance", "Current", "1-30", "31-60", "61-90", "90+"], ...a.customers.map((c) => [c.name, dollars(c.balanceCents), dollars(c.buckets.current), dollars(c.buckets["1-30"]), dollars(c.buckets["31-60"]), dollars(c.buckets["61-90"]), dollars(c.buckets["90+"])])]));
  }),
);

adminRouter.get(
  "/cancellation-rules",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, rules: await getCancellationRules() });
  }),
);

adminRouter.put(
  "/cancellation-rules",
  requireRole(),
  asyncHandler(async (req, res) => {
    const rules = await saveCancellationRules(req.body, req.user!.email);
    await audit(req, "update", "setting", "cancellationRules", rules);
    res.json({ ok: true, rules });
  }),
);

adminRouter.get(
  "/orders/:id/refund-suggestion",
  asyncHandler(async (req, res) => {
    const s = await refundSuggestion(String(req.params.id));
    if (!s) throw new HttpError(404, "Order not found.");
    const payments = await prisma.payment.findMany({ where: { orderId: String(req.params.id), status: "SUCCEEDED", kind: { not: "REFUND" } }, select: { id: true, amountCents: true, method: true, kind: true } });
    res.json({ ok: true, ...s, payments });
  }),
);

/** Daily housekeeping (overdue invoices, expired quotations). Safe to call repeatedly (cron or button). */
adminRouter.post(
  "/jobs/daily",
  requireRole(),
  asyncHandler(async (req, res) => {
    const [overdue, expired] = await Promise.all([refreshOverdue(), expireQuotations()]);
    await audit(req, "run", "billing-daily", undefined, { overdue, expired });
    res.json({ ok: true, overdue, expired });
  }),
);

/* --------------------------------- Public --------------------------------- */

const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.PUBLIC_RATE_LIMIT || 60), standardHeaders: "draft-8", legacyHeaders: false, message: { ok: false, error: "Too many requests. Please wait a few minutes." } });
publicRouter.use(publicLimiter);

const TOKEN_RE = /^[2-9A-HJ-NP-Z]{32}$/;
async function invoiceByToken(token: string) {
  if (!TOKEN_RE.test(token)) throw new HttpError(404, "This invoice link is not valid.");
  const inv = await prisma.invoice.findUnique({ where: { publicToken: token }, include: { lines: { orderBy: { sortOrder: "asc" } }, customer: { select: { name: true, email: true } }, company: { select: { name: true } } } });
  if (!inv || inv.status === "DRAFT") throw new HttpError(404, "This invoice link is not valid.");
  return inv;
}

publicRouter.get(
  "/invoice/:token",
  asyncHandler(async (req, res) => {
    await refreshOverdue();
    const inv = await invoiceByToken(String(req.params.token));
    res.setHeader("Cache-Control", "no-store");
    res.json(
      stripInternal({
        ok: true,
        invoice: {
          number: inv.number,
          status: inv.status,
          issuedAt: inv.issuedAt,
          dueAt: inv.dueAt,
          billTo: { name: inv.customer.name, company: inv.company?.name ?? null },
          poNumber: inv.poNumber,
          costCenter: inv.costCenter,
          lines: inv.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitCents: l.unitCents, totalCents: l.totalCents })),
          subtotalCents: inv.subtotalCents,
          taxCents: inv.taxCents,
          totalCents: inv.totalCents,
          paidCents: inv.paidCents,
          balanceCents: Math.max(0, inv.totalCents - inv.paidCents),
          notes: inv.notes,
        },
      }),
    );
  }),
);

publicRouter.get(
  "/invoice/:token/pdf",
  asyncHandler(async (req, res) => {
    const inv = await invoiceByToken(String(req.params.token));
    const pdf = await renderInvoicePdf(inv.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${inv.number}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(Buffer.from(pdf));
  }),
);

publicRouter.post(
  "/invoice/:token/checkout",
  asyncHandler(async (req, res) => {
    const inv = await invoiceByToken(String(req.params.token));
    if (inv.status === "VOID") throw new HttpError(409, "This invoice was cancelled.");
    const balance = inv.totalCents - inv.paidCents;
    if (balance <= 0) throw new HttpError(409, "This invoice is already paid. Thank you.");
    const r = await startCheckout({ kind: "PAYMENT", invoiceId: inv.id }, balance, `Invoice ${inv.number}`, inv.customer.email, `/invoice/${String(req.params.token)}`);
    res.json({ ok: true, checkoutUrl: r.url });
  }),
);

/** Payment status for the post-checkout page (by session reference; no personal data). */
publicRouter.get(
  "/status/:session",
  asyncHandler(async (req, res) => {
    const p = await prisma.payment.findUnique({ where: { providerRef: String(req.params.session).slice(0, 200) }, select: { status: true, kind: true, amountCents: true } });
    if (!p) throw new HttpError(404, "Payment not found.");
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, status: p.status, kind: p.kind, amountCents: p.amountCents });
  }),
);

publicRouter.post(
  "/instant-quote",
  asyncHandler(async (req, res) => {
    const r = quoteRequestSchema.parse(req.body);
    res.json(stripInternal(await instantQuote(r)));
  }),
);

publicRouter.post(
  "/instant-book",
  asyncHandler(async (req, res) => {
    const { request, priceToken, acceptName } = z.object({ request: z.unknown(), priceToken: z.string().min(10).max(2000), acceptName: z.string().trim().min(2).max(120) }).parse(req.body);
    const r = await instantBook(quoteRequestSchema.parse(request), priceToken, { name: acceptName, ip: req.ip, userAgent: req.get("user-agent") });
    res.status(201).json(r);
  }),
);

/* Dev/test-only mock checkout (never available in production or when Stripe is connected) */
const mockAllowed = () => !isProd && payments().name === "mock";

publicRouter.get(
  "/mock/:session",
  asyncHandler(async (req, res) => {
    if (!mockAllowed()) throw new HttpError(404, "Not found.");
    const p = await prisma.payment.findUnique({ where: { providerRef: String(req.params.session) }, include: { invoice: { select: { number: true, publicToken: true } }, quotation: { select: { reference: true, publicToken: true } }, order: { select: { reference: true } } } });
    if (!p) throw new HttpError(404, "Checkout session not found.");
    const description = p.invoice ? `Invoice ${p.invoice.number}` : p.quotation ? `Deposit for quotation ${p.quotation.reference}` : p.order ? `Order ${p.order.reference}` : "Express Bags payment";
    const returnPath = p.invoice ? `/invoice/${p.invoice.publicToken}` : p.quotation ? `/q/${p.quotation.publicToken}` : `/pay/status`;
    res.json({ ok: true, session: p.providerRef, status: p.status, kind: p.kind, amountCents: p.amountCents, description, returnPath });
  }),
);

publicRouter.post(
  "/mock/:session/complete",
  asyncHandler(async (req, res) => {
    if (!mockAllowed()) throw new HttpError(404, "Not found.");
    const outcome = z.object({ outcome: z.enum(["succeeded", "failed"]).default("succeeded") }).parse(req.body ?? {}).outcome;
    if (outcome === "failed") await markCheckoutFailed(String(req.params.session));
    else await markCheckoutSucceeded(String(req.params.session));
    res.json({ ok: true });
  }),
);

/* --------------------------------- Webhook -------------------------------- */

let stripeUtil: Stripe | null = null;
const webhooks = () => (stripeUtil ??= new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder")).webhooks;

webhookRouter.post(
  "/",
  express.raw({ type: "*/*", limit: "1mb" }),
  asyncHandler(async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(503, "Stripe webhooks are not configured.");
    let event: Stripe.Event;
    try {
      event = webhooks().constructEvent(req.body as Buffer, String(req.get("stripe-signature") ?? ""), secret);
    } catch {
      throw new HttpError(400, "Invalid signature.");
    }
    // De-duplicate: Stripe retries deliveries
    try {
      await prisma.webhookEvent.create({ data: { provider: "stripe", eventId: event.id, type: event.type, payload: JSON.parse(JSON.stringify(event)) } });
    } catch {
      return res.json({ ok: true, duplicate: true });
    }
    try {
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.payment_status === "paid") await markCheckoutSucceeded(s.id);
      } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
        await markCheckoutFailed((event.data.object as Stripe.Checkout.Session).id);
      }
      await prisma.webhookEvent.update({ where: { provider_eventId: { provider: "stripe", eventId: event.id } }, data: { processedAt: new Date() } });
    } catch (e) {
      await prisma.webhookEvent.update({ where: { provider_eventId: { provider: "stripe", eventId: event.id } }, data: { error: (e as Error).message.slice(0, 500) } });
      // Ask Stripe to retry later
      return res.status(500).json({ ok: false });
    }
    res.json({ ok: true });
  }),
);

export const platformModule: PlatformModule = {
  name: "billing",
  routes: [
    { scope: "admin", path: "/billing", router: adminRouter },
    { scope: "public", path: "/pay", router: publicRouter },
    { scope: "webhook", path: "/webhooks/stripe", router: webhookRouter },
  ],
};
