import { describe, expect, it } from "vitest";
import { employeeConflicts, orderWindow, overlaps, routeFacilities, vehicleConflicts, type EmployeeCtx, type JobCtx, type VehicleCtx } from "../conflicts";

const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m);
const job = (id: string, h1: number, h2: number, extra: Partial<JobCtx> = {}): JobCtx => ({ orderId: id, reference: `EB-${id}`, window: { start: at(h1), end: at(h2) }, facilities: [], pieces: 10, totalWeightLbs: 300, ...extra });
const emp = (over: Partial<EmployeeCtx> = {}): EmployeeCtx => ({ id: "e1", name: "Sam Rivera", status: "ACTIVE", jobs: [], availability: [], credentials: [], ...over });
const veh = (over: Partial<VehicleCtx> = {}): VehicleCtx => ({ id: "v1", unitNumber: "T-20", status: "AVAILABLE", classCode: "box-20", jobs: [], maxPieces: null, maxWeightLbs: null, registrationExpiresAt: null, insuranceExpiresAt: null, ...over });
const codes = (c: { code: string }[]) => c.map((x) => x.code).sort();

describe("window helpers", () => {
  it("detects overlap but not touching windows", () => {
    expect(overlaps({ start: at(8), end: at(10) }, { start: at(9), end: at(11) })).toBe(true);
    expect(overlaps({ start: at(8), end: at(10) }, { start: at(10), end: at(11) })).toBe(false);
  });
  it("resolves named windows and explicit times", () => {
    const d = new Date(2026, 10, 20, 12);
    expect(orderWindow({ serviceDate: d, timeWindow: "morning", windowStart: null, windowEnd: null }).start.getHours()).toBe(8);
    expect(orderWindow({ serviceDate: d, timeWindow: "afternoon", windowStart: null, windowEnd: null }).end.getHours()).toBe(17);
    expect(orderWindow({ serviceDate: d, timeWindow: "morning", windowStart: at(6, 30), windowEnd: at(7) }).start.getMinutes()).toBe(30);
  });
  it("collects facilities from stops", () => {
    expect(routeFacilities([{ facility: "MIA" }, { address: "Hotel" }, { facility: "portmiami" }, null]).sort()).toEqual(["MIA", "portmiami"]);
  });
});

describe("employee conflicts", () => {
  it("is clean for an available, credentialed driver", () => {
    expect(employeeConflicts(job("a", 8, 10, { facilities: ["MIA"] }), emp({ credentials: [{ facility: "MIA", expiresAt: new Date(2030, 0, 1) }] }))).toEqual([]);
  });
  it("flags overlapping jobs, unavailability, inactive status", () => {
    const c = employeeConflicts(job("a", 8, 10), emp({ status: "ON_LEAVE", jobs: [job("b", 9, 11)], availability: [{ kind: "TIME_OFF", startsAt: at(7), endsAt: at(12) }] }));
    expect(codes(c)).toEqual(["employee-inactive", "employee-overlap", "employee-unavailable"]);
  });
  it("ignores the same order and non-overlapping jobs", () => {
    expect(employeeConflicts(job("a", 8, 10), emp({ jobs: [job("a", 8, 10), job("c", 10, 12)] }))).toEqual([]);
  });
  it("warns when the job is outside the scheduled shift", () => {
    expect(codes(employeeConflicts(job("a", 18, 20), emp({ availability: [{ kind: "SHIFT", startsAt: at(7), endsAt: at(16) }] })))).toEqual(["outside-shift"]);
  });
  it("flags missing and expired port/airport credentials, not plain hotels", () => {
    expect(codes(employeeConflicts(job("a", 8, 10, { facilities: ["portmiami", "hotel-x"] }), emp()))).toEqual(["credential-missing"]);
    expect(codes(employeeConflicts(job("a", 8, 10, { facilities: ["FLL"] }), emp({ credentials: [{ facility: "FLL", expiresAt: at(9) }] }), at(7)))).toEqual(["credential-expired"]);
  });
});

describe("vehicle conflicts", () => {
  it("flags maintenance status and double booking", () => {
    expect(codes(vehicleConflicts(job("a", 8, 10), veh({ status: "MAINTENANCE", jobs: [job("b", 9, 12)] })))).toEqual(["vehicle-double-booked", "vehicle-status"]);
  });
  it("flags expired registration/insurance", () => {
    expect(codes(vehicleConflicts(job("a", 8, 10), veh({ registrationExpiresAt: new Date(2026, 0, 1), insuranceExpiresAt: new Date(2026, 5, 1) })))).toEqual(["vehicle-insurance", "vehicle-registration"]);
  });
  it("gives capacity hints only when thresholds are configured", () => {
    expect(vehicleConflicts(job("a", 8, 10, { pieces: 500, totalWeightLbs: 9000 }), veh())).toEqual([]);
    expect(codes(vehicleConflicts(job("a", 8, 10, { pieces: 30, totalWeightLbs: 900 }), veh({ maxPieces: 40, maxWeightLbs: 800, jobs: [job("b", 9, 11, { pieces: 15 })] })))).toEqual(["capacity-pieces", "capacity-weight", "vehicle-double-booked"]);
  });
});
