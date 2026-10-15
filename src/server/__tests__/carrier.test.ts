import { describe, expect, it } from "vitest";
import { DEFAULT_CARRIER_RULES, profitMetrics, type CarrierPricingRules } from "../engines/config";
import { marginToPrice, markupToPrice, publicOffer, quoteCarrierShipment, selectRate, type CarrierResponse } from "../engines/pricing/carrier";

const rules = (over: Partial<CarrierPricingRules> = {}): CarrierPricingRules => ({
  ...DEFAULT_CARRIER_RULES,
  handlingFee: 0,
  pickupFee: 0,
  minimumPrice: 0,
  minimumProfitPerPiece: 0,
  multiPieceDiscount: { minPieces: 99, percent: 0 },
  ...over,
});

// The client's own example (Master Requirements §4 / §3.1)
const clientExample: CarrierResponse[] = [
  { carrier: "UPS", rates: [{ carrier: "UPS", service: "UPS 2nd Day Air", billableCostCents: 8200, transitDays: 2 }] },
  { carrier: "FedEx", rates: [{ carrier: "FedEx", service: "FedEx 2Day", billableCostCents: 7600, transitDays: 2 }] },
  { carrier: "DHL", rates: [{ carrier: "DHL", service: "DHL Express", billableCostCents: 10500, transitDays: 2 }] },
];

describe("markup vs gross margin (client example §4.1)", () => {
  it("$100 cost with 40% markup = $140 and 28.6% gross margin", () => {
    const price = markupToPrice(10000, 40);
    expect(price).toBe(14000);
    expect(profitMetrics(10000, price).marginPercent).toBe(28.6);
    expect(profitMetrics(10000, price).markupPercent).toBe(40);
  });
  it("a true 40% gross margin on $100 cost requires $166.67", () => {
    const price = marginToPrice(10000, 40);
    expect(price).toBe(16667);
    expect(profitMetrics(10000, price).marginPercent).toBe(40);
  });
  it("rejects a 100% margin", () => {
    expect(() => marginToPrice(10000, 100)).toThrow();
  });
});

describe("carrier selection", () => {
  it("picks FedEx $76 over UPS $82 and DHL $105 when all meet the transit time", () => {
    const res = quoteCarrierShipment(clientExample, { pieces: 1 }, rules());
    expect(res.status).toBe("priced");
    if (res.status !== "priced") return;
    const express = res.offers.find((o) => o.level === "express")!;
    expect(express.carrier).toBe("FedEx");
    expect(express.costCents).toBe(7600);
    expect(express.retailCents).toBe(markupToPrice(7600, 40)); // $106.40, not the raw $76
  });

  it("prefers a carrier within the tolerance", () => {
    const pick = selectRate(clientExample.flatMap((r) => r.rates!), rules({ preferredCarrier: "UPS", preferenceTolerancePercent: 10 }));
    expect(pick?.carrier).toBe("UPS"); // $82 is within 10% of $76
    const noPick = selectRate(clientExample.flatMap((r) => r.rates!), rules({ preferredCarrier: "DHL", preferenceTolerancePercent: 10 }));
    expect(noPick?.carrier).toBe("FedEx"); // $105 is not within 10%
  });

  it("lowest cost does not win if it misses the promised delivery time", () => {
    const res = quoteCarrierShipment(
      [
        { carrier: "FedEx", rates: [{ carrier: "FedEx", service: "Ground", billableCostCents: 4000, transitDays: 5 }] },
        { carrier: "UPS", rates: [{ carrier: "UPS", service: "2nd Day", billableCostCents: 9000, transitDays: 2 }] },
      ],
      { pieces: 1 },
      rules(),
    );
    if (res.status !== "priced") throw new Error("expected priced");
    expect(res.offers.find((o) => o.level === "economy")!.carrier).toBe("FedEx");
    expect(res.offers.find((o) => o.level === "express")!.carrier).toBe("UPS");
    expect(res.offers.find((o) => o.level === "next-day")).toBeUndefined();
  });

  it("skips disabled carriers and carriers prohibited for a level", () => {
    const disabled = quoteCarrierShipment(clientExample, { pieces: 1 }, rules({ disabledCarriers: ["FedEx"] }));
    if (disabled.status !== "priced") throw new Error();
    expect(disabled.offers[0].carrier).toBe("UPS");
    const prohibited = quoteCarrierShipment(clientExample, { pieces: 1 }, rules({ prohibitedCarrierLevels: { FedEx: ["express"] } }));
    if (prohibited.status !== "priced") throw new Error();
    expect(prohibited.offers.find((o) => o.level === "express")!.carrier).toBe("UPS");
  });

  it("falls back to another carrier when one API fails", () => {
    const res = quoteCarrierShipment(
      [{ carrier: "FedEx", error: "timeout" }, ...clientExample.filter((r) => r.carrier !== "FedEx")],
      { pieces: 1 },
      rules(),
    );
    if (res.status !== "priced") throw new Error();
    expect(res.carriersFailed).toEqual(["FedEx"]);
    expect(res.offers[0].carrier).toBe("UPS");
  });

  it("shows Request a Quote instead of a broken checkout when every carrier fails", () => {
    const res = quoteCarrierShipment([{ carrier: "UPS", error: "500" }, { carrier: "FedEx", error: "timeout" }], { pieces: 1 }, rules());
    expect(res.status).toBe("request-quote");
  });
});

describe("price guardrails", () => {
  it("raises a price below the minimum profit floor", () => {
    const res = quoteCarrierShipment(clientExample, { pieces: 2 }, rules({ defaultPercent: 5, minimumProfitPerPiece: 2000 }));
    if (res.status !== "priced") throw new Error();
    const o = res.offers[0];
    expect(o.profitCents).toBeGreaterThanOrEqual(4000);
    expect(o.manualReview).toBe(false);
  });
  it("routes to manual review instead of raising when raiseToFloor is off", () => {
    const res = quoteCarrierShipment(clientExample, { pieces: 1 }, rules({ defaultPercent: 5, minimumPrice: 30000, raiseToFloor: false }));
    if (res.status !== "priced") throw new Error();
    expect(res.offers[0].manualReview).toBe(true);
  });
  it("adds handling, pickup, oversize and protection to cost", () => {
    const r = rules({ handlingFee: 1000, pickupFee: 2000, oversizeFeePerPiece: 500 });
    const res = quoteCarrierShipment(clientExample, { pieces: 1, oversizedPieces: 2, protectionCents: 1500 }, r);
    if (res.status !== "priced") throw new Error();
    expect(res.offers[0].costCents).toBe(7600 + 1000 + 2000 + 1000 + 1500);
  });
  it("supports true gross-margin mode", () => {
    const res = quoteCarrierShipment(clientExample, { pieces: 1 }, rules({ mode: "margin", defaultPercent: 40 }));
    if (res.status !== "priced") throw new Error();
    expect(res.offers[0].marginPercent).toBe(40);
  });
  it("hides the carrier name publicly unless configured", () => {
    const res = quoteCarrierShipment(clientExample, { pieces: 1 }, rules());
    if (res.status !== "priced") throw new Error();
    expect(publicOffer(res.offers[0], rules())).not.toHaveProperty("carrier");
    expect(publicOffer(res.offers[0], rules({ showCarrierNameBeforeCheckout: true }))).toHaveProperty("carrier", "FedEx");
  });
});
