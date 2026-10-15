/**
 * Business time zone helpers (Miami, America/New_York): the office schedules in Miami time
 * whatever time zone a viewer is in. Pure functions (unit-tested, DST-safe).
 */

export const BUSINESS_TZ = "America/New_York";

/** Wall-clock parts of an instant in the business time zone. */
export function zonedParts(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), weekday: p.weekday as string };
}

/** UTC instant for a wall-clock time in the business time zone (handles DST). */
export function zonedToUtc(y: number, m: number, d: number, h = 0, min = 0) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const p = zonedParts(new Date(guess));
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - guess; // zone minus UTC
  const first = new Date(guess - offset);
  // Re-check once (DST boundaries)
  const p2 = zonedParts(first);
  const offset2 = Date.UTC(p2.y, p2.m - 1, p2.d, p2.h, p2.min) - first.getTime();
  return new Date(guess - offset2);
}

/** "yyyy-mm-ddThh:mm" (datetime-local value) of an instant, in business time. */
export function zonedInput(d: Date) {
  const p = zonedParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}

/** Parse a datetime-local value as business time → UTC Date. */
export function fromZonedInput(v: string) {
  const [date, t = "00:00"] = v.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = t.split(":").map(Number);
  return zonedToUtc(y, m, d, h, min);
}

export const zonedTime = (iso: string | Date) => new Date(iso).toLocaleTimeString("en-US", { timeZone: BUSINESS_TZ, hour: "numeric", minute: "2-digit" });
