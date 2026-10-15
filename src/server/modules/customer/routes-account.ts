/**
 * Customer portal data: /v1/account/* (requires an active portal session).
 * Every query is scoped to the signed-in customer, or to their company for COMPANY_ADMIN / CONCIERGE.
 * Records outside the scope always answer 404 (never 403) so ids cannot be probed.
 * Internal economics (cost, margin, pricing breakdown, internal notes) never leave this API.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { contact } from "@/content/site";
import { LOCATION_TYPES, MARKET_OPTIONS, quoteRequestSchema, type QuoteRequest } from "@/lib/quote-schema";
import { prisma } from "../../db";
import type { OrderStatus } from "../../generated/prisma/client";
import { env } from "../../lib/env";
import { asyncHandler, HttpError } from "../../lib/errors";
import { parseMultipart, storeUpload } from "../../lib/multipart";
import { STATUS_LABEL } from "../../services/orders";
import { createQuote } from "../../services/quotes";
import { auditCustomer, ownedWhere, quotationWhere, requirePortal, seesCompany } from "./access";
import { draftFromOrder, draftFromQuote } from "./drafts";

export const accountRouter = Router();
accountRouter.use(requirePortal);

const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.PUBLIC_RATE_LIMIT || 60), standardHeaders: "draft-8", legacyHeaders: false, message: { ok: false, error: "Too many requests. Please wait a few minutes." } });

/** Statuses after which the assigned driver's first name may be shown to the booked customer. */
const ASSIGNED_STATES: OrderStatus[] = ["DRIVER_ASSIGNED", "EN_ROUTE", "PICKED_UP", "AT_FACILITY", "OUT_FOR_DELIVERY", "DELIVERED"];
const ACTIVE_STATES: OrderStatus[] = ["CONFIRMED", "DRIVER_ASSIGNED", "EN_ROUTE", "PICKED_UP", "AT_FACILITY", "TRANSFERRED_TO_CARRIER", "IN_TRANSIT", "OUT_FOR_DELIVERY"];

/** Public order fields (no cost/margin/internal notes). */
const ORDER_SELECT = {
  id: true, reference: true, status: true, serviceType: true, fulfillment: true, pickup: true, delivery: true, extraStops: true,
  serviceDate: true, timeWindow: true, market: true, priority: true, specialHandling: true, accessNotes: true, customerNotes: true,
  poNumber: true, costCenter: true, guestName: true, guestRoom: true, retailCents: true, depositCents: true, paymentStatus: true,
  completedAt: true, cancelledAt: true, createdAt: true, customerId: true,
} as const;

const loadCustomer = (id: string) => prisma.customer.findUniqueOrThrow({ where: { id }, include: { company: true } });

/* --------------------------------- Me ----------------------------------- */
accountRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const c = await loadCustomer(req.customer!.id);
    res.json({
      ok: true,
      customer: {
        id: c.id, name: c.name, email: c.email, phone: c.phone, language: c.language, marketingOptIn: c.marketingOptIn,
        accountRole: c.accountRole, defaultCostCenter: c.defaultCostCenter, emailVerifiedAt: c.emailVerifiedAt,
        company: c.company
          ? { id: c.company.id, name: c.company.name, accountType: c.company.accountType, accountStatus: c.company.accountStatus, poRequired: c.company.poRequired, billingEmail: c.company.billingEmail, paymentTermsDays: c.company.paymentTermsDays }
          : null,
      },
      office: { phone: contact.phoneDisplay, phoneHref: contact.phoneHref },
    });
  }),
);

accountRouter.patch(
  "/me",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        phone: z.string().trim().min(7).max(40).optional(),
        language: z.enum(["en", "es"]).optional(),
        marketingOptIn: z.boolean().optional(),
        defaultCostCenter: z.string().trim().max(80).optional().or(z.literal("")),
      })
      .parse(req.body);
    const c = await prisma.customer.update({ where: { id: req.customer!.id }, data: { ...body, defaultCostCenter: body.defaultCostCenter === "" ? null : body.defaultCostCenter } });
    await auditCustomer(c, "update-profile", "customer", c.id, { fields: Object.keys(body) });
    res.json({ ok: true });
  }),
);

/* ------------------------------- Dashboard ------------------------------- */
accountRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const c = req.customer!;
    const scope = ownedWhere(c);
    const [active, upcomingCount, quotes, quotations, invoices, deliveredCount] = await Promise.all([
      prisma.order.findMany({ where: { ...scope, status: { in: ACTIVE_STATES } }, orderBy: { serviceDate: "asc" }, take: 6, select: { id: true, reference: true, status: true, serviceType: true, serviceDate: true, timeWindow: true, pickup: true, delivery: true, guestName: true } }),
      prisma.order.count({ where: { ...scope, status: { in: ACTIVE_STATES } } }),
      prisma.quoteRequest.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, reference: true, serviceType: true, status: true, serviceDate: true, createdAt: true, route: true } }),
      prisma.quotation.findMany({ where: { ...quotationWhere(c), status: { in: ["SENT", "VIEWED"] } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, reference: true, title: true, totalCents: true, depositCents: true, validUntil: true, status: true, publicToken: true } }),
      prisma.invoice.findMany({ where: { ...scope, status: { in: ["SENT", "PARTIAL", "OVERDUE"] } }, orderBy: { dueAt: "asc" }, take: 5, select: { id: true, number: true, status: true, totalCents: true, paidCents: true, dueAt: true, publicToken: true } }),
      prisma.order.count({ where: { ...scope, status: "DELIVERED" } }),
    ]);
    res.json({
      ok: true,
      stats: { activeOrders: upcomingCount, openQuotations: quotations.length, openInvoices: invoices.length, completedOrders: deliveredCount },
      activeOrders: active.map((o) => ({ ...o, statusLabel: STATUS_LABEL[o.status] })),
      quotes,
      quotations,
      invoices,
    });
  }),
);

/* --------------------------------- Orders -------------------------------- */
accountRouter.get(
  "/orders",
  asyncHandler(async (req, res) => {
    const q = z.object({ status: z.enum(["active", "completed", "cancelled", "all"]).default("all"), search: z.string().max(80).optional() }).parse(req.query);
    const statusWhere =
      q.status === "active" ? { status: { in: ACTIVE_STATES } } : q.status === "completed" ? { status: "DELIVERED" as OrderStatus } : q.status === "cancelled" ? { status: "CANCELLED" as OrderStatus } : {};
    const search = q.search ? { OR: [{ reference: { contains: q.search, mode: "insensitive" as const } }, { guestName: { contains: q.search, mode: "insensitive" as const } }, { poNumber: { contains: q.search, mode: "insensitive" as const } }] } : {};
    const orders = await prisma.order.findMany({
      where: { ...ownedWhere(req.customer!), ...statusWhere, ...search },
      orderBy: { serviceDate: "desc" },
      take: 100,
      select: { id: true, reference: true, status: true, serviceType: true, serviceDate: true, timeWindow: true, pickup: true, delivery: true, guestName: true, poNumber: true, _count: { select: { pieces: true } } },
    });
    res.json({ ok: true, orders: orders.map((o) => ({ ...o, statusLabel: STATUS_LABEL[o.status], pieceCount: o._count.pieces })) });
  }),
);

async function ownedOrder(req: { customer?: { id: string; companyId: string | null; accountRole: string; email: string; name: string } }, id: string) {
  const order = await prisma.order.findFirst({ where: { id, ...ownedWhere(req.customer!) }, select: { ...ORDER_SELECT, quoteId: true } });
  if (!order) throw new HttpError(404, "Order not found.");
  return order;
}

accountRouter.get(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const order = await ownedOrder(req, req.params.id as string);
    const [pieces, events, proofs, shipments, assignment, documents] = await Promise.all([
      prisma.orderPiece.findMany({ where: { orderId: order.id }, orderBy: { pieceId: "asc" }, select: { id: true, pieceId: true, category: true, description: true, status: true } }),
      prisma.orderEvent.findMany({ where: { orderId: order.id, customerVisible: true }, orderBy: { createdAt: "asc" }, select: { id: true, type: true, status: true, detail: true, createdAt: true, uploadIds: true } }),
      prisma.proofOfDelivery.findMany({ where: { orderId: order.id }, orderBy: { capturedAt: "asc" }, select: { id: true, kind: true, pieceCount: true, recipientName: true, signatureUploadId: true, photoUploadIds: true, conditionNotes: true, capturedAt: true } }),
      prisma.carrierShipment.findMany({ where: { orderId: order.id, status: { not: "VOIDED" } }, select: { id: true, carrier: true, ebServiceLevel: true, trackingNumber: true, status: true } }),
      ASSIGNED_STATES.includes(order.status)
        ? prisma.assignment.findFirst({ where: { orderId: order.id, role: "DRIVER", status: { not: "REMOVED" } }, orderBy: { assignedAt: "desc" }, select: { employee: { select: { firstName: true } } } })
        : Promise.resolve(null),
      prisma.customerDocument.findMany({ where: { orderId: order.id, customer: seesCompany(req.customer!) ? { companyId: req.customer!.companyId! } : { id: req.customer!.id } }, select: { id: true, title: true, uploadId: true, createdAt: true } }),
    ]);
    res.json({
      ok: true,
      order: { ...order, statusLabel: STATUS_LABEL[order.status] },
      pieces,
      timeline: events.map((e) => ({ ...e, label: e.status ? STATUS_LABEL[e.status] : e.detail })),
      proofs,
      // Carrier numbers are labeled separately from the Express Bags reference (client rule).
      carrierTracking: shipments,
      // Privacy rule: only the booked customer, only after assignment, only a first name + dispatch contact.
      driver: assignment ? { firstName: assignment.employee.firstName, contactVia: `Express Bags dispatch ${contact.phoneDisplay}`, phoneHref: contact.phoneHref } : null,
      documents,
    });
  }),
);

/** Repeat booking: a quote-wizard draft built from the order (or its original request). */
accountRouter.get(
  "/orders/:id/repeat-draft",
  asyncHandler(async (req, res) => {
    const order = await ownedOrder(req, req.params.id as string);
    const c = await loadCustomer(req.customer!.id);
    if (order.quoteId) {
      const q = await prisma.quoteRequest.findUnique({ where: { id: order.quoteId }, select: { payload: true } });
      const parsed = quoteRequestSchema.safeParse({ ...(q?.payload as object), acceptsProhibitedItemsPolicy: true, consentToContact: true });
      if (parsed.success) {
        const draft = draftFromQuote(parsed.data);
        return res.json({ ok: true, draft: { ...draft, contact: { ...draft.contact, name: c.name, email: c.email, phone: c.phone ?? draft.contact.phone } } });
      }
    }
    const pieces = await prisma.orderPiece.findMany({ where: { orderId: order.id }, select: { category: true, description: true, weightLbs: true, lengthIn: true, widthIn: true, heightIn: true } });
    const full = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { serviceType: true, pickup: true, delivery: true, extraStops: true, timeWindow: true, accessNotes: true, specialHandling: true } });
    res.json({ ok: true, draft: draftFromOrder({ ...full, pieces }, { name: c.name, email: c.email, phone: c.phone, company: c.company?.name }) });
  }),
);

/** Download a file attached to an owned order (POD signature/photos, customer-visible event photos, order documents). */
accountRouter.get(
  "/orders/:id/files/:uploadId",
  asyncHandler(async (req, res) => {
    const order = await ownedOrder(req, req.params.id as string);
    const uploadId = req.params.uploadId as string;
    const [proof, event, doc] = await Promise.all([
      prisma.proofOfDelivery.findFirst({ where: { orderId: order.id, OR: [{ signatureUploadId: uploadId }, { photoUploadIds: { has: uploadId } }] }, select: { id: true } }),
      prisma.orderEvent.findFirst({ where: { orderId: order.id, customerVisible: true, uploadIds: { has: uploadId } }, select: { id: true } }),
      prisma.customerDocument.findFirst({ where: { orderId: order.id, uploadId }, select: { id: true } }),
    ]);
    if (!proof && !event && !doc) throw new HttpError(404, "File not found.");
    await sendUpload(res, uploadId, req.query.download === "1");
  }),
);

async function sendUpload(res: import("express").Response, uploadId: string, asAttachment: boolean) {
  const up = await prisma.upload.findUnique({ where: { id: uploadId } });
  const path = up ? join(resolve(env.uploadDir), up.storedName) : "";
  if (!up || !existsSync(path)) throw new HttpError(404, "File not found.");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.type(up.mimeType);
  if (asAttachment || !/^image\/|application\/pdf/.test(up.mimeType)) res.attachment(up.originalName);
  res.sendFile(path);
}

/* --------------------------- Quotes & quotations ------------------------- */
accountRouter.get(
  "/quotes",
  asyncHandler(async (req, res) => {
    const c = req.customer!;
    const [requests, quotations] = await Promise.all([
      prisma.quoteRequest.findMany({ where: ownedWhere(c), orderBy: { createdAt: "desc" }, take: 100, select: { id: true, reference: true, serviceType: true, status: true, route: true, serviceDate: true, pickupMarket: true, totalPieces: true, createdAt: true } }),
      prisma.quotation.findMany({
        where: { ...quotationWhere(c), status: { not: "DRAFT" } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, reference: true, title: true, status: true, totalCents: true, depositCents: true, validUntil: true, sentAt: true, acceptedAt: true, publicToken: true, order: { select: { id: true, reference: true } } },
      }),
    ]);
    res.json({
      ok: true,
      requests,
      // The acceptance link is only useful while the quotation is open
      quotations: quotations.map(({ publicToken, ...q }) => ({ ...q, acceptUrl: ["SENT", "VIEWED"].includes(q.status) ? `/q/${publicToken}` : null, viewUrl: `/q/${publicToken}` })),
    });
  }),
);

/** Signed-in quote submission (adds PO number / cost center for company accounts). */
accountRouter.post(
  "/quotes",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ request: quoteRequestSchema, poNumber: z.string().trim().max(60).optional().or(z.literal("")), costCenter: z.string().trim().max(80).optional().or(z.literal("")) })
      .parse(req.body);
    const c = await loadCustomer(req.customer!.id);
    const companyLinked = c.company && c.accountRole !== "INDIVIDUAL" ? c.company : null;
    if (companyLinked?.poRequired && !body.poNumber) throw new HttpError(400, "Your company requires a PO number on every request.", [{ path: "poNumber", message: "PO number required" }]);
    const result = await createQuote(
      { ...body.request, contact: { ...body.request.contact, email: c.email } } as QuoteRequest,
      { ip: req.ip, userAgent: req.get("user-agent") },
      { customerId: c.id, companyId: companyLinked?.id ?? null, extraPayload: { poNumber: body.poNumber || undefined, costCenter: body.costCenter || c.defaultCostCenter || undefined, portal: true }, actor: "portal" },
    );
    await auditCustomer(c, "create", "quote-request", result.reference);
    res.status(201).json({ ok: true, ...result });
  }),
);

/* ------------------------------- Invoices -------------------------------- */
accountRouter.get(
  "/invoices",
  asyncHandler(async (req, res) => {
    const [invoices, receipts] = await Promise.all([
      prisma.invoice.findMany({
        where: { ...ownedWhere(req.customer!), status: { not: "DRAFT" } },
        orderBy: { issuedAt: "desc" },
        take: 200,
        select: { id: true, number: true, status: true, issuedAt: true, dueAt: true, totalCents: true, paidCents: true, poNumber: true, publicToken: true },
      }),
      prisma.payment.findMany({
        where: { status: "SUCCEEDED", kind: { in: ["PAYMENT", "DEPOSIT"] }, OR: [{ invoice: ownedWhere(req.customer!) }, { order: ownedWhere(req.customer!) }] },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, kind: true, method: true, amountCents: true, createdAt: true, receiptUploadId: true, invoice: { select: { number: true } }, order: { select: { reference: true } } },
      }),
    ]);
    res.json({ ok: true, invoices: invoices.map(({ publicToken, ...i }) => ({ ...i, viewUrl: `/invoice/${publicToken}`, balanceCents: i.totalCents - i.paidCents })), receipts });
  }),
);

/** Invoice PDF: rendered by the billing module (src/server/modules/billing/pdf.ts → renderInvoicePdf). */
accountRouter.get(
  "/invoices/:id/pdf",
  asyncHandler(async (req, res) => {
    const inv = await prisma.invoice.findFirst({ where: { id: req.params.id as string, ...ownedWhere(req.customer!), status: { not: "DRAFT" } }, select: { id: true, number: true } });
    if (!inv) throw new HttpError(404, "Invoice not found.");
    const spec = "../billing/pdf";
    const mod = (await import(/* @vite-ignore */ spec).catch(() => null)) as { renderInvoicePdf?: (id: string) => Promise<Uint8Array | Buffer> } | null;
    if (!mod?.renderInvoicePdf) throw new HttpError(501, "Invoice PDFs are not available yet. Please use the online invoice view or call our office.");
    const pdf = await mod.renderInvoicePdf(inv.id);
    res.setHeader("Cache-Control", "private, no-store");
    res.type("application/pdf").attachment(`${inv.number}.pdf`).send(Buffer.from(pdf));
  }),
);

/** Payment receipt file (when the billing module attached one). */
accountRouter.get(
  "/receipts/:paymentId/file",
  asyncHandler(async (req, res) => {
    const p = await prisma.payment.findFirst({
      where: { id: req.params.paymentId as string, status: "SUCCEEDED", OR: [{ invoice: ownedWhere(req.customer!) }, { order: ownedWhere(req.customer!) }] },
      select: { receiptUploadId: true },
    });
    if (!p?.receiptUploadId) throw new HttpError(404, "Receipt not found.");
    await sendUpload(res, p.receiptUploadId, true);
  }),
);

/* ---------------------------- Saved addresses ---------------------------- */
const addressSchema = z.object({
  label: z.string().trim().min(2).max(80),
  type: z.enum(LOCATION_TYPES),
  address: z.string().trim().min(3).max(300),
  facility: z.string().trim().max(80).optional().or(z.literal("")),
  market: z.enum(MARKET_OPTIONS),
  contactName: z.string().trim().max(120).optional().or(z.literal("")),
  contactPhone: z.string().trim().max(40).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  /** Save for the whole company (company admins / concierge desks only) */
  shared: z.boolean().optional(),
});

const addressScope = (c: NonNullable<import("express").Request["customer"]>) =>
  c.companyId ? { OR: [{ customerId: c.id }, { companyId: c.companyId }] } : { customerId: c.id };

accountRouter.get(
  "/addresses",
  asyncHandler(async (req, res) => {
    const rows = await prisma.savedAddress.findMany({ where: addressScope(req.customer!), orderBy: { label: "asc" } });
    res.json({ ok: true, addresses: rows.map((a) => ({ ...a, shared: !!a.companyId, editable: !a.companyId || seesCompany(req.customer!) })) });
  }),
);

accountRouter.post(
  "/addresses",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const c = req.customer!;
    const { shared, ...body } = addressSchema.parse(req.body);
    if (shared && !seesCompany(c)) throw new HttpError(403, "Only company administrators can save shared company locations.");
    const count = await prisma.savedAddress.count({ where: shared ? { companyId: c.companyId! } : { customerId: c.id } });
    if (count >= 200) throw new HttpError(400, "You have reached the saved-location limit.");
    const row = await prisma.savedAddress.create({ data: { ...body, ...(shared ? { companyId: c.companyId! } : { customerId: c.id }) } });
    res.status(201).json({ ok: true, address: row });
  }),
);

async function editableAddress(c: NonNullable<import("express").Request["customer"]>, id: string) {
  const a = await prisma.savedAddress.findFirst({ where: { id, ...addressScope(c) } });
  if (!a) throw new HttpError(404, "Saved location not found.");
  if (a.companyId && !seesCompany(c)) throw new HttpError(403, "Only company administrators can change shared company locations.");
  return a;
}

accountRouter.patch(
  "/addresses/:id",
  writeLimiter,
  asyncHandler(async (req, res) => {
    await editableAddress(req.customer!, req.params.id as string);
    const body = addressSchema.omit({ shared: true }).partial().parse(req.body);
    const row = await prisma.savedAddress.update({ where: { id: req.params.id as string }, data: body });
    res.json({ ok: true, address: row });
  }),
);

accountRouter.delete(
  "/addresses/:id",
  asyncHandler(async (req, res) => {
    await editableAddress(req.customer!, req.params.id as string);
    await prisma.savedAddress.delete({ where: { id: req.params.id as string } });
    res.json({ ok: true });
  }),
);

/* -------------------------------- Documents ------------------------------ */
accountRouter.get(
  "/documents",
  asyncHandler(async (req, res) => {
    const c = req.customer!;
    const docs = await prisma.customerDocument.findMany({
      where: seesCompany(c) ? { customer: { companyId: c.companyId! } } : { customerId: c.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, title: true, orderId: true, createdAt: true, customer: { select: { name: true } } },
    });
    const orderRefs = await prisma.order.findMany({ where: { id: { in: docs.map((d) => d.orderId).filter(Boolean) as string[] } }, select: { id: true, reference: true } });
    res.json({ ok: true, documents: docs.map((d) => ({ ...d, orderReference: orderRefs.find((o) => o.id === d.orderId)?.reference ?? null })) });
  }),
);

accountRouter.post(
  "/documents",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const c = req.customer!;
    const form = await parseMultipart(req);
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.");
    const title = z.string().trim().min(2, "Give the document a title").max(120).parse(String(form.get("title") ?? "") || file.name);
    const orderId = String(form.get("orderId") ?? "") || null;
    if (orderId) await ownedOrder(req, orderId);
    const uploadId = await storeUpload(file);
    await prisma.upload.update({ where: { id: uploadId }, data: { kind: "customer-doc", ownerType: "customer", ownerId: c.id } });
    const doc = await prisma.customerDocument.create({ data: { customerId: c.id, title, uploadId, orderId } });
    await auditCustomer(c, "upload", "customer-document", doc.id, { orderId });
    res.status(201).json({ ok: true, document: { id: doc.id, title: doc.title, orderId: doc.orderId, createdAt: doc.createdAt } });
  }),
);

async function ownedDocument(c: NonNullable<import("express").Request["customer"]>, id: string) {
  const d = await prisma.customerDocument.findFirst({ where: { id, ...(seesCompany(c) ? { customer: { companyId: c.companyId! } } : { customerId: c.id }) } });
  if (!d) throw new HttpError(404, "Document not found.");
  return d;
}

accountRouter.get(
  "/documents/:id/file",
  asyncHandler(async (req, res) => {
    const d = await ownedDocument(req.customer!, req.params.id as string);
    await sendUpload(res, d.uploadId, true);
  }),
);

accountRouter.delete(
  "/documents/:id",
  asyncHandler(async (req, res) => {
    const d = await ownedDocument(req.customer!, req.params.id as string);
    if (d.customerId !== req.customer!.id && req.customer!.accountRole !== "COMPANY_ADMIN") throw new HttpError(403, "Only the uploader or a company administrator can remove this document.");
    await prisma.customerDocument.delete({ where: { id: d.id } });
    await auditCustomer(req.customer!, "delete", "customer-document", d.id);
    res.json({ ok: true });
  }),
);

/* -------------------------- Business account inquiry --------------------- */
accountRouter.post(
  "/business-application",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const c = await loadCustomer(req.customer!.id);
    if (c.companyId && c.company?.accountStatus !== "PROSPECT") throw new HttpError(409, "Your profile is already linked to a business account.");
    const body = z
      .object({
        companyName: z.string().trim().min(2).max(200),
        accountType: z.enum(["hotel", "resort", "dmc", "cruise", "corporate", "sports", "entertainment", "event", "university", "commercial"]),
        billingEmail: z.string().trim().email().max(200),
        poRequired: z.boolean().default(false),
        expectedVolume: z.string().trim().max(200).optional().or(z.literal("")),
        notes: z.string().trim().max(2000).optional().or(z.literal("")),
      })
      .parse(req.body);
    const domain = c.email.split("@")[1]?.toLowerCase();
    const notes = [`Business account application by ${c.name} <${c.email}> on ${new Date().toISOString().slice(0, 10)}`, body.expectedVolume && `Expected volume: ${body.expectedVolume}`, body.notes].filter(Boolean).join("\n");
    const company = c.companyId
      ? await prisma.company.update({ where: { id: c.companyId }, data: { name: body.companyName, accountType: body.accountType, accountStatus: "PENDING", billingEmail: body.billingEmail, poRequired: body.poRequired, notes } })
      : await prisma.company.create({ data: { name: body.companyName, accountType: body.accountType, accountStatus: "PENDING", billingEmail: body.billingEmail, poRequired: body.poRequired, notes, domain: null, market: undefined } });
    await prisma.customer.update({ where: { id: c.id }, data: { companyId: company.id } });
    await auditCustomer(c, "apply", "company", company.id, { domain });
    res.status(201).json({ ok: true, message: "Thank you. Our team will review your business account and contact you, usually within one business day." });
  }),
);
