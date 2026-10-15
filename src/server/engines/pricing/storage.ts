/**
 * Luggage storage pricing + capacity engine (Master Platform Requirements §7).
 * Storage rates are NEVER invented in code: they come from admin-configured rules.
 * Capacity checks prevent overbooking per location and calendar day.
 */
import { cents, DEFAULT_STORAGE_RULES, profitMetrics, type StoragePricingRules } from "../config";
import type { PriceLine, PriceResult } from "./local";

export type StoragePriceInput = {
  start: Date;
  end: Date;
  pieces: number;
  oversizedPieces?: number;
  withPickup?: boolean;
  withDelivery?: boolean;
  afterHours?: boolean;
};

const HOUR = 3_600_000;

export function storageDuration(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  if (!(ms > 0)) throw new Error("Storage end must be after start");
  const hours = Math.ceil(ms / HOUR);
  const days = Math.max(1, Math.ceil(hours / 24));
  return { hours, days };
}

export function priceStorage(input: StoragePriceInput, rules: StoragePricingRules = DEFAULT_STORAGE_RULES): PriceResult {
  const lines: PriceLine[] = [];
  const notes: string[] = [];
  const { hours, days } = storageDuration(input.start, input.end);

  if (rules.structure === "hourly" && hours <= rules.dayCapHours) {
    lines.push({ label: `${input.pieces} pc × ${hours} h`, cents: input.pieces * hours * rules.perPiecePerHour });
  } else {
    lines.push({ label: `${input.pieces} pc × ${days} day(s)`, cents: input.pieces * days * rules.perPiecePerDay });
  }
  if (input.oversizedPieces) lines.push({ label: `${input.oversizedPieces} oversized item(s)`, cents: input.oversizedPieces * rules.oversizedPerPiece });

  let subtotal = lines.reduce((s, l) => s + l.cents, 0);
  if (input.pieces >= rules.multiPieceDiscount.minPieces && rules.multiPieceDiscount.percent > 0) {
    const d = -cents(subtotal * (rules.multiPieceDiscount.percent / 100));
    lines.push({ label: `Multi-piece discount ${rules.multiPieceDiscount.percent}%`, cents: d });
    subtotal += d;
  }
  if (days >= rules.multiDayDiscount.minDays && rules.multiDayDiscount.percent > 0) {
    const d = -cents(subtotal * (rules.multiDayDiscount.percent / 100));
    lines.push({ label: `Multi-day discount ${rules.multiDayDiscount.percent}%`, cents: d });
    subtotal += d;
  }
  if (rules.promoPercent > 0) {
    const d = -cents(subtotal * (rules.promoPercent / 100));
    lines.push({ label: `Promotion ${rules.promoPercent}%`, cents: d });
    subtotal += d;
  }
  if (input.withPickup) { lines.push({ label: "Pickup to storage", cents: rules.pickupFee }); subtotal += rules.pickupFee; }
  if (input.withDelivery) { lines.push({ label: "Delivery from storage", cents: rules.deliveryFee }); subtotal += rules.deliveryFee; }
  if (input.afterHours) { lines.push({ label: "After-hours intake/release", cents: rules.afterHoursFee }); subtotal += rules.afterHoursFee; }

  let retail = subtotal;
  if (rules.reservePercent > 0) retail = cents(retail * (1 + rules.reservePercent / 100));
  if (retail < rules.minimumCharge) {
    lines.push({ label: "Minimum storage charge adjustment", cents: rules.minimumCharge - retail });
    notes.push("Raised to minimum storage charge");
    retail = rules.minimumCharge;
  }
  const cost = cents(retail * (rules.estimatedCostPercent / 100));
  const manualReview = retail - cost < rules.minimumProfit;
  if (manualReview) notes.push("Estimated profit is below the minimum profit rule; staff review required");

  return { lines, subtotalCents: subtotal, ...profitMetrics(cost, retail), manualReview, notes };
}

/** Overstay / extension charge when luggage is collected after the booked end. */
export function overstayCharge(bookedEnd: Date, actualEnd: Date, pieces: number, rules: StoragePricingRules = DEFAULT_STORAGE_RULES) {
  const ms = actualEnd.getTime() - bookedEnd.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * HOUR)) * pieces * rules.overstayPerPiecePerDay;
}

/* -------------------------------- Capacity -------------------------------- */

export type StorageBooking = { location: string; start: Date; end: Date; pieces: number };

export type CapacityRule = {
  /** Max pieces held at once per location (admin-defined) */
  maxPiecesByLocation: Record<string, number>;
};

/** Calendar days (UTC, yyyy-mm-dd) a booking touches. */
function daysTouched(start: Date, end: Date) {
  const out: string[] = [];
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  while (d.getTime() < end.getTime()) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Checks whether a new booking fits. Conservative: counts every booking that touches the same
 * calendar day as occupying capacity for that whole day.
 */
export function checkCapacity(request: StorageBooking, existing: StorageBooking[], rule: CapacityRule) {
  const max = rule.maxPiecesByLocation[request.location];
  if (max === undefined) return { ok: false as const, reason: "No storage capacity configured for this location", fullDays: [] as string[] };
  const fullDays: string[] = [];
  for (const day of daysTouched(request.start, request.end)) {
    const used = existing
      .filter((b) => b.location === request.location && daysTouched(b.start, b.end).includes(day))
      .reduce((s, b) => s + b.pieces, 0);
    if (used + request.pieces > max) fullDays.push(day);
  }
  return fullDays.length ? { ok: false as const, reason: "Storage capacity is full on one or more days", fullDays } : { ok: true as const, fullDays };
}
