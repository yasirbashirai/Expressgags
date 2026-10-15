/**
 * Interval-based storage capacity (Master Requirements §7.4: many customers book throughout the day,
 * never exceed the location's limit). Unlike the engine's conservative per-day check, this computes the
 * true PEAK number of pieces held at any moment, so a morning drop-off and an evening drop-off for the
 * same shelf space don't block each other once the first is collected.
 *
 * Pure functions: the booking service wraps them in a locked transaction.
 */

export type Interval = { start: Date; end: Date; pieces: number; id?: string };

/** Booking statuses that hold capacity. */
export const HOLDING_STATUSES = ["RESERVED", "CHECKED_IN", "OVERSTAY"] as const;

/** Peak concurrent pieces within [from, to) for the given bookings. */
export function peakOccupancy(bookings: Interval[], from: Date, to: Date): number {
  type Edge = { t: number; delta: number };
  const edges: Edge[] = [];
  const f = from.getTime();
  const t = to.getTime();
  for (const b of bookings) {
    const s = Math.max(b.start.getTime(), f);
    const e = Math.min(b.end.getTime(), t);
    if (e <= s) continue; // no overlap with the window
    edges.push({ t: s, delta: b.pieces }, { t: e, delta: -b.pieces });
  }
  // Ends before starts at the same instant: a pickup at 2 PM frees space for a 2 PM drop-off
  edges.sort((a, b) => a.t - b.t || a.delta - b.delta);
  let current = 0;
  let peak = 0;
  for (const e of edges) {
    current += e.delta;
    if (current > peak) peak = current;
  }
  return peak;
}

export type CapacityCheck = { ok: boolean; capacity: number; peakBefore: number; peakAfter: number; available: number };

/** Can `request` be added without exceeding `capacity` at any moment? */
export function fits(request: Interval, existing: Interval[], capacity: number): CapacityCheck {
  const others = existing.filter((b) => !request.id || b.id !== request.id);
  const peakBefore = peakOccupancy(others, request.start, request.end);
  const peakAfter = peakOccupancy([...others, request], request.start, request.end);
  return { ok: peakAfter <= capacity, capacity, peakBefore, peakAfter, available: Math.max(0, capacity - peakBefore) };
}

/** Hour (or N-hour) blocks across a window with the peak pieces held in each block. */
export function occupancyBlocks(bookings: Interval[], from: Date, to: Date, blockHours = 1) {
  const out: { start: Date; end: Date; peak: number }[] = [];
  const step = blockHours * 3_600_000;
  for (let s = from.getTime(); s < to.getTime(); s += step) {
    const e = Math.min(s + step, to.getTime());
    out.push({ start: new Date(s), end: new Date(e), peak: peakOccupancy(bookings, new Date(s), new Date(e)) });
  }
  return out;
}

/** Hours a checked-in booking is past its booked end (0 when on time). */
export function overstayHours(bookedEnd: Date, now = new Date()) {
  const ms = now.getTime() - bookedEnd.getTime();
  return ms > 0 ? Math.ceil(ms / 3_600_000) : 0;
}

/** The five storage combinations (Master §7.1) mapped to transport flags. */
export const COMBINATIONS = {
  "storage-only": { withPickup: false, withDelivery: false, label: "Storage only (customer drops off and collects)" },
  "pickup-storage": { withPickup: true, withDelivery: false, label: "Pickup + storage" },
  "storage-delivery": { withPickup: false, withDelivery: true, label: "Storage + delivery" },
  "pickup-storage-delivery": { withPickup: true, withDelivery: true, label: "Pickup + storage + delivery (door to door)" },
  "storage-shipping": { withPickup: false, withDelivery: false, label: "Storage + nationwide shipping" },
} as const;
export type Combination = keyof typeof COMBINATIONS;
export const COMBINATION_KEYS = Object.keys(COMBINATIONS) as Combination[];
