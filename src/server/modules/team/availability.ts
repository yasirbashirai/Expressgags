/**
 * Employee availability service — also used by the dispatch board for conflict checks.
 * An employee is unavailable for a window when it overlaps a TIME_OFF/UNAVAILABLE block, or (when the
 * employee has SHIFT/AVAILABLE blocks that day) when the window falls outside every shift.
 */
import { prisma } from "../../db";

export type AvailabilityConflict = { employeeId: string; reason: "TIME_OFF" | "UNAVAILABLE" | "OUTSIDE_SHIFT" | "INACTIVE"; detail: string };

export async function availabilityConflicts(employeeIds: string[], start: Date, end: Date): Promise<AvailabilityConflict[]> {
  if (!employeeIds.length) return [];
  const dayStart = new Date(start);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(end);
  dayEnd.setUTCHours(23, 59, 59, 999);
  const [employees, blocks] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, status: true } }),
    prisma.availability.findMany({ where: { employeeId: { in: employeeIds }, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } } }),
  ]);
  const out: AvailabilityConflict[] = [];
  for (const e of employees) {
    if (e.status !== "ACTIVE") {
      out.push({ employeeId: e.id, reason: "INACTIVE", detail: `Status is ${e.status.toLowerCase().replace("_", " ")}` });
      continue;
    }
    const mine = blocks.filter((b) => b.employeeId === e.id);
    const blocking = mine.find((b) => (b.kind === "TIME_OFF" || b.kind === "UNAVAILABLE") && b.startsAt < end && b.endsAt > start);
    if (blocking) {
      out.push({ employeeId: e.id, reason: blocking.kind as "TIME_OFF" | "UNAVAILABLE", detail: blocking.note || (blocking.kind === "TIME_OFF" ? "Time off" : "Unavailable") });
      continue;
    }
    const shifts = mine.filter((b) => b.kind === "SHIFT" || b.kind === "AVAILABLE");
    if (shifts.length && !shifts.some((b) => b.startsAt <= start && b.endsAt >= end)) {
      out.push({ employeeId: e.id, reason: "OUTSIDE_SHIFT", detail: "Window is outside this person's scheduled shift" });
    }
  }
  return out;
}
