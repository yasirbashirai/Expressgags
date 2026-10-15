import { describe, expect, it } from "vitest";
import { decideRoute, lengthPlusGirth } from "../engines/decision-engine";
import { DEFAULT_THRESHOLDS } from "../engines/config";

const loc = (market: string, type = "hotel") => ({ type: type as never, address: "Somewhere 1", market: market as never });
const base = {
  serviceType: "luggage-local" as const,
  pickup: loc("miami"),
  delivery: loc("miami", "airport"),
  items: [{ category: "standard-checked" as const, quantity: 3 }],
};

describe("decision engine", () => {
  it("standard local order → standard-quote via the local engine", () => {
    const d = decideRoute(base);
    expect(d.route).toBe("standard-quote");
    expect(d.engine).toBe("local");
    expect(d.totalPieces).toBe(3);
  });
  it("other Florida route → special-route", () => {
    expect(decideRoute({ ...base, delivery: loc("other-florida") }).route).toBe("special-route");
  });
  it("group/event and truck services always → custom-quote", () => {
    expect(decideRoute({ ...base, serviceType: "group-event" }).route).toBe("custom-quote");
    expect(decideRoute({ ...base, serviceType: "truck" }).route).toBe("custom-quote");
  });
  it("too many pieces, stops or travelers → custom-quote", () => {
    expect(decideRoute({ ...base, items: [{ category: "standard-checked", quantity: DEFAULT_THRESHOLDS.maxAutoPieces + 1 }] }).route).toBe("custom-quote");
    expect(decideRoute({ ...base, extraStops: [loc("miami"), loc("miami"), loc("miami")] }).route).toBe("custom-quote");
    expect(decideRoute({ ...base, travelers: 40 }).route).toBe("custom-quote");
  });
  it("multiple vehicles (e.g. 15 or 40 trucks) → custom-quote", () => {
    expect(decideRoute({ ...base, vehiclesNeeded: "about 15 trucks" }).route).toBe("custom-quote");
    expect(decideRoute({ ...base, vehiclesNeeded: "1 van" }).route).toBe("standard-quote");
  });
  it("oversized or heavy items over threshold → custom-quote", () => {
    expect(decideRoute({ ...base, items: [{ category: "large", quantity: 1, weightLbs: 160 }] }).route).toBe("custom-quote");
    expect(decideRoute({ ...base, items: [{ category: "special", quantity: 1, lengthIn: 80, widthIn: 20, heightIn: 20 }] }).route).toBe("custom-quote");
  });
  it("nationwide shipping → standard-quote via the carrier engine (even outside Florida)", () => {
    const d = decideRoute({ ...base, serviceType: "nationwide-shipping", delivery: loc("outside-florida", "residence") });
    expect(d.route).toBe("standard-quote");
    expect(d.engine).toBe("carrier");
  });
  it("thresholds are configurable", () => {
    expect(decideRoute(base, { ...DEFAULT_THRESHOLDS, maxAutoPieces: 2 }).route).toBe("custom-quote");
  });
  it("computes length + girth", () => {
    expect(lengthPlusGirth(30, 20, 12)).toBe(30 + 40 + 24);
  });
});
