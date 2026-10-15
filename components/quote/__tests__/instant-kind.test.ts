import { describe, expect, it } from "vitest";
import { instantKind } from "../instant-kind";

describe("instantKind (which instant flow the wizard offers)", () => {
  const on = { instantBookingEnabled: true, carrierShippingEnabled: true };
  it("is off when the owner has not approved instant pricing", () => {
    expect(instantKind("airport", null)).toBeNull();
    expect(instantKind("nationwide-shipping", { instantBookingEnabled: true, carrierShippingEnabled: false })).toBeNull();
  });
  it("never offers instant prices for group/event programs", () => {
    expect(instantKind("group-event", on)).toBeNull();
  });
  it("routes shipping to carrier levels and everything else to the local engine", () => {
    expect(instantKind("nationwide-shipping", on)).toBe("shipping");
    expect(instantKind("cruise", on)).toBe("local");
    expect(instantKind("storage", on)).toBe("local");
  });
});
