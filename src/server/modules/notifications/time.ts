/**
 * Miami (America/New_York) time helpers for quiet hours and customer-facing dates.
 * Uses Intl so DST changes are handled correctly regardless of the server's time zone.
 */
export const TZ = "America/New_York";

/** Wall-clock minutes since midnight in Miami for an instant. */
export function miamiMinutes(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** True when the instant falls inside [start, end) Miami time; windows may wrap midnight. */
export function inQuietHours(d: Date, q: { enabled: boolean; start: string; end: string }) {
  if (!q.enabled) return false;
  const now = miamiMinutes(d);
  const s = toMin(q.start);
  const e = toMin(q.end);
  if (s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e;
}

/** Earliest instant ≥ d outside quiet hours (minute resolution, DST safe). */
export function nextAllowedTime(d: Date, q: { enabled: boolean; start: string; end: string }) {
  if (!inQuietHours(d, q)) return d;
  // Step forward minute by minute (≤ 24h × 60) — simple and exact across DST transitions.
  const t = new Date(Math.ceil(d.getTime() / 60_000) * 60_000);
  for (let i = 0; i < 24 * 60 + 61; i++) {
    if (!inQuietHours(t, q)) return t;
    t.setTime(t.getTime() + 60_000);
  }
  return t;
}

export function formatMiamiDate(d: Date, lang: "en" | "es" = "en") {
  return new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(d);
}

export function formatMiamiTime(d: Date, lang: "en" | "es" = "en") {
  return new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
}

/** Normalize a phone to E.164 (US default). Returns null when it can't be a valid number. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^whatsapp:/i, "");
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
