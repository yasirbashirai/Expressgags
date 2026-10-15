/**
 * Driver module service layer: who the signed-in driver is, which jobs they may see, scan state,
 * and the idempotency log that makes offline replays safe.
 *
 * Privacy: drivers only ever see orders they are assigned to (OWNER may act on any order for testing
 * and office support). Internal economics (cost/margin/pricing) are never returned here.
 */
import type { Request } from "express";
import { prisma } from "../../db";
import type { OrderStatus, Prisma } from "../../generated/prisma/client";
import { HttpError } from "../../lib/errors";

/** Florida operations run on Eastern time; "today" is the ET calendar day. */
export const OPS_TZ = "America/New_York";

/** Start of the ET calendar day containing `d`, as a UTC Date. */
export function etDayStart(d = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: OPS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const y = get("year"), m = get("month"), day = get("day");
  // Offset of ET at that moment (handles DST): compare the same wall clock in UTC vs ET
  const probe = new Date(Date.UTC(y, m - 1, day, 12));
  const etNoon = new Date(probe.toLocaleString("en-US", { timeZone: OPS_TZ }));
  const utcNoon = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = utcNoon.getTime() - etNoon.getTime();
  return new Date(Date.UTC(y, m - 1, day) + offsetMs);
}

export type DriverActor = {
  userId: string;
  role: string;
  employeeId: string | null;
  name: string;
};

/** Resolve the signed-in staff user to their Employee record (drivers must have one). */
export async function resolveDriver(req: Request): Promise<DriverActor> {
  const user = req.user!;
  const employee = await prisma.employee.findUnique({ where: { userId: user.id } });
  if (!employee && user.role !== "OWNER") throw new HttpError(403, "Your login is not linked to a driver profile. Please contact dispatch.");
  if (employee && employee.status !== "ACTIVE") throw new HttpError(403, "Your driver profile is not active. Please contact dispatch.");
  return {
    userId: user.id,
    role: user.role,
    employeeId: employee?.id ?? null,
    name: employee ? `${employee.firstName} ${employee.lastName}` : user.name || user.email,
  };
}

/** Assignment filter for this driver (OWNER without an employee profile may see every active assignment). */
export function assignmentScope(actor: DriverActor): Prisma.AssignmentWhereInput {
  const base: Prisma.AssignmentWhereInput = { status: { not: "REMOVED" } };
  return actor.employeeId ? { ...base, employeeId: actor.employeeId } : base;
}

/** Throws 404 unless the driver is assigned to the order (no information leak about other orders). */
export async function requireAssignment(actor: DriverActor, orderId: string) {
  const assignment = await prisma.assignment.findFirst({
    where: { ...assignmentScope(actor), orderId },
    orderBy: { assignedAt: "desc" },
  });
  if (!assignment) throw new HttpError(404, "Job not found or no longer assigned to you.");
  return assignment;
}

/** Event actor fields for the chain-of-custody log. */
export const actorFields = (a: DriverActor) => ({ actorType: "employee", actorId: a.employeeId ?? a.userId, actorName: a.name });
export const transitionActor = (a: DriverActor) => ({ type: "employee", id: a.employeeId ?? a.userId, name: a.name });

/** Scan stages; stored as the SCAN event detail prefix "STAGE:<stage>". */
export const SCAN_STAGES = ["PICKUP", "FACILITY", "DELIVERY"] as const;
export type ScanStage = (typeof SCAN_STAGES)[number];

/** Piece IDs scanned at each stage (distinct), derived from the chain-of-custody log. */
export async function scannedByStage(orderId: string): Promise<Record<ScanStage, string[]>> {
  const scans = await prisma.orderEvent.findMany({
    where: { orderId, type: "SCAN", pieceId: { not: null } },
    select: { detail: true, piece: { select: { pieceId: true } } },
  });
  const out: Record<ScanStage, Set<string>> = { PICKUP: new Set(), FACILITY: new Set(), DELIVERY: new Set() };
  for (const s of scans) {
    const stage = (s.detail?.match(/^STAGE:(\w+)/)?.[1] ?? "") as ScanStage;
    if (out[stage] && s.piece) out[stage].add(s.piece.pieceId);
  }
  return { PICKUP: [...out.PICKUP], FACILITY: [...out.FACILITY], DELIVERY: [...out.DELIVERY] };
}

/** Normalize what a driver typed or a camera decoded into a piece ID (QR may hold a URL or lowercase text). */
export function normalizePieceCode(raw: string): string {
  const s = raw.trim().toUpperCase();
  const m = s.match(/EB-\d{6}-[A-Z0-9]{4}-\d{2,3}/);
  return m ? m[0] : s;
}

/** Statuses a driver may set directly (PICKED_UP / DELIVERED only through a proof). */
export const DRIVER_SETTABLE: OrderStatus[] = ["EN_ROUTE", "AT_FACILITY", "TRANSFERRED_TO_CARRIER", "IN_TRANSIT", "OUT_FOR_DELIVERY"];

// ---------------------------------------------------------------------------
// Idempotency (offline replay safety)
// ---------------------------------------------------------------------------

export function idempotencyKey(req: Request): string | null {
  const k = req.get("idempotency-key");
  if (!k) return null;
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(k)) throw new HttpError(400, "Invalid Idempotency-Key.");
  return k;
}

/**
 * Runs `fn` once per idempotency key. A replay with the same key returns the stored response
 * instead of repeating the action (e.g. a scan queued offline and retried twice).
 */
type Body = Record<string, unknown>;

export async function once(
  req: Request,
  actor: DriverActor,
  action: string,
  orderId: string | null,
  fn: () => Promise<{ status: number; body: Body }>,
): Promise<{ status: number; body: Body; replayed: boolean }> {
  const key = idempotencyKey(req);
  if (key) {
    const prev = await prisma.driverActionLog.findUnique({ where: { key } });
    if (prev) {
      if (prev.userId !== actor.userId) throw new HttpError(409, "Idempotency key already used.");
      return { status: prev.status, body: prev.response as Body, replayed: true };
    }
  }
  const result = await fn();
  // Only successful outcomes are remembered: a refused action (e.g. "2 pieces not scanned") may be retried with the same key
  if (key && result.status < 400) {
    await prisma.driverActionLog
      .create({ data: { key, userId: actor.userId, employeeId: actor.employeeId, action, orderId, status: result.status, response: result.body as Prisma.InputJsonValue } })
      .catch(() => undefined); // a concurrent duplicate already logged it
  }
  return { ...result, replayed: false };
}
