/**
 * Quotations module.
 *  Admin  /v1/admin/quotations  — list, detail, create (blank or from a quote request), update/revise,
 *                                 duplicate, send, PDF, engine suggestion, expire. OWNER/STAFF.
 *  Public /v1/q/:token          — customer view, PDF, accept (electronic acceptance), decline, deposit checkout.
 * Public responses never contain cost, unit cost or margin (stripInternal is applied as a second guard).
 */
import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { QuoteRequest } from "@/lib/quote-schema";
import { audit, requireAuth, requireRole } from "../../auth";
import { prisma } from "../../db";
import { decideRoute } from "../../engines/decision-engine";
import { priceLocal } from "../../engines/pricing/local";
import { priceStorage } from "../../engines/pricing/storage";
import type { Prisma } from "../../generated/prisma/client";
import { asyncHandler, HttpError } from "../../lib/errors";
import { LUGGAGE_CATEGORY_LABELS } from "@/lib/quote-schema";
import { markets } from "@/content/site";
import { maps } from "../../providers/registry";
import { getActiveRules, getSetting } from "../../settings";
import { LINE_KINDS, quotationMath, stripInternal, type LineInput } from "../billing/money";
import { renderQuotationPdf } from "../billing/pdf";
import type { PlatformModule } from "../types";
import {
  acceptQuotation,
  createQuotation,
  declineQuotation,
  depositCheckout,
  detailsFromQuoteRequest,
  duplicateQuotation,
  expireQuotations,
  publicQuotationView,
  quotationByToken,
  sendQuotation,
  updateQuotation,
} from "./service";

export const adminRouter = Router();
export const publicRouter = Router();

/** Engine labels use internal codes (market slugs, categories); make them customer-ready. */
export function humanizeLabel(label: string) {
  let out = label;
  for (const m of markets) out = out.replace(new RegExp(`\\b${m.slug}\\b`, "g"), m.name);
  for (const [k, v] of Object.entries(LUGGAGE_CATEGORY_LABELS)) out = out.replace(new RegExp(`\\b${k}\\b`, "g"), v.split(" (")[0].toLowerCase());
  out = out.replace(/\bcruise-port\b/g, "cruise port").replace(/\bprivate-aviation\b/g, "private aviation terminal").replace(/\bbox-(\d+)\b/g, "$1-ft box truck").replace(/\bcargo-van\b/g, "cargo van");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/* --------------------------------- Schemas -------------------------------- */

const lineSchema = z.object({
  kind: z.enum(LINE_KINDS),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive().max(100000),
  unit: z.string().max(30).nullish(),
  unitCents: z.number().int().min(0).max(100_000_000),
  unitCostCents: z.number().int().min(0).max(100_000_000).nullish(),
});

const locationSchema = z.object({ type: z.string().max(40), address: z.string().max(300), facility: z.string().max(80).nullish(), market: z.string().max(60), notes: z.string().max(500).nullish() }).passthrough();

const detailsSchema = z.object({
  serviceType: z.string().max(60),
  fulfillment: z.enum(["local", "nationwide", "storage", "custom"]).optional(),
  pickup: locationSchema,
  delivery: locationSchema,
  extraStops: z.array(locationSchema).max(20).optional(),
  serviceDate: z.string().min(8).max(40),
  timeWindow: z.string().max(40).nullish(),
  market: z.string().max(60),
  items: z.array(z.object({ category: z.string().max(40), quantity: z.number().int().min(1).max(5000), description: z.string().max(200).optional(), weightLbs: z.number().min(0).optional(), lengthIn: z.number().min(0).optional(), widthIn: z.number().min(0).optional(), heightIn: z.number().min(0).optional() })).min(1).max(100),
  poNumber: z.string().max(60).nullish(),
  costCenter: z.string().max(60).nullish(),
});

const quotationSchema = z.object({
  title: z.string().trim().min(3).max(200),
  scope: z.string().max(5000).nullish(),
  terms: z.string().max(8000).nullish(),
  validUntil: z.string().max(40).nullish(),
  depositType: z.enum(["none", "percent", "flat"]).default("none"),
  depositValue: z.number().min(0).max(100_000_000).default(0),
  lines: z.array(lineSchema).min(1).max(100),
  details: detailsSchema,
});

/* ---------------------------------- Admin --------------------------------- */

adminRouter.use(asyncHandler(async (req, res, next) => requireAuth(req, res, next)));
adminRouter.use(requireRole("STAFF"));

adminRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await expireQuotations();
    const f = z.object({ status: z.string().max(20).optional(), q: z.string().max(100).optional(), quoteRequestId: z.string().max(40).optional() }).parse(req.query);
    const where: Prisma.QuotationWhereInput = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.quoteRequestId ? { quoteRequestId: f.quoteRequestId } : {}),
      ...(f.q ? { OR: [{ reference: { contains: f.q, mode: "insensitive" } }, { title: { contains: f.q, mode: "insensitive" } }, { customer: { name: { contains: f.q, mode: "insensitive" } } }, { customer: { email: { contains: f.q, mode: "insensitive" } } }] } : {}),
    };
    const [rows, counts] = await Promise.all([
      prisma.quotation.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: { customer: { select: { name: true, email: true, company: { select: { name: true } } } }, order: { select: { reference: true } } } }),
      prisma.quotation.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    res.json({
      ok: true,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      quotations: rows.map((q) => ({
        id: q.id,
        reference: q.reference,
        title: q.title,
        status: q.status,
        source: q.source,
        customerName: q.customer.company?.name ? `${q.customer.name} · ${q.customer.company.name}` : q.customer.name,
        customerEmail: q.customer.email,
        totalCents: q.totalCents,
        costCents: q.costCents,
        marginPct: q.marginPct,
        depositCents: q.depositCents,
        validUntil: q.validUntil,
        sentAt: q.sentAt,
        acceptedAt: q.acceptedAt,
        orderReference: q.order?.reference ?? null,
        createdAt: q.createdAt,
      })),
    });
  }),
);

/** Builder prefill from a quote request (customer, route, items). */
adminRouter.get(
  "/prefill/:quoteRequestId",
  asyncHandler(async (req, res) => {
    const qr = await prisma.quoteRequest.findUnique({ where: { id: String(req.params.quoteRequestId) }, include: { customer: true } });
    if (!qr) throw new HttpError(404, "Quote request not found.");
    const p = qr.payload as unknown as QuoteRequest;
    res.json({
      ok: true,
      customer: { id: qr.customer.id, name: qr.customer.name, email: qr.customer.email },
      quoteRequest: { id: qr.id, reference: qr.reference, serviceType: qr.serviceType, route: qr.route, routeReasons: qr.routeReasons, notes: p.notes ?? "", specialHandling: p.specialHandling ?? "", accessNotes: p.accessNotes ?? "" },
      details: detailsFromQuoteRequest(qr),
      title: `${qr.serviceType.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase())} · ${new Date(p.serviceDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    });
  }),
);

/**
 * "Suggest from engine": runs the local/storage engine on the request and returns builder lines
 * (unit cost allocated proportionally from the engine's estimated cost). Staff edits before sending.
 */
adminRouter.post(
  "/suggest",
  asyncHandler(async (req, res) => {
    const { details } = z.object({ details: detailsSchema }).parse(req.body);
    const items = details.items.map((i) => ({ category: i.category as never, quantity: i.quantity }));
    const decision = decideRoute({ serviceType: details.serviceType as never, pickup: details.pickup as never, delivery: details.delivery as never, items: items as never, extraStops: (details.extraStops ?? []) as never }, await getSetting("thresholds"));
    let result;
    if (details.serviceType === "storage") {
      const start = new Date(details.serviceDate);
      result = priceStorage({ start, end: new Date(start.getTime() + 86400000), pieces: decision.totalPieces }, await getActiveRules("storage"));
    } else {
      const dist = await maps().distance(String(details.pickup.address), String(details.delivery.address));
      result = priceLocal(
        { pickupZone: details.pickup.market, deliveryZone: details.delivery.market, miles: dist.miles, pieces: items, pickupLocationType: details.pickup.type, deliveryLocationType: details.delivery.type, afterHours: details.timeWindow === "after-hours" },
        await getActiveRules("local"),
      );
    }
    const positive = result.lines.filter((l) => l.cents > 0);
    const posTotal = positive.reduce((s, l) => s + l.cents, 0) || 1;
    const lines: LineInput[] = result.lines.map((l) => {
      const kind: LineInput["kind"] = l.cents < 0 ? "discount" : /storage|day|hour/i.test(l.label) ? "storage" : /mi|distance|zone|trip|route/i.test(l.label) ? "transport" : /piece|bag|luggage|handling/i.test(l.label) ? "handling" : /truck|van|vehicle/i.test(l.label) ? "truck" : "other";
      return { kind, description: humanizeLabel(l.label), quantity: 1, unit: null, unitCents: Math.abs(l.cents), unitCostCents: l.cents > 0 ? Math.round((result.costCents * l.cents) / posTotal) : null };
    });
    res.json({ ok: true, decision, lines, engineNotes: result.notes, manualReview: result.manualReview, math: quotationMath(lines), distanceSource: "estimate" });
  }),
);

adminRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const q = await prisma.quotation.findUnique({
      where: { id },
      include: { lines: { orderBy: { sortOrder: "asc" } }, customer: { include: { company: true } }, order: { select: { id: true, reference: true, status: true, paymentStatus: true } }, payments: true, quoteRequest: { select: { id: true, reference: true } }, createdBy: { select: { email: true, name: true } } },
    });
    if (!q) throw new HttpError(404, "Quotation not found.");
    const [details, revisions, rules] = await Promise.all([
      prisma.quotationDetails.findUnique({ where: { quotationId: id } }),
      prisma.quotationRevision.findMany({ where: { quotationId: id }, orderBy: { version: "desc" }, select: { id: true, version: true, reason: true, createdBy: true, createdAt: true } }),
      getActiveRules("local"),
    ]);
    const lines: LineInput[] = q.lines.map((l) => ({ kind: l.kind as LineInput["kind"], description: l.description, quantity: l.quantity, unit: l.unit, unitCents: l.unitCents, unitCostCents: l.unitCostCents }));
    res.json({ ok: true, quotation: q, details, revisions, math: quotationMath(lines, { type: q.depositType as "none", value: q.depositValue }), guardrails: { minimumProfitCents: rules.minimumProfit, targetMarginPercent: 100 - rules.estimatedCostPercent } });
  }),
);

adminRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = quotationSchema.extend({ customerId: z.string().min(1).max(40), quoteRequestId: z.string().max(40).nullish() }).parse(req.body);
    const q = await createQuotation(body, req.user!.id);
    await audit(req, "create", "quotation", q.id, { reference: q.reference });
    res.status(201).json({ ok: true, quotation: q });
  }),
);

/** Quick customer creation from the builder (blank quotations). */
adminRouter.post(
  "/customers",
  asyncHandler(async (req, res) => {
    const b = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(200), phone: z.string().max(40).optional(), company: z.string().max(200).optional() }).parse(req.body);
    const email = b.email.toLowerCase();
    const company = b.company ? await prisma.company.create({ data: { name: b.company } }) : null;
    const c = await prisma.customer.upsert({ where: { email }, update: { name: b.name, phone: b.phone }, create: { name: b.name, email, phone: b.phone, companyId: company?.id } });
    await audit(req, "upsert", "customer", c.id);
    res.status(201).json({ ok: true, customer: { id: c.id, name: c.name, email: c.email } });
  }),
);

adminRouter.get(
  "/customers/search",
  asyncHandler(async (req, res) => {
    const q = z.string().max(100).parse(req.query.q ?? "");
    const rows = await prisma.customer.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { company: { name: { contains: q, mode: "insensitive" } } }] } : {},
      take: 10,
      orderBy: { updatedAt: "desc" },
      include: { company: { select: { name: true } } },
    });
    res.json({ ok: true, customers: rows.map((c) => ({ id: c.id, name: c.name, email: c.email, company: c.company?.name ?? null })) });
  }),
);

adminRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = quotationSchema.extend({ reason: z.string().max(300).optional() }).parse(req.body);
    const q = await updateQuotation(String(req.params.id), body, req.user!, body.reason);
    await audit(req, "update", "quotation", q.id, { status: q.status });
    res.json({ ok: true, quotation: q });
  }),
);

adminRouter.post(
  "/:id/duplicate",
  asyncHandler(async (req, res) => {
    const q = await duplicateQuotation(String(req.params.id), req.user!.id);
    await audit(req, "duplicate", "quotation", q.id, { from: req.params.id });
    res.status(201).json({ ok: true, quotation: q });
  }),
);

adminRouter.post(
  "/:id/send",
  asyncHandler(async (req, res) => {
    const r = await sendQuotation(String(req.params.id));
    await audit(req, "send", "quotation", r.quotation.id, { emailStatus: r.emailStatus });
    res.json({ ok: true, quotation: r.quotation, emailStatus: r.emailStatus, link: r.link });
  }),
);

adminRouter.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    const q = await prisma.quotation.findUnique({ where: { id: String(req.params.id) }, select: { id: true, reference: true } });
    if (!q) throw new HttpError(404, "Quotation not found.");
    const pdf = await renderQuotationPdf(q.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${q.reference}.pdf"`);
    res.send(Buffer.from(pdf));
  }),
);

/* --------------------------------- Public --------------------------------- */

const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.PUBLIC_RATE_LIMIT || 60), standardHeaders: "draft-8", legacyHeaders: false, message: { ok: false, error: "Too many requests. Please wait a few minutes." } });
publicRouter.use(publicLimiter);
const meta = (req: Request) => ({ ip: req.ip, userAgent: req.get("user-agent") });

publicRouter.get(
  "/:token",
  asyncHandler(async (req, res) => {
    const { q, details } = await quotationByToken(String(req.params.token));
    res.setHeader("Cache-Control", "no-store");
    res.json(stripInternal({ ok: true, quotation: publicQuotationView(q, details) }));
  }),
);

publicRouter.get(
  "/:token/pdf",
  asyncHandler(async (req, res) => {
    const { q } = await quotationByToken(String(req.params.token));
    const pdf = await renderQuotationPdf(q.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${q.reference}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(Buffer.from(pdf));
  }),
);

publicRouter.post(
  "/:token/accept",
  asyncHandler(async (req, res) => {
    const b = z.object({ name: z.string().trim().min(2).max(120), title: z.string().trim().max(120).optional(), agree: z.literal(true, { message: "Please confirm you agree to the quotation and terms." }) }).parse(req.body);
    const r = await acceptQuotation(String(req.params.token), { name: b.name, title: b.title, ...meta(req) });
    const { q } = await quotationByToken(String(req.params.token));
    res.json({ ok: true, orderReference: r.orderReference, depositDue: q.depositCents > 0 && !q.payments.some((p) => p.kind === "DEPOSIT" && p.status === "SUCCEEDED") });
  }),
);

publicRouter.post(
  "/:token/decline",
  asyncHandler(async (req, res) => {
    const b = z.object({ reason: z.string().trim().min(2).max(1000) }).parse(req.body);
    await declineQuotation(String(req.params.token), b.reason);
    res.json({ ok: true });
  }),
);

publicRouter.post(
  "/:token/deposit",
  asyncHandler(async (req, res) => {
    const r = await depositCheckout(String(req.params.token));
    res.json({ ok: true, checkoutUrl: r.url });
  }),
);

export const platformModule: PlatformModule = {
  name: "quotations",
  routes: [
    { scope: "admin", path: "/quotations", router: adminRouter },
    { scope: "public", path: "/q", router: publicRouter },
  ],
};
