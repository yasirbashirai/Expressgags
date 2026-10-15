/** Pure storage capacity math: interval peaks, back-to-back bookings, blocks, overstay hours. */
import { describe, expect, it } from "vitest";
import { fits, occupancyBlocks, overstayHours, peakOccupancy } from "../capacity";

const at = (h: number) => new Date(Date.UTC(2026, 10, 20, h));

describe("storage capacity", () => {
  it("computes the true peak, not the daily sum", () => {
    const bookings = [
      { start: at(8), end: at(12), pieces: 6 }, // morning
      { start: at(14), end: at(18), pieces: 6 }, // afternoon — never overlaps the morning
    ];
    expect(peakOccupancy(bookings, at(0), at(24))).toBe(6);
    // A per-day check would see 12 pieces; the interval check lets both fit in a 10-piece location
    expect(fits({ start: at(14), end: at(18), pieces: 6 }, [bookings[0]], 10).ok).toBe(true);
  });

  it("refuses a booking that would exceed capacity at any moment", () => {
    const existing = [{ start: at(8), end: at(16), pieces: 7 }];
    const r = fits({ start: at(12), end: at(20), pieces: 4 }, existing, 10);
    expect(r.ok).toBe(false);
    expect(r.available).toBe(3);
    expect(fits({ start: at(12), end: at(20), pieces: 3 }, existing, 10).ok).toBe(true);
  });

  it("treats a pickup at 2 PM and a drop-off at 2 PM as back to back", () => {
    const existing = [{ start: at(8), end: at(14), pieces: 10 }];
    expect(fits({ start: at(14), end: at(18), pieces: 10 }, existing, 10).ok).toBe(true);
  });

  it("ignores the booking itself when re-checking (extensions)", () => {
    const existing = [{ id: "a", start: at(8), end: at(12), pieces: 10 }];
    expect(fits({ id: "a", start: at(8), end: at(14), pieces: 10 }, existing, 10).ok).toBe(true);
  });

  it("reports hour blocks with the peak in each block", () => {
    const blocks = occupancyBlocks([{ start: at(9), end: at(11), pieces: 4 }], at(8), at(12), 1);
    expect(blocks.map((b) => b.peak)).toEqual([0, 4, 4, 0]);
  });

  it("counts overstay hours after the booked end", () => {
    expect(overstayHours(at(10), at(9))).toBe(0);
    expect(overstayHours(at(10), new Date(at(12).getTime() + 1))).toBe(3);
  });
});
