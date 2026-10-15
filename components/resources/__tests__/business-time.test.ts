/** Miami business-time helpers used by the availability board (DST-safe). */
import { describe, expect, it } from "vitest";
import { fromZonedInput, zonedInput, zonedParts, zonedToUtc } from "../business-time";

describe("business time (America/New_York)", () => {
  it("converts Miami wall-clock time to UTC in summer (EDT, UTC-4) and winter (EST, UTC-5)", () => {
    expect(zonedToUtc(2026, 7, 1, 8, 0).toISOString()).toBe("2026-07-01T12:00:00.000Z");
    expect(zonedToUtc(2026, 12, 1, 8, 0).toISOString()).toBe("2026-12-01T13:00:00.000Z");
  });
  it("handles the DST change days", () => {
    expect(zonedToUtc(2026, 3, 8, 12, 0).toISOString()).toBe("2026-03-08T16:00:00.000Z"); // after spring-forward
    expect(zonedToUtc(2026, 11, 1, 12, 0).toISOString()).toBe("2026-11-01T17:00:00.000Z"); // after fall-back
  });
  it("round-trips datetime-local values regardless of the viewer's time zone", () => {
    const d = fromZonedInput("2026-10-20T08:30");
    expect(d.toISOString()).toBe("2026-10-20T12:30:00.000Z");
    expect(zonedInput(d)).toBe("2026-10-20T08:30");
    expect(zonedParts(d)).toMatchObject({ y: 2026, m: 10, d: 20, h: 8, min: 30, weekday: "Tue" });
  });
});
