import { describe, expect, it } from "vitest";
import { DEFAULT_LOCAL_RULES, DEFAULT_STORAGE_RULES } from "../engines/config";
import { priceLocal, zonePairKey } from "../engines/pricing/local";
import { checkCapacity, overstayCharge, priceStorage, storageDuration } from "../engines/pricing/storage";

describe("local pricing engine", () => {
  it("uses the same-zone base plus per-piece charges", () => {
    const r = priceLocal({ pickupZone: "MIA-BEACH", deliveryZone: "MIA-BEACH", pieces: [{ category: "standard-checked", quantity: 2 }] });
    expect(r.subtotalCents).toBe(DEFAULT_LOCAL_RULES.sameZoneBase + 2 * DEFAULT_LOCAL_RULES.perPiece["standard-checked"]);
  });
  it("uses an explicit zone-pair price in either direction", () => {
    const rules = { ...DEFAULT_LOCAL_RULES, zonePairBase: { [zonePairKey("MIA", "FLL")]: 15000 } };
    const a = priceLocal({ pickupZone: "FLL", deliveryZone: "MIA", pieces: [] }, rules);
    expect(a.lines[0].cents).toBe(15000);
  });
  it("falls back to per-mile with a minimum distance", () => {
    const r = priceLocal({ pickupZone: "A", deliveryZone: "B", miles: 4, pieces: [] });
    expect(r.lines[0].cents).toBe(DEFAULT_LOCAL_RULES.minimumMilesCharged * DEFAULT_LOCAL_RULES.perMile);
  });
  it("applies location surcharges, tolls, waiting and urgent multiplier", () => {
    const base = priceLocal({ pickupZone: "A", deliveryZone: "A", pieces: [], pickupLocationType: "airport" });
    const urgent = priceLocal({ pickupZone: "A", deliveryZone: "A", pieces: [], pickupLocationType: "airport", urgent: true, tollsCents: 500, waitingHours: 1 });
    expect(urgent.subtotalCents).toBeGreaterThan(base.subtotalCents);
    expect(urgent.lines.some((l) => l.label === "Urgent service")).toBe(true);
  });
  it("enforces the minimum charge", () => {
    const rules = { ...DEFAULT_LOCAL_RULES, sameZoneBase: 1000, minimumCharge: 8500 };
    const r = priceLocal({ pickupZone: "A", deliveryZone: "A", pieces: [] }, rules);
    expect(r.retailCents).toBe(8500);
  });
  it("flags manual review when profit is below the minimum", () => {
    const rules = { ...DEFAULT_LOCAL_RULES, estimatedCostPercent: 95, minimumProfit: 5000 };
    const r = priceLocal({ pickupZone: "A", deliveryZone: "A", pieces: [] }, rules);
    expect(r.manualReview).toBe(true);
  });
  it("reports cost, retail, profit, markup and margin", () => {
    const r = priceLocal({ pickupZone: "A", deliveryZone: "A", pieces: [{ category: "large", quantity: 1 }] });
    expect(r.profitCents).toBe(r.retailCents - r.costCents);
    expect(r.marginPercent).toBeCloseTo(100 - DEFAULT_LOCAL_RULES.estimatedCostPercent, 0);
  });
});

describe("storage pricing engine", () => {
  const start = new Date("2026-11-01T10:00:00Z");
  it("charges per piece per day", () => {
    const r = priceStorage({ start, end: new Date("2026-11-03T09:00:00Z"), pieces: 2 });
    expect(r.lines[0].cents).toBe(2 * 2 * DEFAULT_STORAGE_RULES.perPiecePerDay);
  });
  it("charges hourly within the day cap in hourly mode", () => {
    const rules = { ...DEFAULT_STORAGE_RULES, structure: "hourly" as const, minimumCharge: 0 };
    const r = priceStorage({ start, end: new Date("2026-11-01T13:00:00Z"), pieces: 2 }, rules);
    expect(r.lines[0].cents).toBe(2 * 3 * rules.perPiecePerHour);
  });
  it("adds pickup and delivery fees and the minimum charge", () => {
    const r = priceStorage({ start, end: new Date("2026-11-01T12:00:00Z"), pieces: 1, withPickup: true, withDelivery: true });
    expect(r.lines.some((l) => l.label === "Pickup to storage")).toBe(true);
    expect(r.retailCents).toBeGreaterThanOrEqual(DEFAULT_STORAGE_RULES.minimumCharge);
  });
  it("rejects an end before the start", () => {
    expect(() => storageDuration(start, start)).toThrow();
  });
  it("charges overstay per piece per started day", () => {
    expect(overstayCharge(start, new Date("2026-11-02T11:00:00Z"), 2)).toBe(2 * 2 * DEFAULT_STORAGE_RULES.overstayPerPiecePerDay);
    expect(overstayCharge(start, start, 2)).toBe(0);
  });
});

describe("storage capacity", () => {
  const rule = { maxPiecesByLocation: { MIA: 10 } };
  const d = (s: string) => new Date(s);
  const existing = [{ location: "MIA", start: d("2026-11-01T09:00Z"), end: d("2026-11-02T18:00Z"), pieces: 8 }];
  it("prevents overbooking", () => {
    const r = checkCapacity({ location: "MIA", start: d("2026-11-02T08:00Z"), end: d("2026-11-02T20:00Z"), pieces: 3 }, existing, rule);
    expect(r.ok).toBe(false);
    expect(r.fullDays).toEqual(["2026-11-02"]);
  });
  it("allows a booking that fits", () => {
    expect(checkCapacity({ location: "MIA", start: d("2026-11-02T08:00Z"), end: d("2026-11-02T20:00Z"), pieces: 2 }, existing, rule).ok).toBe(true);
    expect(checkCapacity({ location: "MIA", start: d("2026-11-04T08:00Z"), end: d("2026-11-04T20:00Z"), pieces: 10 }, existing, rule).ok).toBe(true);
  });
  it("refuses a location with no configured capacity", () => {
    expect(checkCapacity({ location: "TPA", start: d("2026-11-04T08:00Z"), end: d("2026-11-04T20:00Z"), pieces: 1 }, existing, rule).ok).toBe(false);
  });
});
