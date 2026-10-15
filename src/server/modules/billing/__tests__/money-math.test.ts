/**
 * Pure money math: Carlos's markup-vs-margin example, discounts, deposits, aging buckets,
 * cancellation refund suggestions and the internal-key stripper.
 */
import "../../../lib/env"; // loads .env so the db module can be imported
import { describe, expect, it } from "vitest";
import { agingBucket } from "../invoices";
import { cancellationStage, DEFAULT_CANCELLATION_RULES, suggestRefundCents } from "../cancellation";
import { invoiceNumber, lineTotal, priceFromMargin, priceFromMarkup, quotationMath, stripInternal } from "../money";

describe("markup vs gross margin (Master §4.1)", () => {
  it("$100 cost at 40% markup sells for $140 and is a 28.6% gross margin", () => {
    expect(priceFromMarkup(10000, 40)).toBe(14000);
    const m = quotationMath([{ kind: "transport", description: "Route", quantity: 1, unitCents: 14000, unitCostCents: 10000 }]);
    expect(m.totalCents).toBe(14000);
    expect(m.profitCents).toBe(4000);
    expect(m.markupPercent).toBe(40);
    expect(m.marginPercent).toBe(28.6);
  });
  it("a true 40% gross margin on $100 cost needs $166.67", () => {
    expect(priceFromMargin(10000, 40)).toBe(16667);
    const m = quotationMath([{ kind: "transport", description: "Route", quantity: 1, unitCents: 16667, unitCostCents: 10000 }]);
    expect(m.marginPercent).toBe(40);
    expect(m.markupPercent).toBe(66.7);
  });
  it("rejects a 100% margin", () => expect(() => priceFromMargin(10000, 100)).toThrow());
});

describe("quotation totals", () => {
  const lines = [
    { kind: "truck" as const, description: "26-ft box truck", quantity: 2, unit: "truck", unitCents: 45000, unitCostCents: 30000 },
    { kind: "helper" as const, description: "Helpers", quantity: 6, unit: "hour", unitCents: 4500, unitCostCents: 2500 },
    { kind: "discount" as const, description: "Partner discount", quantity: 1, unitCents: 5000 },
  ];
  it("adds lines, subtracts discounts and computes cost/profit", () => {
    const m = quotationMath(lines);
    expect(m.subtotalCents).toBe(90000 + 27000);
    expect(m.discountCents).toBe(5000);
    expect(m.totalCents).toBe(112000);
    expect(m.costCents).toBe(60000 + 15000);
    expect(m.profitCents).toBe(37000);
  });
  it("discount lines are always negative", () => expect(lineTotal({ kind: "discount", quantity: 1, unitCents: 1000 })).toBe(-1000));
  it("percent and flat deposits", () => {
    expect(quotationMath(lines, { type: "percent", value: 25 }).depositCents).toBe(28000);
    expect(quotationMath(lines, { type: "flat", value: 50000 }).depositCents).toBe(50000);
    expect(quotationMath(lines, { type: "flat", value: 999999999 }).depositCents).toBe(112000); // capped at total
    expect(quotationMath(lines, { type: "none", value: 0 }).depositCents).toBe(0);
  });
  it("never goes below zero", () => {
    expect(quotationMath([{ kind: "discount", description: "x", quantity: 1, unitCents: 500 }]).totalCents).toBe(0);
  });
});

describe("invoice numbering format", () => {
  it("pads to six digits", () => {
    expect(invoiceNumber(1)).toBe("EB-INV-000001");
    expect(invoiceNumber(123456)).toBe("EB-INV-123456");
  });
});

describe("aging buckets", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
  it("buckets by days past due", () => {
    expect(agingBucket(null, now)).toBe("current");
    expect(agingBucket(new Date(now.getTime() + 86400000), now)).toBe("current");
    expect(agingBucket(daysAgo(1), now)).toBe("1-30");
    expect(agingBucket(daysAgo(30), now)).toBe("1-30");
    expect(agingBucket(daysAgo(31), now)).toBe("31-60");
    expect(agingBucket(daysAgo(75), now)).toBe("61-90");
    expect(agingBucket(daysAgo(91), now)).toBe("90+");
  });
});

describe("cancellation stages (placeholder rules)", () => {
  it("maps order state to a stage", () => {
    expect(cancellationStage({ status: "CONFIRMED", hasCarrierLabel: false, storageStarted: false })).toBe("before-dispatch");
    expect(cancellationStage({ status: "EN_ROUTE", hasCarrierLabel: false, storageStarted: false })).toBe("driver-dispatched");
    expect(cancellationStage({ status: "PICKED_UP", hasCarrierLabel: false, storageStarted: false })).toBe("after-pickup");
    expect(cancellationStage({ status: "CONFIRMED", hasCarrierLabel: true, storageStarted: false })).toBe("label-purchased");
    expect(cancellationStage({ status: "AT_FACILITY", hasCarrierLabel: false, storageStarted: true })).toBe("storage-started");
  });
  it("suggests a refund, never negative", () => {
    expect(suggestRefundCents(10000, "before-dispatch", DEFAULT_CANCELLATION_RULES)).toBe(10000);
    expect(suggestRefundCents(10000, "driver-dispatched", DEFAULT_CANCELLATION_RULES)).toBe(5000);
    expect(suggestRefundCents(10000, "after-pickup", { ...DEFAULT_CANCELLATION_RULES, feeCents: { ...DEFAULT_CANCELLATION_RULES.feeCents, "after-pickup": 2000 } })).toBe(0);
  });
});

describe("internal economics never leak", () => {
  it("strips cost/margin keys at any depth", () => {
    const out = stripInternal({ totalCents: 1, costCents: 2, lines: [{ unitCents: 3, unitCostCents: 4 }], nested: { marginPct: 5, markupPercent: 6, ok: true } });
    expect(JSON.stringify(out)).not.toMatch(/costCents|unitCostCents|marginPct|markupPercent/);
    expect(out).toEqual({ totalCents: 1, lines: [{ unitCents: 3 }], nested: { ok: true } });
  });
});

describe("engine labels are customer-ready", async () => {
  const { humanizeLabel } = await import("../../quotations/index");
  it("replaces internal codes with readable names", () => {
    expect(humanizeLabel("Local trip within miami")).toBe("Local trip within Miami & Miami-Dade");
    expect(humanizeLabel("6 × standard-checked")).toBe("6 × standard checked luggage");
    expect(humanizeLabel("Delivery at cruise-port")).toBe("Delivery at cruise port");
    expect(humanizeLabel("Vehicle box-26")).toBe("Vehicle 26-ft box truck");
  });
});
