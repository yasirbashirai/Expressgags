/**
 * Central security controls for the Express Bags API (see docs/SECURITY.md):
 *  - browser-origin allow-list shared by CORS and the CSRF guard
 *  - CSRF guard for state-changing requests (Origin / Referer check; cookie requests without an
 *    origin are refused in production because session cookies are SameSite=None cross-site)
 *  - production configuration check at boot (refuse to start with unsafe/missing settings)
 *  - SSRF-safe fetch for provider-supplied file URLs (carrier labels)
 *  - magic-byte content sniffing for uploads
 */
import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { isIP } from "node:net";
import { env, isProd } from "./env";
import { HttpError } from "./errors";

// ---------------------------------------------------------------------------
// Origins
// ---------------------------------------------------------------------------

const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):3[0-5]\d\d$/;

/** Browser origins allowed to call the API with credentials: WEB_ORIGIN list (+ local dev ports outside production). */
export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // server-to-server / curl (CSRF guard handles cookie requests separately)
  if (env.webOrigins.includes(origin)) return true;
  return !isProd && DEV_ORIGIN.test(origin);
}

/** Paths that never carry browser sessions and authenticate by provider signature instead. */
const CSRF_EXEMPT = /^\/v1\/webhooks\//;
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SESSION_COOKIES = ["eb_admin", "eb_customer"];

function refererOrigin(ref: string | undefined) {
  if (!ref) return undefined;
  try {
    return new URL(ref).origin;
  } catch {
    return undefined;
  }
}

/**
 * CSRF guard. JSON requests already trigger a CORS preflight, but form/multipart/text POSTs do not,
 * and production session cookies are SameSite=None. So every state-changing request must come from an
 * allowed browser origin. Requests with no Origin/Referer are allowed only when they carry no session
 * cookie (server-to-server integrations), or outside production.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (!UNSAFE.has(req.method) || CSRF_EXEMPT.test(req.originalUrl)) return next();
  const origin = req.get("origin") || refererOrigin(req.get("referer"));
  if (origin) {
    if (origin === "null" || !originAllowed(origin)) return next(new HttpError(403, "This request was blocked for your security. Please reload the page and try again."));
    return next();
  }
  const hasSession = SESSION_COOKIES.some((c) => req.cookies?.[c]);
  if (hasSession && isProd) return next(new HttpError(403, "This request was blocked for your security. Please reload the page and try again."));
  next();
}

// ---------------------------------------------------------------------------
// Production configuration check
// ---------------------------------------------------------------------------

/** Returns the list of problems; empty when safe. Called by src/server/index.ts in production. */
export function productionConfigProblems(e: Record<string, string | undefined> = process.env): string[] {
  const problems: string[] = [];
  const need = (k: string) => {
    if (!e[k] || !String(e[k]).trim()) problems.push(`${k} is required`);
  };
  ["DATABASE_URL", "JWT_SECRET", "WEB_ORIGIN", "PUBLIC_WEB_URL", "IP_HASH_SALT", "UPLOAD_DIR"].forEach(need);
  if (e.JWT_SECRET && e.JWT_SECRET.length < 32) problems.push("JWT_SECRET must be at least 32 random characters");
  if (e.JWT_SECRET && /changeme|secret|password|example/i.test(e.JWT_SECRET)) problems.push("JWT_SECRET looks like a placeholder");
  if (e.IP_HASH_SALT === "eb-local-salt") problems.push("IP_HASH_SALT must not use the development default");
  for (const o of (e.WEB_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (!o.startsWith("https://")) problems.push(`WEB_ORIGIN entry must be https: ${o}`);
  }
  if (e.PROVIDERS_MODE === "mock") problems.push("PROVIDERS_MODE=mock is not allowed in production (use a staging environment)");
  if (e.DATABASE_URL && /localhost|127\.0\.0\.1/.test(e.DATABASE_URL) && e.ALLOW_LOCAL_DB !== "1") problems.push("DATABASE_URL points at localhost");
  return problems;
}

export function assertProductionConfig() {
  if (!isProd) return;
  const problems = productionConfigProblems();
  if (problems.length) {
    console.error("[api] refusing to start — unsafe production configuration:\n  - " + problems.join("\n  - "));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// SSRF-safe provider file fetch
// ---------------------------------------------------------------------------

function privateHost(host: string) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (isIP(h)) {
    return /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h) || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80");
  }
  return false;
}

/**
 * Downloads a file from a provider-supplied URL (e.g. EasyPost label_url) with SSRF protections:
 * https only, host must match an allow-listed suffix, no private/loopback hosts, no redirects to
 * other hosts, size and time limits.
 */
export async function fetchProviderFile(url: string, allowedHosts: (string | RegExp)[], opts: { maxBytes?: number; timeoutMs?: number } = {}) {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new HttpError(502, "The provider returned an invalid file link.");
  }
  const hostOk = allowedHosts.some((s) => (typeof s === "string" ? u.hostname === s || u.hostname.endsWith("." + s) : s.test(u.hostname)));
  if (u.protocol !== "https:" || !hostOk || privateHost(u.hostname)) throw new HttpError(502, "The provider file link was not trusted.");
  const res = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
  if (!res.ok) throw new HttpError(502, "The provider file could not be downloaded. Try again.");
  const len = Number(res.headers.get("content-length") || 0);
  if (len > maxBytes) throw new HttpError(502, "The provider file is too large.");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new HttpError(502, "The provider file is too large.");
  return { bytes: buf, contentType: res.headers.get("content-type")?.split(";")[0] || "application/octet-stream" };
}

// ---------------------------------------------------------------------------
// Upload content sniffing
// ---------------------------------------------------------------------------

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

/** Detects the real file kind from its first bytes. */
export function sniffKind(b: Uint8Array): "pdf" | "jpeg" | "png" | "webp" | "heic" | "ole" | "zip" | "text" | "unknown" {
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "webp";
  if (ascii(b, 4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1|heif|heis|avif)$/.test(ascii(b, 8, 12))) return "heic";
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole"; // legacy .doc/.xls
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return "zip"; // .docx/.xlsx
  // Plain text (CSV): no NUL bytes and no markup that could be rendered as HTML/SVG
  const head = b.slice(0, 4096);
  if (!head.includes(0)) {
    const s = new TextDecoder("utf-8", { fatal: false }).decode(head).trimStart().toLowerCase();
    if (/^<(!doctype|html|svg|\?xml|script)/.test(s)) return "unknown";
    return "text";
  }
  return "unknown";
}

/** File extension → acceptable sniffed kinds. */
export const EXT_KINDS: Record<string, string[]> = {
  ".pdf": ["pdf"],
  ".jpg": ["jpeg"],
  ".jpeg": ["jpeg"],
  ".png": ["png"],
  ".webp": ["webp"],
  ".heic": ["heic"],
  ".heif": ["heic"],
  ".doc": ["ole"],
  ".xls": ["ole"],
  ".docx": ["zip"],
  ".xlsx": ["zip"],
  ".csv": ["text"],
};

/** Neutralizes spreadsheet formula injection for CSV cells (=, +, -, @, tab, CR at the start). */
export function csvSafe(value: unknown): string {
  const s = value == null ? "" : String(value);
  // Plain numbers (incl. negative amounts) stay numeric; anything else starting with a formula trigger is quoted as text
  const guarded = /^-?\d+(\.\d+)?$/.test(s) ? s : /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

// ---------------------------------------------------------------------------
// Global abuse limits (safety net under the per-endpoint limits in each module)
// ---------------------------------------------------------------------------

const RATE_MSG = { ok: false, error: "Too many requests. Please wait a few minutes or call our office." };

/** Per-IP cap on ALL state-changing API requests (webhooks excluded). */
export const globalWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.GLOBAL_WRITE_RATE_LIMIT || (isProd ? 600 : 100_000)),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => !UNSAFE.has(req.method) || CSRF_EXEMPT.test(req.originalUrl),
  message: RATE_MSG,
});

/** Per-IP cap on all API requests (protects against scraping / tracking-reference enumeration). */
export const globalRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.GLOBAL_RATE_LIMIT || (isProd ? 3000 : 1_000_000)),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => CSRF_EXEMPT.test(req.originalUrl) || req.path === "/v1/health",
  message: RATE_MSG,
});
