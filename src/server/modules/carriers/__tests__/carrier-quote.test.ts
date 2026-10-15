/**
 * Nationwide quote service tests (mock carrier provider; thresholds read from the dev DB).
 * Covers: carrier eligibility rules (DHL international only, USPS ≤ 70 lb, 150 lb max), dimensional
 * weight, rate selection, partial carrier failure, all-carriers-down fallback, price floors, and that
 * the public projection never leaks costs.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.DATABASE_URL || (() => { try { process.loadEnvFile(".env"); return !!process.env.DATABASE_URL; } catch { return false; } })();
const LEAK = /costCents|unitCostCents|marginPct|marginPercent|markupPercent|profitCents|carrierService|providerRateId/;

describe("carrier eligibility & parcels (pure)", async () => {
  const { buildParcels } = await import("../quote");
  const { DEFAULT_CARRIER_SETTINGS, dimensionalWeight } = await import("../settings");

  it("excludes DHL for US-domestic and allows it internationally", () => {
    const [dom] = buildParcels([{ category: "standard-checked" }], DEFAULT_CARRIER_SETTINGS, false);
    const [intl] = buildParcels([{ category: "standard-checked" }], DEFAULT_CARRIER_SETTINGS, true);
    expect(dom.eligible).not.toContain("DHL");
    expect(intl.eligible).toContain("DHL");
  });

  it("allows USPS only up to 70 lb and nothing above 150 lb", () => {
    const [heavy] = buildParcels([{ category: "special", weightLbs: 90, lengthIn: 30, widthIn: 20, heightIn: 12 }], DEFAULT_CARRIER_SETTINGS, false);
    expect(heavy.eligible).not.toContain("USPS");
    expect(heavy.eligible).toEqual(expect.arrayContaining(["UPS", "FedEx"]));
    const [tooHeavy] = buildParcels([{ category: "special", weightLbs: 160, lengthIn: 30, widthIn: 20, heightIn: 12 }], DEFAULT_CARRIER_SETTINGS, false);
    expect(tooHeavy.eligible).toEqual([]);
  });

  it("uses default dimensions per category and computes billable (dimensional) weight", () => {
    const [p] = buildParcels([{ category: "large" }], DEFAULT_CARRIER_SETTINGS, false);
    expect(p.usedDefaults).toBe(true);
    expect(p.weightLbs).toBe(60);
    const [bulky] = buildParcels([{ category: "oversized", weightLbs: 20, lengthIn: 34, widthIn: 24, heightIn: 16 }], DEFAULT_CARRIER_SETTINGS, false);
    expect(dimensionalWeight(bulky)).toBeCloseTo(93.9, 1);
    expect(bulky.billableWeightLbs).toBeCloseTo(93.9, 1); // light but bulky → billed by size
  });

  it("respects carriers disabled in settings", () => {
    const [p] = buildParcels([{ category: "carry-on" }], { ...DEFAULT_CARRIER_SETTINGS, enabledCarriers: ["UPS"] }, false);
    expect(p.eligible).toEqual(["UPS"]);
  });
});

describe.skipIf(!hasDb)("quoteNationwide (mock provider)", async () => {
  const { quoteNationwide, publicNationwide } = await import("../quote");
  const { mockCarriers } = await import("../../../providers/mock");
  const { DEFAULT_CARRIER_RULES } = await import("../../../engines/config");
  const { DEFAULT_CARRIER_SETTINGS } = await import("../settings");

  const NY = { street1: "350 5th Ave", city: "New York", state: "NY", zip: "10118", country: "US" };
  const LDN = { street1: "10 Downing St", city: "London", state: "", zip: "SW1A 2AA", country: "GB" };
  const opts = { settings: DEFAULT_CARRIER_SETTINGS, rules: DEFAULT_CARRIER_RULES };

  afterEach(() => vi.restoreAllMocks());

  it("prices Express Bags service levels from billable carrier cost, never offering DHL domestically", async () => {
    const r = await quoteNationwide({ destination: NY, includePickup: true, pieces: [{ category: "standard-checked" }, { category: "standard-checked" }] }, opts);
    expect(r.status).toBe("priced");
    if (r.status !== "priced") return;
    expect(r.offers.map((o) => o.level)).toEqual(expect.arrayContaining(["standard", "next-day"]));
    expect(r.offers.every((o) => o.carrier !== "DHL")).toBe(true);
    for (const o of r.offers) {
      expect(o.retailCents).toBeGreaterThan(o.costCents);
      expect(r.rateRefs[o.level]).toHaveLength(2); // one label per bag
    }
    // Cost = sum of both parcels' carrier cost + handling + pickup (+ fees)
    const std = r.offers.find((o) => o.level === "standard")!;
    const refs = r.rateRefs.standard.reduce((s, x) => s + x.costCents, 0);
    expect(std.costCents).toBeGreaterThanOrEqual(refs + DEFAULT_CARRIER_RULES.handlingFee + DEFAULT_CARRIER_RULES.pickupFee);
  });

  it("offers DHL for international destinations", async () => {
    const r = await quoteNationwide({ destination: LDN, includePickup: true, pieces: [{ category: "standard-checked" }] }, opts);
    expect(r.status).toBe("priced");
    if (r.status === "priced") expect(r.offers.some((o) => o.carrier === "DHL")).toBe(true);
  });

  it("keeps quoting when one carrier fails", async () => {
    const real = mockCarriers.rates.bind(mockCarriers);
    vi.spyOn(mockCarriers, "rates").mockImplementation(async (f, t, p) => {
      const out = await real(f, t, p);
      return { ...out, rates: out.rates.filter((x) => x.carrier !== "FedEx"), errors: ["FedEx: request timed out"] };
    });
    const r = await quoteNationwide({ destination: NY, includePickup: true, pieces: [{ category: "standard-checked" }] }, opts);
    expect(r.status).toBe("priced");
    if (r.status !== "priced") return;
    expect(r.carriersFailed).toContain("FedEx");
    expect(r.offers.every((o) => o.carrier !== "FedEx")).toBe(true);
  });

  it("falls back to Request a Quote when every carrier is down", async () => {
    vi.spyOn(mockCarriers, "rates").mockRejectedValue(new Error("network down"));
    const r = await quoteNationwide({ destination: NY, includePickup: true, pieces: [{ category: "standard-checked" }] }, opts);
    expect(r.status).toBe("request-quote");
    if (r.status === "request-quote") expect(r.reason).toMatch(/temporarily unavailable/i);
  });

  it("sends pieces above carrier limits to a custom quote", async () => {
    const r = await quoteNationwide({ destination: NY, includePickup: true, pieces: [{ category: "special", weightLbs: 160, lengthIn: 40, widthIn: 30, heightIn: 20 }] }, opts);
    expect(r.status).toBe("request-quote");
    if (r.status === "request-quote") expect(r.reason).toMatch(/custom quote/i);
  });

  it("raises a too-low price to the minimum price floor", async () => {
    const rules = { ...DEFAULT_CARRIER_RULES, minimumPrice: 50_000, raiseToFloor: true };
    const r = await quoteNationwide({ destination: NY, includePickup: true, pieces: [{ category: "carry-on" }] }, { settings: DEFAULT_CARRIER_SETTINGS, rules });
    expect(r.status).toBe("priced");
    if (r.status === "priced") expect(r.offers.every((o) => o.retailCents >= 50_000)).toBe(true);
  });

  it("flags manual review (no public offer) when floors cannot be met automatically", async () => {
    const rules = { ...DEFAULT_CARRIER_RULES, minimumPrice: 50_000, raiseToFloor: false };
    const r = await quoteNationwide({ destination: NY, includePickup: true, pieces: [{ category: "carry-on" }] }, { settings: DEFAULT_CARRIER_SETTINGS, rules });
    expect(r.status).toBe("priced");
    const pub = publicNationwide(r);
    expect(pub.available).toBe(false);
  });

  it("public projection exposes Express Bags names and prices only", async () => {
    const r = await quoteNationwide({ destination: NY, includePickup: true, pieces: [{ category: "standard-checked" }] }, opts);
    const pub = publicNationwide(r);
    expect(pub.available).toBe(true);
    const json = JSON.stringify(pub);
    expect(json).not.toMatch(LEAK);
    expect(json).not.toMatch(/"carrier"/); // carrier name hidden unless showCarrierBeforeCheckout
  });

  it("shows the carrier name only when the setting allows it", async () => {
    const r = await quoteNationwide({ destination: NY, includePickup: true, pieces: [{ category: "standard-checked" }] }, { settings: { ...DEFAULT_CARRIER_SETTINGS, showCarrierBeforeCheckout: true }, rules: DEFAULT_CARRIER_RULES });
    const pub = publicNationwide(r);
    expect(JSON.stringify(pub)).toMatch(/"carrier"/);
  });
});

describe("address parsing", async () => {
  const { parseAddress } = await import("../address");
  it("parses US street, city, state and ZIP", () => {
    const a = parseAddress("233 S Wacker Dr, Chicago, IL 60606");
    expect(a).toMatchObject({ street1: "233 S Wacker Dr", city: "Chicago", state: "IL", zip: "60606", country: "US", confident: true });
  });
  it("detects international destinations", () => {
    expect(parseAddress("10 Downing St, London, United Kingdom").country).toBe("GB");
  });
});
