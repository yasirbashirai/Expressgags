/**
 * Pure scheduling helpers for the job runner (unit-tested, no DB).
 * Business times are America/New_York (Miami), DST-safe.
 */

export const BUSINESS_TZ = "America/New_York";

export type Schedule =
  | { kind: "interval"; minutes: number }
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "weekly"; weekday: number; hour: number; minute: number }; // weekday 0=Sun … 1=Mon

/** Wall-clock parts of an instant in a time zone. */
export function zonedParts(at: Date, tz = BUSINESS_TZ) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second, weekday };
}

/** UTC instant for a wall-clock time in a zone (handles DST by correcting the offset twice). */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz = BUSINESS_TZ): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), tz);
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += Date.UTC(year, month - 1, day, hour, minute) - asIfUtc;
  }
  return new Date(guess);
}

/** Most recent scheduled instant at or before `now` (undefined for interval schedules). */
export function lastSlot(s: Schedule, now: Date, tz = BUSINESS_TZ): Date | undefined {
  if (s.kind === "interval") return undefined;
  const p = zonedParts(now, tz);
  let slot = zonedTimeToUtc(p.year, p.month, p.day, s.hour, s.minute, tz);
  if (s.kind === "daily") {
    if (slot > now) slot = new Date(slot.getTime() - 24 * 3600_000);
    return correct(slot, s, tz);
  }
  // weekly: step back to the right weekday
  let back = (p.weekday - s.weekday + 7) % 7;
  if (back === 0 && slot > now) back = 7;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day - back));
  return zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), s.hour, s.minute, tz);
}

// Re-anchor a daily slot after subtracting 24h across a DST change
function correct(slot: Date, s: { hour: number; minute: number }, tz: string) {
  const p = zonedParts(slot, tz);
  return zonedTimeToUtc(p.year, p.month, p.day, s.hour, s.minute, tz);
}

/** Is the job due, given when it last started? */
export function isDue(s: Schedule, now: Date, lastStartedAt: Date | null | undefined, tz = BUSINESS_TZ): boolean {
  if (s.kind === "interval") return !lastStartedAt || now.getTime() - lastStartedAt.getTime() >= s.minutes * 60_000 - 1_000;
  const slot = lastSlot(s, now, tz)!;
  return !lastStartedAt || lastStartedAt < slot;
}

export function describe(s: Schedule): string {
  const hm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ET`;
  if (s.kind === "interval") return s.minutes >= 60 ? `every ${s.minutes / 60} h` : `every ${s.minutes} min`;
  if (s.kind === "daily") return `daily ${hm(s.hour, s.minute)}`;
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][s.weekday]} ${hm(s.hour, s.minute)}`;
}
