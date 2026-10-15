/**
 * Module "storage" (Master Requirements §7)
 *
 * Admin  /v1/admin/storage  (OWNER, STAFF, DISPATCHER)
 *   GET    /dashboard                    today's intakes & releases, occupancy %, overstays
 *   GET    /locations                    storage locations (incl. PRIVATE address — staff only)
 *   POST   /locations · PATCH /locations/:id
 *   GET    /calendar?locationId&date&view=day|week   reserved vs capacity per hour block / day
 *   GET    /bookings?status&locationId&q&from&to&page
 *   POST   /bookings                     create (5 combinations), capacity-locked; 409 when full
 *   POST   /quote                        price preview from the storage engine (internal)
 *   GET    /bookings/:id
 *   POST   /bookings/:id/extend · /cancel · /check-in · /release
 *   POST   /bookings/:id/uploads         intake/release photo or signature (multipart "file")
 *   GET    /bookings/:id/files/:uploadId inline view of a booking photo
 *   GET    /order-lookup?ref=            find an order to link a booking to
 *   POST   /sweep                        flag overstays + create retrieval reminders (cron-ready)
 *
 * Public /v1/storage
 *   GET    /availability?market&start&end&pieces   { available: boolean } — never addresses or counts
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { join, resolve } from "node:path";
import { z } from "zod";
import { audit, requireAuth, requireRole } from "../../auth";
import { prisma } from "../../db";
import { priceStorage } from "../../engines/pricing/storage";
import { env } from "../../lib/env";
import { asyncHandler, HttpError } from "../../lib/errors";
import { parseMultipart, storeUpload } from "../../lib/multipart";
import { getActiveRules } from "../../settings";
import type { PlatformModule } from "../types";
import { COMBINATION_KEYS, COMBINATIONS, type Combination } from "./capacity";
import {
  availability, availabilitySchema, bookingDetail, bookingSchema, calendar, calendarSchema, cancelBooking, checkIn, checkInSchema, createBooking, dashboard,
  extendBooking, extendSchema, listBookings, listLocations, listSchema, locationSchema, pendingOverstayCharges, release, releaseSchema, saveLocation, sweepStorage,
} from "./service";

export const adminRouter = Router();
export const publicRouter = Router();

adminRouter.use(requireAuth, requireRole("STAFF", "DISPATCHER"));

const actor = (req: Express.Request & { user?: { id: string; email: string; name: string | null } }) => ({ id: req.user!.id, name: req.user!.name || req.user!.email });

adminRouter.get("/dashboard", asyncHandler(async (_req, res) => res.json({ ok: true, ...(await dashboard()) })));

/**
 * Overstay charges recorded at release and not invoiced yet, as invoice-ready lines
 * (pass to billing's createInvoice extraLines after staff confirm): ?orderIds=a,b
 */
adminRouter.get(
  "/overstay-charges",
  asyncHandler(async (req, res) => {
    const ids = String(req.query.orderIds ?? "").split(",").map((x) => x.trim()).filter((x) => /^[a-z0-9]{10,40}$/i.test(x)).slice(0, 50);
    res.json({ ok: true, charges: await pendingOverstayCharges(ids) });
  }),
);

adminRouter.get("/combinations", (_req, res) => res.json({ ok: true, combinations: COMBINATION_KEYS.map((k) => ({ value: k, label: COMBINATIONS[k].label })) }));

adminRouter.get("/locations", asyncHandler(async (_req, res) => res.json({ ok: true, locations: await listLocations() })));

adminRouter.post(
  "/locations",
  asyncHandler(async (req, res) => {
    const loc = await saveLocation(null, locationSchema.parse(req.body));
    await audit(req, "create", "storageLocation", loc.id, { code: loc.code, capacity: loc.capacityPieces });
    res.status(201).json({ ok: true, location: loc });
  }),
);

adminRouter.patch(
  "/locations/:id",
  asyncHandler(async (req, res) => {
    const loc = await saveLocation(String(req.params.id), locationSchema.parse(req.body));
    await audit(req, "update", "storageLocation", loc.id, { capacity: loc.capacityPieces, active: loc.active });
    res.json({ ok: true, location: loc });
  }),
);

adminRouter.get("/calendar", asyncHandler(async (req, res) => res.json({ ok: true, ...(await calendar(calendarSchema.parse(req.query))) })));

adminRouter.get("/bookings", asyncHandler(async (req, res) => res.json({ ok: true, ...(await listBookings(listSchema.parse(req.query))) })));

adminRouter.post(
  "/bookings",
  asyncHandler(async (req, res) => {
    const { booking, capacity } = await createBooking(bookingSchema.parse(req.body), actor(req));
    await audit(req, "create", "storageBooking", booking.id, { reference: booking.reference, pieces: booking.pieces });
    res.status(201).json({ ok: true, booking, capacity });
  }),
);

/** Internal price preview (staff see cost & margin; customers never do). */
adminRouter.post(
  "/quote",
  asyncHandler(async (req, res) => {
    const q = z
      .object({ startsAt: z.coerce.date(), endsAt: z.coerce.date(), pieces: z.coerce.number().int().min(1), oversizedPieces: z.coerce.number().int().min(0).default(0), combination: z.enum(COMBINATION_KEYS as [Combination, ...Combination[]]), afterHours: z.boolean().default(false) })
      .refine((v) => v.endsAt > v.startsAt, { message: "Retrieval must be after drop-off", path: ["endsAt"] })
      .parse(req.body);
    const f = COMBINATIONS[q.combination];
    const price = priceStorage({ start: q.startsAt, end: q.endsAt, pieces: q.pieces, oversizedPieces: q.oversizedPieces, withPickup: f.withPickup, withDelivery: f.withDelivery, afterHours: q.afterHours }, await getActiveRules("storage"));
    res.json({ ok: true, price });
  }),
);

adminRouter.get("/bookings/:id", asyncHandler(async (req, res) => res.json({ ok: true, ...(await bookingDetail(String(req.params.id))) })));

adminRouter.post(
  "/bookings/:id/extend",
  asyncHandler(async (req, res) => {
    const r = await extendBooking(String(req.params.id), extendSchema.parse(req.body), actor(req));
    await audit(req, "extend", "storageBooking", r.booking.id, { endsAt: r.booking.endsAt, extraCents: r.extraCents });
    res.json({ ok: true, ...r });
  }),
);

adminRouter.post(
  "/bookings/:id/cancel",
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(3, "Give a reason").max(500) }).parse(req.body);
    await cancelBooking(String(req.params.id), reason, actor(req));
    await audit(req, "cancel", "storageBooking", String(req.params.id), { reason });
    res.json({ ok: true });
  }),
);

adminRouter.post(
  "/bookings/:id/check-in",
  asyncHandler(async (req, res) => {
    const r = await checkIn(String(req.params.id), checkInSchema.parse(req.body), actor(req));
    await audit(req, "check-in", "storageBooking", String(req.params.id));
    res.json(r);
  }),
);

adminRouter.post(
  "/bookings/:id/release",
  asyncHandler(async (req, res) => {
    const r = await release(String(req.params.id), releaseSchema.parse(req.body), actor(req));
    await audit(req, "release", "storageBooking", String(req.params.id), { overstayCents: r.overstayCents });
    res.json(r);
  }),
);

adminRouter.post(
  "/bookings/:id/uploads",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    if (!(await prisma.storageBooking.findUnique({ where: { id }, select: { id: true } }))) throw new HttpError(404, "Storage booking not found.");
    const form = await parseMultipart(req);
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a photo to upload.");
    const kind = String(form.get("kind") || "storage-photo") === "signature" ? "signature" : "storage-photo";
    const uploadId = await storeUpload(file);
    await prisma.upload.update({ where: { id: uploadId }, data: { kind, ownerType: "storage-booking", ownerId: id, uploadedBy: req.user!.id } });
    res.status(201).json({ ok: true, id: uploadId });
  }),
);

adminRouter.get(
  "/bookings/:id/files/:uploadId",
  asyncHandler(async (req, res) => {
    const up = await prisma.upload.findFirst({ where: { id: String(req.params.uploadId), ownerType: "storage-booking", ownerId: String(req.params.id) } });
    if (!up) throw new HttpError(404, "File not found.");
    res.setHeader("Content-Type", up.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=300");
    // Let the website (same site, other origin/port) display the photo; access still requires the session cookie
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    res.sendFile(join(resolve(env.uploadDir), up.storedName));
  }),
);

adminRouter.get(
  "/order-lookup",
  asyncHandler(async (req, res) => {
    const ref = z.string().trim().min(3).max(40).parse(req.query.ref);
    const orders = await prisma.order.findMany({
      where: { reference: { contains: ref.toUpperCase() } },
      take: 8,
      orderBy: { createdAt: "desc" },
      select: { id: true, reference: true, status: true, serviceDate: true, customer: { select: { name: true } }, _count: { select: { pieces: true } } },
    });
    res.json({ ok: true, orders });
  }),
);

adminRouter.post(
  "/sweep",
  asyncHandler(async (req, res) => {
    const r = await sweepStorage();
    await audit(req, "sweep", "storage", undefined, r);
    res.json({ ok: true, ...r });
  }),
);

/* ------------------------------ Public API ------------------------------- */

const availabilityLimiter = rateLimit({ windowMs: 60_000, limit: Number(process.env.PUBLIC_RATE_LIMIT || 30), standardHeaders: "draft-8", legacyHeaders: false, message: { ok: false, error: "Too many requests. Please wait a moment." } });

publicRouter.get(
  "/availability",
  availabilityLimiter,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, ...(await availability(availabilitySchema.parse(req.query))) });
  }),
);

export const platformModule: PlatformModule = {
  name: "storage",
  routes: [
    { scope: "admin", path: "/storage", router: adminRouter },
    { scope: "public", path: "/storage", router: publicRouter },
  ],
};
