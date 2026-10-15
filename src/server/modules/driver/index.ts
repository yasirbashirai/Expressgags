/**
 * Driver app API (/v1/driver/*). Phone-first workflow following the Express Care Standard:
 *   GET  /me                          signed-in driver profile
 *   GET  /jobs?scope=today|upcoming|recent
 *   GET  /jobs/:orderId               job detail (route, contacts, pieces + scan state, proofs, timeline)
 *   POST /jobs/:orderId/accept        accept the assignment (moves CONFIRMED → DRIVER_ASSIGNED)
 *   POST /jobs/:orderId/status        EN_ROUTE / AT_FACILITY / TRANSFERRED_TO_CARRIER / IN_TRANSIT / OUT_FOR_DELIVERY
 *   POST /jobs/:orderId/scan          scan a piece QR at PICKUP / FACILITY / DELIVERY
 *   POST /jobs/:orderId/upload        multipart photo/signature (private upload)
 *   POST /jobs/:orderId/proof         proof of pickup → PICKED_UP, proof of delivery → DELIVERED
 *   POST /jobs/:orderId/exception     report a problem (count mismatch, damage, address…)
 * Requires a staff session with role DRIVER (OWNER allowed for testing/office support).
 * Every mutating call accepts an Idempotency-Key header so offline replays never duplicate.
 * Customer notifications are NOT sent here — the notifications module listens to domain events.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireRole } from "../../auth";
import type { OrderStatus } from "../../generated/prisma/client";
import { emit } from "../../lib/events";
import { asyncHandler, HttpError } from "../../lib/errors";
import { parseMultipart, storeUpload } from "../../lib/multipart";
import { addOrderEvent, ORDER_FLOW, STATUS_LABEL, transitionOrder } from "../../services/orders";
import type { PlatformModule } from "../types";
import {
  actorFields,
  assignmentScope,
  DRIVER_SETTABLE,
  etDayStart,
  normalizePieceCode,
  once,
  requireAssignment,
  resolveDriver,
  SCAN_STAGES,
  scannedByStage,
  transitionActor,
} from "./service";

export const publicRouter = Router();

const driverLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.DRIVER_RATE_LIMIT || 240),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests from this device. Please wait a moment." },
});

publicRouter.use(driverLimiter, requireAuth, requireRole("DRIVER"));

const geo = { lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional() };
const IN_PROGRESS: OrderStatus[] = ["DRIVER_ASSIGNED", "EN_ROUTE", "PICKED_UP", "AT_FACILITY", "TRANSFERRED_TO_CARRIER", "IN_TRANSIT", "OUT_FOR_DELIVERY"];

/** Pickup/delivery JSON → safe display shape for the driver. */
type Stop = { type?: string; address?: string; facility?: string; market?: string; contact?: string; notes?: string };
const stop = (j: unknown): Stop => (j && typeof j === "object" ? (j as Stop) : {});

// ---------------------------------------------------------------------------
// Profile & job lists
// ---------------------------------------------------------------------------

publicRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const actor = await resolveDriver(req);
    const employee = actor.employeeId
      ? await prisma.employee.findUnique({ where: { id: actor.employeeId }, select: { id: true, firstName: true, lastName: true, role: true, homeMarket: true, phone: true } })
      : null;
    res.json({ ok: true, user: { id: req.user!.id, email: req.user!.email, role: req.user!.role }, employee, displayName: actor.name });
  }),
);

publicRouter.get(
  "/jobs",
  asyncHandler(async (req, res) => {
    const actor = await resolveDriver(req);
    const scope = z.enum(["today", "upcoming", "recent"]).default("today").parse(req.query.scope);
    const dayStart = etDayStart();
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
    const orderWhere =
      scope === "today"
        ? { OR: [{ serviceDate: { gte: dayStart, lt: dayEnd }, status: { notIn: ["CANCELLED"] as OrderStatus[] } }, { status: { in: IN_PROGRESS.filter((s) => s !== "DRIVER_ASSIGNED") } }] }
        : scope === "upcoming"
          ? { serviceDate: { gte: dayEnd }, status: { notIn: ["CANCELLED", "DELIVERED"] as OrderStatus[] } }
          : { status: "DELIVERED" as OrderStatus, completedAt: { gte: new Date(dayStart.getTime() - 3 * 24 * 3600 * 1000) } };

    const assignments = await prisma.assignment.findMany({
      where: { ...assignmentScope(actor), order: orderWhere },
      orderBy: [{ order: { serviceDate: "asc" } }, { sequence: "asc" }],
      take: 100,
      include: {
        vehicle: { select: { unitNumber: true, vehicleClassCode: true } },
        order: {
          select: {
            id: true, reference: true, status: true, serviceType: true, serviceDate: true, timeWindow: true, windowStart: true, windowEnd: true,
            priority: true, pickup: true, delivery: true, specialHandling: true, accessNotes: true, guestName: true,
            _count: { select: { pieces: true } },
          },
        },
      },
    });
    res.json({
      ok: true,
      scope,
      jobs: assignments.map((a) => ({
        assignmentId: a.id,
        role: a.role,
        sequence: a.sequence,
        assignmentStatus: a.status,
        vehicle: a.vehicle,
        orderId: a.order.id,
        reference: a.order.reference,
        status: a.order.status,
        statusLabel: STATUS_LABEL[a.order.status],
        serviceType: a.order.serviceType,
        serviceDate: a.order.serviceDate,
        timeWindow: a.order.timeWindow,
        windowStart: a.order.windowStart,
        windowEnd: a.order.windowEnd,
        priority: a.order.priority,
        pickup: stop(a.order.pickup),
        delivery: stop(a.order.delivery),
        pieceCount: a.order._count.pieces,
        specialHandling: a.order.specialHandling,
        accessNotes: a.order.accessNotes,
        guestName: a.order.guestName,
      })),
    });
  }),
);

publicRouter.get(
  "/jobs/:orderId",
  asyncHandler(async (req, res) => {
    const actor = await resolveDriver(req);
    const assignment = await requireAssignment(actor, String(req.params.orderId));
    const order = await prisma.order.findUnique({
      where: { id: assignment.orderId },
      include: {
        customer: { select: { name: true, phone: true } },
        pieces: { orderBy: { pieceId: "asc" }, select: { id: true, pieceId: true, category: true, description: true, status: true, conditionNotes: true, storageBay: true } },
        proofs: { orderBy: { capturedAt: "asc" } },
        exceptions: { orderBy: { createdAt: "desc" }, select: { id: true, type: true, severity: true, status: true, detail: true, createdAt: true } },
        events: { orderBy: { createdAt: "desc" }, take: 40, select: { id: true, type: true, status: true, detail: true, actorName: true, createdAt: true } },
        assignments: {
          where: { status: { not: "REMOVED" } },
          select: { role: true, employee: { select: { firstName: true } }, vehicle: { select: { unitNumber: true, vehicleClassCode: true } } },
        },
      },
    });
    if (!order) throw new HttpError(404, "Job not found.");
    const scans = await scannedByStage(order.id);
    res.json({
      ok: true,
      job: {
        orderId: order.id,
        reference: order.reference,
        status: order.status,
        statusLabel: STATUS_LABEL[order.status],
        nextStatuses: ORDER_FLOW[order.status],
        serviceType: order.serviceType,
        fulfillment: order.fulfillment,
        serviceDate: order.serviceDate,
        timeWindow: order.timeWindow,
        windowStart: order.windowStart,
        windowEnd: order.windowEnd,
        priority: order.priority,
        pickup: stop(order.pickup),
        delivery: stop(order.delivery),
        extraStops: Array.isArray(order.extraStops) ? (order.extraStops as Stop[]) : [],
        specialHandling: order.specialHandling,
        accessNotes: order.accessNotes,
        customerNotes: order.customerNotes,
        guestName: order.guestName,
        guestRoom: order.guestRoom,
        // On-site contact for the job (internal: drivers may call the booked customer)
        customer: { name: order.customer.name, phone: order.customer.phone },
        assignment: { id: assignment.id, role: assignment.role, status: assignment.status },
        crew: order.assignments.map((a) => ({ role: a.role, firstName: a.employee.firstName, vehicle: a.vehicle })),
        pieces: order.pieces,
        scans,
        proofs: order.proofs.map((p) => ({ id: p.id, kind: p.kind, pieceCount: p.pieceCount, recipientName: p.recipientName, capturedAt: p.capturedAt, photoCount: p.photoUploadIds.length, signed: !!p.signatureUploadId })),
        exceptions: order.exceptions,
        timeline: order.events,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

publicRouter.post(
  "/jobs/:orderId/accept",
  asyncHandler(async (req, res) => {
    const actor = await resolveDriver(req);
    const assignment = await requireAssignment(actor, String(req.params.orderId));
    const r = await once(req, actor, "accept", assignment.orderId, async () => {
      await prisma.assignment.update({ where: { id: assignment.id }, data: { status: "ACCEPTED" } });
      const order = await prisma.order.findUniqueOrThrow({ where: { id: assignment.orderId } });
      if (order.status === "CONFIRMED") {
        await transitionOrder(order.id, "DRIVER_ASSIGNED", transitionActor(actor), { detail: "Driver assigned and job accepted" });
      } else {
        await addOrderEvent({ orderId: order.id, type: "NOTE", detail: "Driver accepted the job", ...actorFields(actor) });
      }
      return { status: 200, body: { ok: true, assignmentStatus: "ACCEPTED" } };
    });
    res.status(r.status).json({ ...r.body, replayed: r.replayed });
  }),
);

publicRouter.post(
  "/jobs/:orderId/status",
  asyncHandler(async (req, res) => {
    const actor = await resolveDriver(req);
    const assignment = await requireAssignment(actor, String(req.params.orderId));
    const body = z
      .object({
        to: z.enum(DRIVER_SETTABLE as [OrderStatus, ...OrderStatus[]]),
        detail: z.string().max(500).optional(),
        trackingNumber: z.string().trim().min(4).max(60).optional(),
        carrier: z.string().max(40).optional(),
        storageBay: z.string().trim().max(40).optional(),
        ...geo,
      })
      .parse(req.body);
    if (body.to === "TRANSFERRED_TO_CARRIER" && !body.trackingNumber) throw new HttpError(400, "Enter the carrier tracking number for the handoff.");
    const r = await once(req, actor, `status:${body.to}`, assignment.orderId, async () => {
      const parts = [body.detail];
      if (body.to === "TRANSFERRED_TO_CARRIER") parts.push(`Handed to ${body.carrier || "carrier"}, tracking ${body.trackingNumber}`);
      if (body.to === "AT_FACILITY" && body.storageBay) parts.push(`Storage bay ${body.storageBay}`);
      const order = await transitionOrder(assignment.orderId, body.to, transitionActor(actor), {
        detail: parts.filter(Boolean).join(" · ") || undefined,
        lat: body.lat,
        lng: body.lng,
      });
      if (body.to === "AT_FACILITY") {
        await prisma.orderPiece.updateMany({ where: { orderId: order.id }, data: { custodyLocation: "Express Bags facility", ...(body.storageBay ? { storageBay: body.storageBay } : {}) } });
      }
      if (body.to === "TRANSFERRED_TO_CARRIER") {
        await prisma.orderPiece.updateMany({ where: { orderId: order.id }, data: { custodyLocation: `${body.carrier || "Carrier"} ${body.trackingNumber}` } });
      }
      if (body.to === "EN_ROUTE" && assignment.status === "ASSIGNED") await prisma.assignment.update({ where: { id: assignment.id }, data: { status: "IN_PROGRESS" } });
      return { status: 200, body: { ok: true, status: order.status, statusLabel: STATUS_LABEL[order.status] } };
    });
    res.status(r.status).json({ ...r.body, replayed: r.replayed });
  }),
);

publicRouter.post(
  "/jobs/:orderId/scan",
  asyncHandler(async (req, res) => {
    const actor = await resolveDriver(req);
    const assignment = await requireAssignment(actor, String(req.params.orderId));
    const body = z.object({ code: z.string().trim().min(3).max(200), stage: z.enum(SCAN_STAGES), condition: z.string().max(300).optional(), ...geo }).parse(req.body);
    const code = normalizePieceCode(body.code);
    const r = await once(req, actor, `scan:${body.stage}`, assignment.orderId, async () => {
      const piece = await prisma.orderPiece.findFirst({ where: { orderId: assignment.orderId, OR: [{ pieceId: code }, { barcode: code }] } });
      if (!piece) {
        // Mismatch: record it on the timeline so the office sees a foreign/unknown tag was scanned
        await addOrderEvent({ orderId: assignment.orderId, type: "SCAN", detail: `MISMATCH:${body.stage} Unknown tag ${code}`, lat: body.lat, lng: body.lng, ...actorFields(actor) });
        return { status: 422, body: { ok: false, error: `${code} is not part of this order. Check the tag or report a count mismatch.`, mismatch: true } };
      }
      const already = await scannedByStage(assignment.orderId);
      const duplicate = already[body.stage].includes(piece.pieceId);
      if (!duplicate) {
        await addOrderEvent({
          orderId: assignment.orderId,
          pieceId: piece.id,
          type: "SCAN",
          detail: `STAGE:${body.stage} ${piece.pieceId}${body.condition ? ` · ${body.condition}` : ""}`,
          lat: body.lat,
          lng: body.lng,
          ...actorFields(actor),
        });
        if (body.condition) await prisma.orderPiece.update({ where: { id: piece.id }, data: { conditionNotes: body.condition } });
      }
      const scans = await scannedByStage(assignment.orderId);
      const total = await prisma.orderPiece.count({ where: { orderId: assignment.orderId } });
      return { status: 200, body: { ok: true, pieceId: piece.pieceId, duplicate, stage: body.stage, scanned: scans[body.stage].length, total } };
    });
    res.status(r.status).json({ ...r.body, replayed: r.replayed });
  }),
);

publicRouter.post(
  "/jobs/:orderId/upload",
  asyncHandler(async (req, res) => {
    const actor = await resolveDriver(req);
    const assignment = await requireAssignment(actor, String(req.params.orderId));
    const r = await once(req, actor, "upload", assignment.orderId, async () => {
      const form = await parseMultipart(req);
      const file = form.get("file");
      if (!(file instanceof File)) throw new HttpError(400, "Attach a photo or signature.");
      if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new HttpError(415, "Only photos and signatures can be uploaded here.");
      const kind = z.enum(["order-photo", "signature"]).catch("order-photo").parse(form.get("kind"));
      const id = await storeUpload(file);
      await prisma.upload.update({ where: { id }, data: { kind, ownerType: "order", ownerId: assignment.orderId, uploadedBy: actor.employeeId ?? actor.userId } });
      if (kind === "order-photo") {
        await addOrderEvent({ orderId: assignment.orderId, type: "PHOTO", detail: String(form.get("caption") || "Condition photo").slice(0, 200), uploadIds: [id], ...actorFields(actor) });
      }
      return { status: 201, body: { ok: true, id } };
    });
    res.status(r.status).json({ ...r.body, replayed: r.replayed });
  }),
);

publicRouter.post(
  "/jobs/:orderId/proof",
  asyncHandler(async (req, res) => {
    const actor = await resolveDriver(req);
    const assignment = await requireAssignment(actor, String(req.params.orderId));
    const body = z
      .object({
        kind: z.enum(["PICKUP", "DELIVERY", "RELEASE"]),
        recipientName: z.string().trim().max(120).optional(),
        signatureUploadId: z.string().max(40).optional(),
        photoUploadIds: z.array(z.string().max(40)).max(20).default([]),
        conditionNotes: z.string().max(1000).optional(),
        ...geo,
      })
      .parse(req.body);
    if (body.kind !== "PICKUP" && !body.recipientName) throw new HttpError(400, "Enter the name of the person receiving the items.");

    const r = await once(req, actor, `proof:${body.kind}`, assignment.orderId, async () => {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: assignment.orderId } });
      const target: OrderStatus = body.kind === "PICKUP" ? "PICKED_UP" : "DELIVERED";
      if (!ORDER_FLOW[order.status].includes(target)) {
        throw new HttpError(409, `This job is "${STATUS_LABEL[order.status]}". It cannot be marked ${STATUS_LABEL[target].toLowerCase()} yet.`);
      }
      // Uploads must belong to this order (no attaching someone else's photos)
      const uploadIds = [...body.photoUploadIds, ...(body.signatureUploadId ? [body.signatureUploadId] : [])];
      if (uploadIds.length) {
        const owned = await prisma.upload.count({ where: { id: { in: uploadIds }, ownerType: "order", ownerId: order.id } });
        if (owned !== uploadIds.length) throw new HttpError(400, "One of the photos does not belong to this job.");
      }
      // Count check (Express Care Standard: confirm count at pickup, re-count at handoff)
      const stage = body.kind === "PICKUP" ? "PICKUP" : "DELIVERY";
      const scans = await scannedByStage(order.id);
      const total = await prisma.orderPiece.count({ where: { orderId: order.id } });
      const scanned = scans[stage].length;
      if (scanned < total) {
        const mismatchReported = await prisma.orderException.count({ where: { orderId: order.id, type: "COUNT_MISMATCH", status: { not: "RESOLVED" } } });
        if (!mismatchReported) {
          return { status: 409, body: { ok: false, error: `${total - scanned} of ${total} pieces are not scanned. Scan every piece or report a count mismatch first.`, scanned, total } };
        }
      }
      await prisma.proofOfDelivery.create({
        data: {
          orderId: order.id,
          kind: body.kind,
          pieceCount: scanned,
          recipientName: body.recipientName,
          signatureUploadId: body.signatureUploadId,
          photoUploadIds: body.photoUploadIds,
          conditionNotes: body.conditionNotes,
          lat: body.lat,
          lng: body.lng,
          employeeId: actor.employeeId,
        },
      });
      const detail =
        body.kind === "PICKUP"
          ? `Picked up ${scanned} of ${total} pieces, counted and condition noted`
          : `Delivered ${scanned} of ${total} pieces to ${body.recipientName}`;
      const updated = await transitionOrder(order.id, target, transitionActor(actor), {
        detail,
        lat: body.lat,
        lng: body.lng,
        uploadIds,
      });
      if (target === "PICKED_UP") {
        await prisma.orderPiece.updateMany({ where: { orderId: order.id }, data: { custodyLocation: `With driver ${actor.name.split(" ")[0]}` } });
      } else {
        await prisma.orderPiece.updateMany({ where: { orderId: order.id }, data: { custodyLocation: `Released to ${body.recipientName}` } });
        await prisma.assignment.updateMany({ where: { orderId: order.id, status: { not: "REMOVED" } }, data: { status: "DONE", completedAt: new Date() } });
      }
      return { status: 200, body: { ok: true, status: updated.status, statusLabel: STATUS_LABEL[updated.status], scanned, total } };
    });
    res.status(r.status).json({ ...r.body, replayed: r.replayed });
  }),
);

const EXCEPTION_TYPES = [
  "LATE_PICKUP", "CARRIER_DELAY", "ADDRESS_PROBLEM", "PAYMENT_FAILURE", "DESTINATION_CHANGE", "OVERSIZED_ITEM",
  "COUNT_MISMATCH", "DELIVERY_FAILED", "CAPACITY", "DAMAGE", "OTHER",
] as const;

publicRouter.post(
  "/jobs/:orderId/exception",
  asyncHandler(async (req, res) => {
    const actor = await resolveDriver(req);
    const assignment = await requireAssignment(actor, String(req.params.orderId));
    const body = z
      .object({
        type: z.enum(EXCEPTION_TYPES),
        severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
        detail: z.string().trim().min(3, "Describe what happened").max(1000),
        uploadIds: z.array(z.string().max(40)).max(10).default([]),
        ...geo,
      })
      .parse(req.body);
    const r = await once(req, actor, "exception", assignment.orderId, async () => {
      if (body.uploadIds.length) {
        const owned = await prisma.upload.count({ where: { id: { in: body.uploadIds }, ownerType: "order", ownerId: assignment.orderId } });
        if (owned !== body.uploadIds.length) throw new HttpError(400, "One of the photos does not belong to this job.");
      }
      const ex = await prisma.orderException.create({
        data: { orderId: assignment.orderId, type: body.type, severity: body.severity, detail: body.detail, reportedBy: actor.name, uploadIds: body.uploadIds },
      });
      await addOrderEvent({ orderId: assignment.orderId, type: "EXCEPTION", detail: `${body.type.replace(/_/g, " ").toLowerCase()}: ${body.detail}`, lat: body.lat, lng: body.lng, uploadIds: body.uploadIds, ...actorFields(actor) });
      await emit("order.exception", { orderId: assignment.orderId, exceptionId: ex.id, type: ex.type, severity: ex.severity });
      return { status: 201, body: { ok: true, id: ex.id } };
    });
    res.status(r.status).json({ ...r.body, replayed: r.replayed });
  }),
);

export const platformModule: PlatformModule = {
  name: "driver",
  routes: [{ scope: "public", path: "/driver", router: publicRouter }],
};
