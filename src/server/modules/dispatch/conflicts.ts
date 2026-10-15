/**
 * Dispatch conflict detection (pure, unit-tested). Given a proposed assignment and the day's context,
 * returns human-readable warnings. Warnings never block an assignment — the dispatcher decides —
 * but they are shown before confirming and stored on the assignment event.
 */

export type Window = { start: Date; end: Date };

export type JobCtx = {
  orderId: string;
  reference: string;
  window: Window;
  /** Facility codes on the route (airport codes, port slugs) that may need credentials */
  facilities: string[];
  pieces: number;
  totalWeightLbs: number;
};

export type EmployeeCtx = {
  id: string;
  name: string;
  status: string;
  /** Other jobs already assigned to this employee that day */
  jobs: JobCtx[];
  /** Availability blocks (UNAVAILABLE / TIME_OFF block; SHIFT / AVAILABLE allow) */
  availability: { kind: string; startsAt: Date; endsAt: Date }[];
  /** Credentials held: facility code → expiry (null = no expiry) */
  credentials: { facility: string; expiresAt: Date | null }[];
};

export type VehicleCtx = {
  id: string;
  unitNumber: string;
  status: string;
  classCode: string;
  /** Jobs already using this vehicle that day */
  jobs: JobCtx[];
  maxPieces: number | null;
  maxWeightLbs: number | null;
  registrationExpiresAt: Date | null;
  insuranceExpiresAt: Date | null;
};

export type Conflict = { code: string; severity: "warning" | "critical"; message: string };

export const overlaps = (a: Window, b: Window) => a.start < b.end && b.start < a.end;

/** Facilities that require site credentials (airports & seaports). "company" credentials are not facility-bound. */
export const CREDENTIALED_FACILITIES = new Set(["MIA", "FLL", "EYW", "PBI", "MCO", "TPA", "RSW", "portmiami", "port-everglades", "port-of-key-west", "port-of-palm-beach", "port-canaveral", "port-tampa-bay"]);

export function employeeConflicts(job: JobCtx, emp: EmployeeCtx, now = new Date()): Conflict[] {
  const out: Conflict[] = [];
  if (emp.status !== "ACTIVE") out.push({ code: "employee-inactive", severity: "critical", message: `${emp.name} is ${emp.status.toLowerCase().replace("_", " ")}.` });

  for (const other of emp.jobs) {
    if (other.orderId !== job.orderId && overlaps(job.window, other.window)) {
      out.push({ code: "employee-overlap", severity: "warning", message: `${emp.name} already has ${other.reference} in an overlapping window.` });
    }
  }

  const blocked = emp.availability.filter((a) => (a.kind === "UNAVAILABLE" || a.kind === "TIME_OFF") && overlaps(job.window, { start: a.startsAt, end: a.endsAt }));
  if (blocked.length) out.push({ code: "employee-unavailable", severity: "critical", message: `${emp.name} is marked unavailable during this window.` });

  const shifts = emp.availability.filter((a) => a.kind === "SHIFT" || a.kind === "AVAILABLE");
  if (shifts.length && !shifts.some((s) => s.startsAt <= job.window.start && s.endsAt >= job.window.end)) {
    out.push({ code: "outside-shift", severity: "warning", message: `This job falls outside ${emp.name}'s scheduled shift.` });
  }

  for (const f of job.facilities.filter((x) => CREDENTIALED_FACILITIES.has(x))) {
    const cred = emp.credentials.find((c) => c.facility === f);
    if (!cred) out.push({ code: "credential-missing", severity: "warning", message: `${emp.name} has no ${f} credential on file.` });
    else if (cred.expiresAt && cred.expiresAt < (job.window.end > now ? job.window.end : now)) {
      out.push({ code: "credential-expired", severity: "critical", message: `${emp.name}'s ${f} credential expires before this job.` });
    }
  }
  return out;
}

export function vehicleConflicts(job: JobCtx, v: VehicleCtx): Conflict[] {
  const out: Conflict[] = [];
  if (v.status !== "AVAILABLE" && v.status !== "IN_SERVICE") out.push({ code: "vehicle-status", severity: "critical", message: `Unit ${v.unitNumber} is ${v.status.toLowerCase().replaceAll("_", " ")}.` });
  for (const other of v.jobs) {
    if (other.orderId !== job.orderId && overlaps(job.window, other.window)) {
      out.push({ code: "vehicle-double-booked", severity: "warning", message: `Unit ${v.unitNumber} is already on ${other.reference} in an overlapping window.` });
    }
  }
  const day = job.window.start;
  if (v.registrationExpiresAt && v.registrationExpiresAt < day) out.push({ code: "vehicle-registration", severity: "critical", message: `Unit ${v.unitNumber} registration has expired.` });
  if (v.insuranceExpiresAt && v.insuranceExpiresAt < day) out.push({ code: "vehicle-insurance", severity: "critical", message: `Unit ${v.unitNumber} insurance has expired.` });
  // Capacity hints only when Express Bags has set thresholds (never invented)
  const loadPieces = job.pieces + v.jobs.filter((o) => o.orderId !== job.orderId && overlaps(job.window, o.window)).reduce((s, o) => s + o.pieces, 0);
  if (v.maxPieces != null && loadPieces > v.maxPieces) out.push({ code: "capacity-pieces", severity: "warning", message: `${loadPieces} pieces exceeds the ${v.maxPieces}-piece threshold for this vehicle class.` });
  if (v.maxWeightLbs != null && job.totalWeightLbs > v.maxWeightLbs) out.push({ code: "capacity-weight", severity: "warning", message: `${Math.round(job.totalWeightLbs)} lbs exceeds the ${v.maxWeightLbs} lb threshold for this vehicle class.` });
  return out;
}

/** Default windows when only a named time window is stored on the order. */
const NAMED_WINDOWS: Record<string, [number, number]> = {
  "early-morning": [5, 8],
  morning: [8, 12],
  midday: [11, 14],
  afternoon: [12, 17],
  evening: [17, 21],
  "after-hours": [21, 24],
  flexible: [8, 18],
};

/** Resolves an order's working window from explicit start/end or the named window on its service date. */
export function orderWindow(o: { serviceDate: Date; timeWindow: string | null; windowStart: Date | null; windowEnd: Date | null }): Window {
  if (o.windowStart && o.windowEnd) return { start: o.windowStart, end: o.windowEnd };
  const [h1, h2] = NAMED_WINDOWS[o.timeWindow ?? "flexible"] ?? NAMED_WINDOWS.flexible;
  const d = new Date(o.serviceDate);
  const start = new Date(d);
  start.setHours(h1, 0, 0, 0);
  const end = new Date(d);
  end.setHours(h2 === 24 ? 23 : h2, h2 === 24 ? 59 : 0, 0, 0);
  return { start, end };
}

/** Facility codes appearing on an order's stops (pickup / delivery / extra stops JSON). */
export function routeFacilities(stops: unknown[]): string[] {
  const out = new Set<string>();
  for (const s of stops) {
    const f = (s as { facility?: unknown } | null)?.facility;
    if (typeof f === "string" && f) out.add(f);
  }
  return [...out];
}
