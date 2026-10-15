/**
 * Storage operations service (Master Requirements §7): locations, capacity-safe bookings for the five
 * storage combinations, intake with piece tags/bays/photos (chain of custody §7.5), extensions,
 * release with proof, overstay detection and retrieval reminders.
 *
 * Capacity safety: every booking write takes a per-location transaction-level advisory lock, then
 * re-reads holding bookings and checks the interval peak, so concurrent requests can never overbook.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../../db";
import type { Prisma } from "../../generated/prisma/client";
import { overstayCharge, priceStorage } from "../../engines/pricing/storage";
import { emit } from "../../lib/events";
import { HttpError } from "../../lib/errors";
import { storageReference } from "../../lib/reference";
import { addOrderEvent, transitionOrder } from "../../services/orders";
import { getActiveRules } from "../../settings";
import { COMBINATION_KEYS, COMBINATIONS, fits, HOLDING_STATUSES, occupancyBlocks, overstayHours, peakOccupancy, type Combination } from "./capacity";

type Tx = Prisma.TransactionClient;
export type Actor = { id?: string; name: string };

/* -------------------------------- Time zone ------------------------------- */

const TZ = "America/New_York";

/** UTC instant for a wall-clock time in Miami (handles daylight saving). */
export function miamiTime(dateIso: string, hh = 0, mm = 0) {
  const [y, m, d] = dateIso.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const offset = tzOffsetMinutes(guess);
  return new Date(guess.getTime() + offset * 60_000);
}
function tzOffsetMinutes(at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((at.getTime() - asUtc) / 60_000);
}
/** Today's date in Miami (yyyy-mm-dd). */
export function miamiDate(at = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/* -------------------------------- Locations ------------------------------- */

export const locationSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes"),
  name: z.string().trim().min(2).max(120),
  market: z.string().trim().min(2).max(60),
  capacityPieces: z.coerce.number().int().min(0).max(100000),
  /** Optional display/ops rules, e.g. { blockHours: 2, intakeHours: "08:00-20:00" } */
  rules: z.record(z.string(), z.unknown()).nullable().optional(),
  addressPrivate: z.string().trim().max(300).nullable().optional(),
  active: z.boolean().optional(),
});

export function listLocations(includeInactive = true) {
  return prisma.storageLocation.findMany({ where: includeInactive ? {} : { active: true }, orderBy: [{ active: "desc" }, { market: "asc" }, { name: "asc" }] });
}

export async function saveLocation(id: string | null, input: z.infer<typeof locationSchema>) {
  const data = { ...input, rules: (input.rules ?? undefined) as Prisma.InputJsonValue | undefined };
  try {
    return id ? await prisma.storageLocation.update({ where: { id }, data }) : await prisma.storageLocation.create({ data });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new HttpError(409, "A storage location with that code already exists.");
    if ((e as { code?: string }).code === "P2025") throw new HttpError(404, "Storage location not found.");
    throw e;
  }
}

/* -------------------------------- Bookings -------------------------------- */

export const bookingSchema = z
  .object({
    locationId: z.string().min(1),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    pieces: z.coerce.number().int().min(1).max(5000),
    oversizedPieces: z.coerce.number().int().min(0).max(5000).default(0),
    combination: z.enum(COMBINATION_KEYS as [Combination, ...Combination[]]),
    orderId: z.string().optional().nullable(),
    contact: z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(200), phone: z.string().trim().max(40).optional().or(z.literal("")) }).optional(),
    afterHours: z.boolean().default(false),
    notes: z.string().max(2000).optional().or(z.literal("")),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: "Retrieval must be after drop-off", path: ["endsAt"] })
  .refine((v) => v.orderId || v.contact, { message: "Link an order or enter the customer contact", path: ["contact"] });
export type BookingInput = z.infer<typeof bookingSchema>;

/** Per-location advisory lock for the current transaction (serializes capacity writes). */
async function lockLocation(tx: Tx, locationId: string) {
  // 63-bit key from the id; literal integer (not a bind parameter) keeps every Postgres proxy happy
  const key = BigInt("0x" + createHash("sha256").update(`storage:${locationId}`).digest("hex").slice(0, 15));
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${key.toString()})`);
}

async function holding(tx: Tx | typeof prisma, locationId: string, from: Date, to: Date) {
  const rows = await tx.storageBooking.findMany({
    where: { locationId, status: { in: [...HOLDING_STATUSES] }, startsAt: { lt: to }, endsAt: { gt: from } },
    select: { id: true, startsAt: true, endsAt: true, pieces: true, status: true },
  });
  const now = new Date();
  // An overstaying booking keeps holding space until it is actually released
  return rows.map((r) => ({ id: r.id, start: r.startsAt, end: r.status === "OVERSTAY" && r.endsAt < now ? new Date(Math.max(to.getTime(), now.getTime())) : r.endsAt, pieces: r.pieces }));
}

async function priceFor(input: { startsAt: Date; endsAt: Date; pieces: number; oversizedPieces?: number; combination: Combination; afterHours?: boolean }) {
  const rules = await getActiveRules("storage");
  const flags = COMBINATIONS[input.combination];
  return priceStorage({ start: input.startsAt, end: input.endsAt, pieces: input.pieces, oversizedPieces: input.oversizedPieces, withPickup: flags.withPickup, withDelivery: flags.withDelivery, afterHours: input.afterHours }, rules);
}

export async function createBooking(input: BookingInput, actor: Actor) {
  const location = await prisma.storageLocation.findUnique({ where: { id: input.locationId } });
  if (!location || !location.active) throw new HttpError(404, "Storage location not found or inactive.");

  let customerId: string | null = null;
  let contact = input.contact;
  if (input.orderId) {
    const order = await prisma.order.findUnique({ where: { id: input.orderId }, include: { customer: true } });
    if (!order) throw new HttpError(404, "Order not found.");
    customerId = order.customerId;
    contact ??= { name: order.customer.name, email: order.customer.email, phone: order.customer.phone ?? "" };
  } else if (contact) {
    const c = await prisma.customer.upsert({ where: { email: contact.email.toLowerCase() }, update: {}, create: { name: contact.name, email: contact.email.toLowerCase(), phone: contact.phone || null } });
    customerId = c.id;
  }

  const price = await priceFor(input);
  const flags = COMBINATIONS[input.combination];

  return prisma.$transaction(async (tx) => {
    await lockLocation(tx, location.id);
    const existing = await holding(tx, location.id, input.startsAt, input.endsAt);
    const check = fits({ start: input.startsAt, end: input.endsAt, pieces: input.pieces }, existing, location.capacityPieces);
    if (!check.ok) {
      throw new HttpError(409, `Storage is full for that period: ${check.available} of ${location.capacityPieces} spaces free at the busiest time.`, [
        { path: "pieces", message: `Only ${check.available} spaces free` },
      ]);
    }
    const booking = await tx.storageBooking.create({
      data: {
        reference: storageReference(),
        orderId: input.orderId ?? null,
        locationId: location.id,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        pieces: input.pieces,
        withPickup: flags.withPickup,
        withDelivery: flags.withDelivery,
        retailCents: price.retailCents,
      },
    });
    await tx.storageBookingMeta.create({
      data: {
        bookingId: booking.id,
        combination: input.combination,
        customerId,
        contactName: contact?.name ?? null,
        contactEmail: contact?.email?.toLowerCase() ?? null,
        contactPhone: contact?.phone || null,
        notes: input.notes || null,
        pricing: price as unknown as Prisma.InputJsonValue,
        pieceTags: [],
        intakeUploadIds: [],
        releaseUploadIds: [],
      },
    });
    if (input.orderId) {
      await tx.orderEvent.create({
        data: { orderId: input.orderId, type: "STORAGE", detail: `Storage reserved (${booking.reference}) for ${input.pieces} piece(s)`, actorType: "staff", actorId: actor.id, actorName: actor.name, uploadIds: [], customerVisible: true },
      });
    }
    return { booking, capacity: check };
  });
}

const DETAIL_INCLUDE = { location: true, order: { select: { id: true, reference: true, status: true, serviceType: true, customer: { select: { name: true, email: true, phone: true } }, pieces: { select: { id: true, pieceId: true, category: true, description: true, storageBay: true, custodyLocation: true, status: true } } } } } as const;

export async function bookingDetail(id: string) {
  const booking = await prisma.storageBooking.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!booking) throw new HttpError(404, "Storage booking not found.");
  const meta = await prisma.storageBookingMeta.findUnique({ where: { bookingId: id } });
  const uploadIds = [...(meta?.intakeUploadIds ?? []), ...(meta?.releaseUploadIds ?? [])];
  const uploads = uploadIds.length ? await prisma.upload.findMany({ where: { id: { in: uploadIds } }, select: { id: true, originalName: true, mimeType: true } }) : [];
  return { booking, meta, uploads, overstayHours: booking.status === "CHECKED_IN" || booking.status === "OVERSTAY" ? overstayHours(booking.endsAt) : 0 };
}

export const listSchema = z.object({
  status: z.enum(["RESERVED", "CHECKED_IN", "RELEASED", "CANCELLED", "OVERSTAY", "active"]).optional(),
  locationId: z.string().optional(),
  q: z.string().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export async function listBookings(q: z.infer<typeof listSchema>) {
  const where: Prisma.StorageBookingWhereInput = {
    ...(q.status === "active" ? { status: { in: [...HOLDING_STATUSES] } } : q.status ? { status: q.status } : {}),
    ...(q.locationId ? { locationId: q.locationId } : {}),
    ...(q.from || q.to ? { startsAt: { ...(q.to ? { lt: q.to } : {}) }, endsAt: { ...(q.from ? { gt: q.from } : {}) } } : {}),
  };
  if (q.q) {
    const metas = await prisma.storageBookingMeta.findMany({ where: { OR: [{ contactName: { contains: q.q, mode: "insensitive" } }, { contactEmail: { contains: q.q, mode: "insensitive" } }] }, select: { bookingId: true } });
    where.OR = [{ reference: { contains: q.q, mode: "insensitive" } }, { order: { reference: { contains: q.q, mode: "insensitive" } } }, { id: { in: metas.map((m) => m.bookingId) } }];
  }
  const take = 50;
  const [rows, total] = await Promise.all([
    prisma.storageBooking.findMany({ where, orderBy: { startsAt: "asc" }, take, skip: (q.page - 1) * take, include: { location: { select: { name: true, code: true } }, order: { select: { reference: true } } } }),
    prisma.storageBooking.count({ where }),
  ]);
  const metas = await prisma.storageBookingMeta.findMany({ where: { bookingId: { in: rows.map((r) => r.id) } }, select: { bookingId: true, combination: true, contactName: true } });
  const byId = new Map(metas.map((m) => [m.bookingId, m]));
  return {
    bookings: rows.map((r) => ({ ...r, combination: byId.get(r.id)?.combination ?? null, contactName: byId.get(r.id)?.contactName ?? null, overstayHours: r.status === "CHECKED_IN" || r.status === "OVERSTAY" ? overstayHours(r.endsAt) : 0 })),
    total,
    page: q.page,
    pageSize: take,
  };
}

/* ------------------------------ Extension -------------------------------- */

export const extendSchema = z.object({ endsAt: z.coerce.date(), note: z.string().max(500).optional() });

export async function extendBooking(id: string, input: z.infer<typeof extendSchema>, actor: Actor) {
  const current = await prisma.storageBooking.findUnique({ where: { id }, include: { location: true } });
  if (!current) throw new HttpError(404, "Storage booking not found.");
  if (!["RESERVED", "CHECKED_IN", "OVERSTAY"].includes(current.status)) throw new HttpError(409, "Only active bookings can be extended.");
  if (input.endsAt <= current.endsAt) throw new HttpError(400, "The new retrieval time must be later than the current one.");
  const meta = await prisma.storageBookingMeta.findUnique({ where: { bookingId: id } });
  const combination = (meta?.combination ?? "storage-only") as Combination;
  const newPrice = await priceFor({ startsAt: current.startsAt, endsAt: input.endsAt, pieces: current.pieces, combination });
  const extraCents = Math.max(0, newPrice.retailCents - (current.retailCents ?? 0));

  return prisma.$transaction(async (tx) => {
    await lockLocation(tx, current.locationId);
    // Only the added time needs new capacity; the booking already holds its original window
    const existing = await holding(tx, current.locationId, current.endsAt, input.endsAt);
    const check = fits({ id, start: current.endsAt, end: input.endsAt, pieces: current.pieces }, existing, current.location.capacityPieces);
    if (!check.ok) throw new HttpError(409, `Cannot extend: ${check.available} of ${current.location.capacityPieces} spaces free at the busiest time of the extension.`);
    const extensions = [...((meta?.extensions as object[] | null) ?? []), { at: new Date().toISOString(), previousEnd: current.endsAt.toISOString(), newEnd: input.endsAt.toISOString(), extraCents, by: actor.name, note: input.note ?? null }];
    const booking = await tx.storageBooking.update({
      where: { id },
      data: { endsAt: input.endsAt, retailCents: newPrice.retailCents, ...(current.status === "OVERSTAY" && input.endsAt > new Date() ? { status: "CHECKED_IN" } : {}) },
    });
    await tx.storageBookingMeta.update({ where: { bookingId: id }, data: { extensions: extensions as Prisma.InputJsonValue, pricing: newPrice as unknown as Prisma.InputJsonValue } });
    if (current.orderId) {
      await tx.orderEvent.create({ data: { orderId: current.orderId, type: "STORAGE", detail: `Storage extended to ${input.endsAt.toISOString()}`, actorType: "staff", actorId: actor.id, actorName: actor.name, uploadIds: [], customerVisible: true } });
    }
    return { booking, extraCents };
  });
}

export async function cancelBooking(id: string, reason: string, actor: Actor) {
  const b = await prisma.storageBooking.findUnique({ where: { id } });
  if (!b) throw new HttpError(404, "Storage booking not found.");
  if (b.status !== "RESERVED") throw new HttpError(409, "Only reserved (not yet checked-in) bookings can be cancelled.");
  await prisma.storageBooking.update({ where: { id }, data: { status: "CANCELLED" } });
  await prisma.storageBookingMeta.update({ where: { bookingId: id }, data: { cancelReason: reason } });
  if (b.orderId) await addOrderEvent({ orderId: b.orderId, type: "STORAGE", detail: `Storage booking ${b.reference} cancelled`, actorType: "staff", actorId: actor.id, actorName: actor.name, customerVisible: true });
}

/* -------------------------------- Intake --------------------------------- */

export const checkInSchema = z.object({
  pieceCount: z.coerce.number().int().min(1).max(5000),
  /** Piece IDs (order bookings) or tag codes (standalone) recorded at intake */
  tags: z.array(z.string().trim().min(1).max(60)).max(5000).default([]),
  /** { tag: bay } */
  bays: z.record(z.string(), z.string().trim().max(30)).default({}),
  conditionNotes: z.string().max(2000).optional().or(z.literal("")),
  uploadIds: z.array(z.string()).max(30).default([]),
});

export async function checkIn(id: string, input: z.infer<typeof checkInSchema>, actor: Actor) {
  const b = await prisma.storageBooking.findUnique({ where: { id }, include: { location: true, order: { include: { pieces: true } } } });
  if (!b) throw new HttpError(404, "Storage booking not found.");
  if (b.status !== "RESERVED") throw new HttpError(409, "This booking is not waiting for intake.");
  if (input.pieceCount > b.pieces) throw new HttpError(409, `More pieces (${input.pieceCount}) than reserved (${b.pieces}). Extend the booking or create a new one first.`);
  await assertUploads(input.uploadIds, "storage-booking", id);

  const custody = `storage:${b.location.code}`;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.storageBooking.update({ where: { id }, data: { status: "CHECKED_IN", checkedInAt: now } });
    await tx.storageBookingMeta.update({
      where: { bookingId: id },
      data: { intakeCount: input.pieceCount, pieceTags: input.tags, bays: input.bays as Prisma.InputJsonValue, intakeNotes: input.conditionNotes || null, intakeUploadIds: input.uploadIds, checkedInBy: actor.name },
    });
    if (b.order) {
      const known = new Map(b.order.pieces.map((p) => [p.pieceId, p]));
      for (const tag of input.tags) {
        const piece = known.get(tag);
        if (!piece) continue;
        await tx.orderPiece.update({ where: { id: piece.id }, data: { custodyLocation: custody, storageBay: input.bays[tag] ?? null, ...(input.conditionNotes ? { conditionNotes: input.conditionNotes } : {}) } });
        await tx.orderEvent.create({ data: { orderId: b.order.id, pieceId: piece.id, type: "STORAGE", detail: `Checked in to storage${input.bays[tag] ? `, bay ${input.bays[tag]}` : ""}`, actorType: "staff", actorId: actor.id, actorName: actor.name, uploadIds: [], customerVisible: false } });
      }
      await tx.orderEvent.create({ data: { orderId: b.order.id, type: "STORAGE", detail: `${input.pieceCount} piece(s) checked in to Express Bags storage`, actorType: "staff", actorId: actor.id, actorName: actor.name, uploadIds: input.uploadIds, customerVisible: true } });
    }
  });

  // Move the order into "At Express Bags processing / storage" when the flow allows it
  if (b.order) {
    const s = b.order.status;
    const actorRef = { type: "staff", id: actor.id, name: actor.name };
    if (["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(s)) await transitionOrder(b.order.id, "AT_FACILITY", actorRef, { detail: "At Express Bags storage" });
    else if (["CONFIRMED", "DRIVER_ASSIGNED", "EN_ROUTE"].includes(s) && !b.withPickup) {
      // Customer drop-off at storage: there is no driver pickup step for this order
      await transitionOrder(b.order.id, "AT_FACILITY", actorRef, { detail: "Customer drop-off at Express Bags storage", force: true });
    }
  }
  const mismatch = b.order && input.tags.length > 0 ? input.tags.filter((t) => !b.order!.pieces.some((p) => p.pieceId === t)) : [];
  return { ok: true, unknownTags: mismatch };
}

/* -------------------------------- Release -------------------------------- */

export const releaseSchema = z.object({
  releasedTo: z.string().trim().min(2, "Name of the authorized person").max(120),
  pieceCount: z.coerce.number().int().min(1).max(5000),
  /** release → customer collects (delivered); delivery → handed to an Express Bags driver; carrier → handed to a carrier */
  mode: z.enum(["customer", "driver", "carrier"]).default("customer"),
  signatureUploadId: z.string().optional(),
  uploadIds: z.array(z.string()).max(30).default([]),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export async function release(id: string, input: z.infer<typeof releaseSchema>, actor: Actor) {
  const b = await prisma.storageBooking.findUnique({ where: { id }, include: { order: { include: { pieces: true } } } });
  if (!b) throw new HttpError(404, "Storage booking not found.");
  if (!["CHECKED_IN", "OVERSTAY"].includes(b.status)) throw new HttpError(409, "Only checked-in luggage can be released.");
  await assertUploads([...input.uploadIds, ...(input.signatureUploadId ? [input.signatureUploadId] : [])], "storage-booking", id);
  const meta = await prisma.storageBookingMeta.findUnique({ where: { bookingId: id } });
  if (meta?.intakeCount && input.pieceCount !== meta.intakeCount && !input.notes) {
    throw new HttpError(409, `Count mismatch: ${meta.intakeCount} checked in, ${input.pieceCount} released. Add a note explaining the difference.`);
  }
  const now = new Date();
  const rules = await getActiveRules("storage");
  const overstay = overstayCharge(b.endsAt, now, b.pieces, rules);

  await prisma.$transaction(async (tx) => {
    await tx.storageBooking.update({ where: { id }, data: { status: "RELEASED", releasedAt: now } });
    await tx.storageBookingMeta.update({ where: { bookingId: id }, data: { releasedTo: input.releasedTo, releaseCount: input.pieceCount, releaseUploadIds: [...input.uploadIds, ...(input.signatureUploadId ? [input.signatureUploadId] : [])], releasedBy: actor.name, overstayCents: overstay } });
    if (b.order) {
      await tx.proofOfDelivery.create({
        data: { orderId: b.order.id, kind: input.mode === "carrier" ? "CARRIER_HANDOFF" : "RELEASE", pieceCount: input.pieceCount, recipientName: input.releasedTo, signatureUploadId: input.signatureUploadId ?? null, photoUploadIds: input.uploadIds, conditionNotes: input.notes || null },
      });
      await tx.orderPiece.updateMany({ where: { orderId: b.order.id, custodyLocation: { startsWith: "storage:" } }, data: { custodyLocation: input.mode === "customer" ? "released" : input.mode, storageBay: null } });
      await tx.orderEvent.create({ data: { orderId: b.order.id, type: "HANDOFF", detail: `${input.pieceCount} piece(s) released from storage to ${input.mode === "customer" ? "the authorized person" : input.mode === "driver" ? "an Express Bags driver" : "the carrier"}`, actorType: "staff", actorId: actor.id, actorName: actor.name, uploadIds: input.uploadIds, customerVisible: true } });
    }
  });

  if (b.order && input.mode === "customer" && ["AT_FACILITY", "OUT_FOR_DELIVERY", "IN_TRANSIT"].includes(b.order.status)) {
    await transitionOrder(b.order.id, "DELIVERED", { type: "staff", id: actor.id, name: actor.name }, { detail: "Released from storage to the authorized person" });
  }
  if (overstay > 0) await emit("storage.overstay_charge", { bookingId: id, orderId: b.orderId ?? undefined, amountCents: overstay });
  return { ok: true, overstayCents: overstay };
}

/* ------------------------- Overstay & reminders -------------------------- */

/**
 * Flags overstays and creates retrieval reminders for bookings ending within `hoursAhead`.
 * Also emits "storage.reminder" (customer notification, sent once per booking and kind by the
 * notifications module) for retrievals due within `notifyHoursAhead` and for new overstays.
 */
export async function sweepStorage(now = new Date(), hoursAhead = 6, notifyHoursAhead = 24) {
  const newlyOverdue = await prisma.storageBooking.findMany({ where: { status: "CHECKED_IN", endsAt: { lt: now } }, select: { id: true, orderId: true } });
  const overdue = await prisma.storageBooking.updateMany({ where: { id: { in: newlyOverdue.map((b) => b.id) }, status: "CHECKED_IN" }, data: { status: "OVERSTAY" } });
  const soon = await prisma.storageBooking.findMany({ where: { status: { in: ["RESERVED", "CHECKED_IN"] }, endsAt: { gt: now, lte: new Date(now.getTime() + hoursAhead * 3_600_000) } }, select: { id: true, reference: true, endsAt: true } });
  for (const b of soon) {
    await prisma.reminder.upsert({
      where: { entityType_entityId_title: { entityType: "storage", entityId: b.id, title: `Storage retrieval due ${b.reference}` } },
      update: { dueAt: b.endsAt },
      create: { entityType: "storage", entityId: b.id, title: `Storage retrieval due ${b.reference}`, dueAt: b.endsAt },
    });
  }
  // Customer reminders (the notifications module de-duplicates by booking + kind)
  const dueForNotice = await prisma.storageBooking.findMany({
    where: { status: { in: ["RESERVED", "CHECKED_IN"] }, endsAt: { gt: now, lte: new Date(now.getTime() + notifyHoursAhead * 3_600_000) } },
    select: { id: true, orderId: true },
  });
  for (const b of dueForNotice) await emit("storage.reminder", { bookingId: b.id, orderId: b.orderId ?? undefined, kind: "retrieval-due" });
  for (const b of newlyOverdue) await emit("storage.reminder", { bookingId: b.id, orderId: b.orderId ?? undefined, kind: "overstay" });
  return { overstays: overdue.count, reminders: soon.length, notified: dueForNotice.length + newlyOverdue.length };
}

/**
 * Overstay charges recorded at release that are not on an invoice yet, as lines ready for
 * billing's createInvoice({ extraLines }). Staff review and confirm them in the invoice builder;
 * nothing is billed automatically.
 */
export async function pendingOverstayCharges(orderIds: string[]) {
  if (!orderIds.length) return [];
  const bookings = await prisma.storageBooking.findMany({ where: { orderId: { in: orderIds }, status: "RELEASED" }, select: { id: true, reference: true, orderId: true, pieces: true } });
  if (!bookings.length) return [];
  const metas = await prisma.storageBookingMeta.findMany({ where: { bookingId: { in: bookings.map((b) => b.id) }, overstayCents: { gt: 0 } }, select: { bookingId: true, overstayCents: true } });
  const billed = await prisma.invoiceLine.findMany({
    where: { orderId: { in: orderIds }, description: { startsWith: "Storage overstay" }, invoice: { status: { not: "VOID" } } },
    select: { description: true },
  });
  const billedText = billed.map((l) => l.description).join("\n");
  return metas
    .map((m) => {
      const b = bookings.find((x) => x.id === m.bookingId)!;
      return { bookingId: b.id, orderId: b.orderId!, description: `Storage overstay ${b.reference} (${b.pieces} pc)`, quantity: 1, unitCents: m.overstayCents };
    })
    .filter((l) => !billedText.includes(l.description));
}

/* ------------------------- Dashboard & calendar -------------------------- */

export async function dashboard(now = new Date()) {
  const today = miamiDate(now);
  const dayStart = miamiTime(today);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
  const locations = await prisma.storageLocation.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const [intakes, releases, overstays, active] = await Promise.all([
    prisma.storageBooking.findMany({ where: { status: "RESERVED", startsAt: { gte: dayStart, lt: dayEnd } }, orderBy: { startsAt: "asc" }, include: { location: { select: { name: true } }, order: { select: { reference: true } } } }),
    prisma.storageBooking.findMany({ where: { status: { in: ["CHECKED_IN", "OVERSTAY"] }, endsAt: { gte: dayStart, lt: dayEnd } }, orderBy: { endsAt: "asc" }, include: { location: { select: { name: true } }, order: { select: { reference: true } } } }),
    prisma.storageBooking.findMany({ where: { OR: [{ status: "OVERSTAY" }, { status: "CHECKED_IN", endsAt: { lt: now } }] }, orderBy: { endsAt: "asc" }, include: { location: { select: { name: true } }, order: { select: { reference: true } } } }),
    prisma.storageBooking.findMany({ where: { status: { in: ["CHECKED_IN", "OVERSTAY"] } }, select: { locationId: true, pieces: true } }),
  ]);
  const occupancy = locations.map((l) => {
    const held = active.filter((a) => a.locationId === l.id).reduce((s, a) => s + a.pieces, 0);
    return { id: l.id, name: l.name, code: l.code, market: l.market, capacity: l.capacityPieces, held, percent: l.capacityPieces ? Math.round((held / l.capacityPieces) * 100) : 0 };
  });
  const names = await contactNames([...intakes, ...releases, ...overstays].map((b) => b.id));
  const withName = <T extends { id: string; endsAt: Date }>(b: T) => ({ ...b, contactName: names.get(b.id) ?? null, overstayHours: overstayHours(b.endsAt, now) });
  return { date: today, intakes: intakes.map(withName), releases: releases.map(withName), overstays: overstays.map(withName), occupancy };
}

async function contactNames(ids: string[]) {
  const metas = ids.length ? await prisma.storageBookingMeta.findMany({ where: { bookingId: { in: ids } }, select: { bookingId: true, contactName: true } }) : [];
  return new Map(metas.map((m) => [m.bookingId, m.contactName]));
}

export const calendarSchema = z.object({ locationId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), view: z.enum(["day", "week"]).default("day") });

export async function calendar(q: z.infer<typeof calendarSchema>) {
  const location = await prisma.storageLocation.findUnique({ where: { id: q.locationId } });
  if (!location) throw new HttpError(404, "Storage location not found.");
  const from = miamiTime(q.date);
  const days = q.view === "week" ? 7 : 1;
  const to = new Date(from.getTime() + days * 24 * 3_600_000);
  const bookings = await holding(prisma, location.id, from, to);
  const blockHours = q.view === "week" ? 24 : Number((location.rules as { blockHours?: number } | null)?.blockHours ?? 1) || 1;
  const blocks = occupancyBlocks(bookings, from, to, blockHours).map((b) => ({ start: b.start, end: b.end, peak: b.peak, capacity: location.capacityPieces, available: Math.max(0, location.capacityPieces - b.peak) }));
  return { location: { id: location.id, name: location.name, capacity: location.capacityPieces }, blocks, peak: peakOccupancy(bookings, from, to) };
}

/* ----------------------- Public availability (counts) --------------------- */

export const availabilitySchema = z
  .object({ market: z.string().min(2).max(60), start: z.coerce.date(), end: z.coerce.date(), pieces: z.coerce.number().int().min(1).max(500).default(1) })
  .refine((v) => v.end > v.start, { message: "end must be after start" });

/** Yes/no availability in a market. Never reveals locations, addresses or exact counts. */
export async function availability(q: z.infer<typeof availabilitySchema>) {
  const locations = await prisma.storageLocation.findMany({ where: { market: q.market, active: true, capacityPieces: { gt: 0 } } });
  for (const l of locations) {
    const existing = await holding(prisma, l.id, q.start, q.end);
    if (fits({ start: q.start, end: q.end, pieces: q.pieces }, existing, l.capacityPieces).ok) return { available: true };
  }
  return { available: false };
}

/* -------------------------------- Uploads -------------------------------- */

/** Uploads attached to a booking must have been uploaded for that booking. */
async function assertUploads(ids: string[], ownerType: string, ownerId: string) {
  if (!ids.length) return;
  const n = await prisma.upload.count({ where: { id: { in: ids }, ownerType, ownerId } });
  if (n !== new Set(ids).size) throw new HttpError(400, "One or more photos were not uploaded for this booking.");
}
