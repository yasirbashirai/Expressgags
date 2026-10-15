/**
 * Module "orders" — /v1/admin/orders
 *   GET    /                         list + filters + search (reference, name, email, company, PO, piece ID)
 *   POST   /                         create an order manually
 *   POST   /from-quote/:quoteId      convert a website quote request into an order
 *   GET    /customers?q=             customer picker for manual orders
 *   GET    /by-quote/:quoteId        the order created from a quote request (or null)
 *   GET    /exceptions               exception inbox (open first, by severity then age)
 *   POST   /exceptions/sweep         run the automatic late/stale sweep now
 *   PATCH  /exceptions/:id           acknowledge / resolve / reopen
 *   GET    /:id                      full detail (pieces, chain of custody, crew, proofs, exceptions)
 *   PATCH  /:id                      edit schedule / handling / references / money
 *   POST   /:id/status               state-machine transition (cancel needs a reason)
 *   POST   /:id/notes                internal note on the timeline
 *   POST   /:id/exceptions           report an exception
 *   POST   /:id/manifest             import group manifest CSV → pieces
 *   GET    /:id/tags.pdf?layout=4x6|letter   printable QR bag tags
 *   GET    /:id/manifest.pdf         printable manifest
 */
import { Router } from "express";
import { z } from "zod";
import { audit, requireAuth, requireRole } from "../../auth";
import { prisma } from "../../db";
import type { OrderStatus } from "../../generated/prisma/client";
import { asyncHandler, HttpError } from "../../lib/errors";
import { transitionOrder } from "../../services/orders";
import type { PlatformModule } from "../types";
import { createException, createExceptionSchema, EXCEPTION_TYPES, listExceptions, SEVERITIES, sweepExceptions, updateException } from "./exceptions";
import { bagTagsPdf, manifestPdf } from "./pdf";
import { atTime, convertQuoteToOrder, createManualOrder, createOrderSchema, importManifest, listOrders, listQuerySchema, ORDER_STATUSES, orderDetail } from "./service";

export const adminRouter = Router();

adminRouter.use(requireAuth);
// Read access: office roles; accounting can look orders up for invoicing questions
adminRouter.use(requireRole("STAFF", "DISPATCHER", "ACCOUNTING"));
const canWrite = requireRole("STAFF", "DISPATCHER");

const actorOf = (req: Express.Request & { user?: { id: string; email: string; name: string | null } }) => ({
  id: req.user!.id,
  name: req.user!.name || req.user!.email,
});

adminRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ ok: true, ...(await listOrders(listQuerySchema.parse(req.query))) });
  }),
);

adminRouter.post(
  "/",
  canWrite,
  asyncHandler(async (req, res) => {
    const order = await createManualOrder(createOrderSchema.parse(req.body), actorOf(req));
    await audit(req, "create", "order", order.id, { reference: order.reference, pieces: order.pieces.length });
    res.status(201).json({ ok: true, order: { id: order.id, reference: order.reference } });
  }),
);

adminRouter.post(
  "/from-quote/:quoteId",
  canWrite,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ retailCents: z.coerce.number().int().min(0).optional(), serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
      .parse(req.body ?? {});
    const order = await convertQuoteToOrder(String(req.params.quoteId), actorOf(req), body);
    await audit(req, "convert", "quote", String(req.params.quoteId), { orderId: order.id, reference: order.reference });
    res.status(201).json({ ok: true, order: { id: order.id, reference: order.reference } });
  }),
);

adminRouter.get(
  "/customers",
  asyncHandler(async (req, res) => {
    const q = z.string().trim().max(120).default("").parse(req.query.q);
    const customers = await prisma.customer.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { company: { name: { contains: q, mode: "insensitive" } } }] } : {},
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: { id: true, name: true, email: true, phone: true, company: { select: { id: true, name: true } } },
    });
    res.json({ ok: true, customers });
  }),
);

adminRouter.get(
  "/by-quote/:quoteId",
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { quoteId: String(req.params.quoteId) }, select: { id: true, reference: true } });
    res.json({ ok: true, order });
  }),
);

/* ------------------------------- Exceptions ------------------------------- */

adminRouter.get(
  "/exceptions",
  asyncHandler(async (req, res) => {
    const q = z.object({ status: z.string().max(20).optional(), type: z.enum(EXCEPTION_TYPES).optional() }).parse(req.query);
    const exceptions = await listExceptions(q);
    const counts = await prisma.orderException.groupBy({ by: ["severity"], where: { status: { not: "RESOLVED" } }, _count: { _all: true } });
    res.json({ ok: true, exceptions, openBySeverity: Object.fromEntries(counts.map((c) => [c.severity, c._count._all])) });
  }),
);

adminRouter.post(
  "/exceptions/sweep",
  canWrite,
  asyncHandler(async (req, res) => {
    const result = await sweepExceptions();
    await audit(req, "sweep", "exception", undefined, { created: result.created.length });
    res.json({ ok: true, ...result });
  }),
);

adminRouter.patch(
  "/exceptions/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]), resolution: z.string().trim().max(2000).optional(), severity: z.enum(SEVERITIES).optional() })
      .parse(req.body);
    const ex = await updateException(String(req.params.id), body, actorOf(req));
    await audit(req, "update", "exception", ex.id, body);
    res.json({ ok: true, exception: ex });
  }),
);

/* --------------------------------- Order ---------------------------------- */

adminRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json({ ok: true, ...(await orderDetail(String(req.params.id))) });
  }),
);

const editSchema = z
  .object({
    serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeWindow: z.string().max(40).nullable(),
    windowStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().or(z.literal("")),
    windowEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().or(z.literal("")),
    priority: z.enum(["NORMAL", "RUSH", "VIP"]),
    specialHandling: z.string().max(1000).nullable(),
    accessNotes: z.string().max(1000).nullable(),
    customerNotes: z.string().max(2000).nullable(),
    internalNotes: z.string().max(4000).nullable(),
    poNumber: z.string().max(80).nullable(),
    costCenter: z.string().max(80).nullable(),
    guestName: z.string().max(120).nullable(),
    guestRoom: z.string().max(40).nullable(),
    vehicleClassCode: z.string().max(40).nullable(),
    retailCents: z.coerce.number().int().min(0).nullable(),
    costCents: z.coerce.number().int().min(0).nullable(),
    paymentStatus: z.enum(["UNPAID", "DEPOSIT_PAID", "PAID", "INVOICED", "REFUNDED", "ACCOUNT"]),
  })
  .partial();

adminRouter.patch(
  "/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const body = editSchema.parse(req.body);
    const existing = await prisma.order.findUnique({ where: { id }, select: { serviceDate: true } });
    if (!existing) throw new HttpError(404, "Order not found.");
    const dateStr = body.serviceDate ?? existing.serviceDate.toISOString().slice(0, 10);
    const { serviceDate, windowStart, windowEnd, ...rest } = body;
    const order = await prisma.order.update({
      where: { id },
      data: {
        ...rest,
        ...(serviceDate ? { serviceDate: new Date(`${serviceDate}T12:00:00`) } : {}),
        ...(windowStart !== undefined ? { windowStart: atTime(dateStr, windowStart || undefined) } : {}),
        ...(windowEnd !== undefined ? { windowEnd: atTime(dateStr, windowEnd || undefined) } : {}),
      },
    });
    await prisma.orderEvent.create({ data: { orderId: id, type: "NOTE", detail: `Order details edited (${Object.keys(body).join(", ")})`, actorType: "user", actorId: req.user!.id, actorName: actorOf(req).name } });
    await audit(req, "update", "order", id, body);
    res.json({ ok: true, order: { id: order.id } });
  }),
);

adminRouter.post(
  "/:id/status",
  canWrite,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ to: z.enum(ORDER_STATUSES), detail: z.string().trim().max(500).optional(), reason: z.string().trim().max(500).optional(), force: z.boolean().optional() })
      .parse(req.body);
    if (body.to === "CANCELLED" && !body.reason) throw new HttpError(400, "Give a reason for cancelling.");
    // Only the owner may force an out-of-sequence correction
    const force = body.force === true && req.user!.role === "OWNER";
    const order = await transitionOrder(String(req.params.id), body.to as OrderStatus, { type: "user", ...actorOf(req) }, { detail: body.detail, reason: body.reason, force });
    await audit(req, "status", "order", order.id, { to: body.to, force });
    res.json({ ok: true, order: { id: order.id, status: order.status } });
  }),
);

adminRouter.post(
  "/:id/notes",
  canWrite,
  asyncHandler(async (req, res) => {
    const { body, customerVisible } = z.object({ body: z.string().trim().min(1).max(2000), customerVisible: z.boolean().default(false) }).parse(req.body);
    const id = String(req.params.id);
    if (!(await prisma.order.findUnique({ where: { id }, select: { id: true } }))) throw new HttpError(404, "Order not found.");
    const ev = await prisma.orderEvent.create({ data: { orderId: id, type: "NOTE", detail: body, actorType: "user", actorId: req.user!.id, actorName: actorOf(req).name, customerVisible } });
    await audit(req, "note", "order", id);
    res.status(201).json({ ok: true, event: ev });
  }),
);

adminRouter.post(
  "/:id/exceptions",
  asyncHandler(async (req, res) => {
    const ex = await createException(String(req.params.id), createExceptionSchema.parse(req.body), { type: "user", ...actorOf(req) });
    await audit(req, "create", "exception", ex.id, { orderId: ex.orderId, type: ex.type });
    res.status(201).json({ ok: true, exception: ex });
  }),
);

adminRouter.post(
  "/:id/manifest",
  canWrite,
  asyncHandler(async (req, res) => {
    const { csv } = z.object({ csv: z.string().min(5).max(500_000) }).parse(req.body);
    const result = await importManifest(String(req.params.id), csv, actorOf(req));
    await audit(req, "import-manifest", "order", String(req.params.id), result);
    res.json({ ok: true, ...result });
  }),
);

async function loadForPrint(id: string) {
  const o = await prisma.order.findUnique({
    where: { id },
    include: { customer: { select: { name: true } }, pieces: { orderBy: { pieceId: "asc" } } },
  });
  if (!o) throw new HttpError(404, "Order not found.");
  if (!o.pieces.length) throw new HttpError(409, "This order has no pieces yet.");
  return o;
}

adminRouter.get(
  "/:id/tags.pdf",
  asyncHandler(async (req, res) => {
    const layout = req.query.layout === "letter" ? "letter" : "4x6";
    const o = await loadForPrint(String(req.params.id));
    const bytes = await bagTagsPdf(o, layout);
    await audit(req, "print-tags", "order", o.id, { layout, pieces: o.pieces.length });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${o.reference}-tags.pdf"`);
    res.send(Buffer.from(bytes));
  }),
);

adminRouter.get(
  "/:id/manifest.pdf",
  asyncHandler(async (req, res) => {
    const o = await loadForPrint(String(req.params.id));
    const bytes = await manifestPdf(o);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${o.reference}-manifest.pdf"`);
    res.send(Buffer.from(bytes));
  }),
);

export const platformModule: PlatformModule = {
  name: "orders",
  routes: [{ scope: "admin", path: "/orders", router: adminRouter }],
};
