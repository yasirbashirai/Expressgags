/**
 * Staff authentication: bcrypt passwords, JWT in an httpOnly cookie (carries the user's tokenVersion so
 * password changes / "sign out everywhere" invalidate old sessions), role-based guards, password policy,
 * TOTP two-factor helpers, hashed single-use auth tokens (invite / password reset) and the audit-log helper.
 */
import bcrypt from "bcryptjs";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "./db";
import type { Role } from "./generated/prisma/client";
import { env, isProd } from "./lib/env";
import { HttpError } from "./lib/errors";

export const COOKIE = "eb_admin";
const TTL_SECONDS = 60 * 60 * 10; // 10 hours

export type AuthUser = { id: string; email: string; role: Role; name: string | null };

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

function secret() {
  if (!env.jwtSecret || env.jwtSecret.length < 16) throw new Error("JWT_SECRET must be set (16+ characters)");
  return env.jwtSecret;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

/** Issues a fresh session (a new token on every sign-in = session rotation). */
export function issueSession(res: Response, user: AuthUser & { tokenVersion?: number }) {
  const token = jwt.sign({ sub: user.id, role: user.role, tv: user.tokenVersion ?? 0 }, secret(), { expiresIn: TTL_SECONDS });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    // Cross-site in production (site and API on different domains) needs SameSite=None + Secure
    sameSite: isProd ? "none" : "lax",
    maxAge: TTL_SECONDS * 1000,
    path: "/",
  });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE, { path: "/", httpOnly: true, secure: isProd, sameSite: isProd ? "none" : "lax" });
}

/** Requires a valid session; loads the user (inactive users are rejected). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) throw new HttpError(401, "Please sign in.");
    let payload: { sub: string; tv?: number };
    try {
      payload = jwt.verify(token, secret()) as { sub: string; tv?: number };
    } catch {
      throw new HttpError(401, "Your session has expired. Please sign in again.");
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) throw new HttpError(401, "Please sign in.");
    // Sessions issued before a password change or a forced sign-out are no longer valid
    if ((payload.tv ?? 0) !== user.tokenVersion) throw new HttpError(401, "Your session has ended. Please sign in again.");
    req.user = { id: user.id, email: user.email, role: user.role, name: user.name };
    next();
  } catch (e) {
    next(e);
  }
}

/** Role guard. OWNER can do everything. */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, "Please sign in."));
    if (req.user.role !== "OWNER" && !roles.includes(req.user.role)) return next(new HttpError(403, "You do not have permission for this action."));
    next();
  };

export async function audit(req: Request, action: string, entity: string, entityId?: string, detail?: object) {
  await prisma.auditLog.create({ data: { userId: req.user?.id, action, entity, entityId, detail: detail as object | undefined } });
}

/* ----------------------------- Password policy ----------------------------- */

/** Returns an error message, or null when the password is acceptable (12+ chars, not containing the email name). */
export function passwordProblem(pw: string, email: string): string | null {
  if (pw.length < 12) return "Use at least 12 characters.";
  if (pw.length > 200) return "Use at most 200 characters.";
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 3 && pw.toLowerCase().includes(local)) return "The password must not contain your email name.";
  if (pw.toLowerCase().includes(email.toLowerCase())) return "The password must not contain your email.";
  if (/^(.)\1+$/.test(pw)) return "Choose a less predictable password.";
  return null;
}

export function assertPasswordOk(pw: string, email: string) {
  const problem = passwordProblem(pw, email);
  if (problem) throw new HttpError(400, problem, [{ path: "password", message: problem }]);
}

/* ------------------------------ Login lockout ------------------------------ */

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

/** Records a failed attempt; locks the account for 15 minutes after 5 failures in a row. */
export async function recordFailedLogin(userId: string) {
  const u = await prisma.user.update({ where: { id: userId }, data: { failedLogins: { increment: 1 } } });
  if (u.failedLogins >= MAX_FAILED_LOGINS) {
    await prisma.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) } });
    return true;
  }
  return false;
}

/* --------------------------------- TOTP ----------------------------------- */

const TOTP_PERIOD = 30;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export const newTotpSecret = () => generateSecret();

/** TOTP secrets are stored encrypted (AES-256-GCM, key derived from JWT_SECRET): "enc:<iv>.<tag>.<data>". */
function totpKey() {
  return createHash("sha256").update(`${secret()}:totp-at-rest`).digest();
}
export function sealTotpSecret(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", totpKey(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `enc:${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}
export function openTotpSecret(stored: string) {
  if (!stored.startsWith("enc:")) return stored; // legacy plain value
  const [iv, tag, data] = stored.slice(4).split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", totpKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}
export const totpUri = (email: string, totpSecret: string) => generateURI({ issuer: "Express Bags Admin", label: email, secret: totpSecret });

/**
 * Verifies a 6-digit code (±30 s clock drift) and rejects a code from a time step that was already used.
 * Returns the matched time step or null.
 */
export function checkTotp(storedSecret: string, code: string, lastStep?: number | null): number | null {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return null;
  try {
    const r = verifySync({ secret: openTotpSecret(storedSecret), token, epochTolerance: TOTP_PERIOD }) as { valid: boolean; timeStep?: number };
    if (!r.valid) return null;
    const step = r.timeStep ?? Math.floor(Date.now() / 1000 / TOTP_PERIOD);
    if (lastStep != null && step <= lastStep) return null; // replay
    return step;
  } catch {
    return null;
  }
}

/** 10 recovery codes like ABCD-EFGH-JK; only their sha256 hashes are stored. */
export function newRecoveryCodes(n = 10) {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const codes = Array.from({ length: n }, () => {
    const b = randomBytes(10);
    const raw = Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 10)}`;
  });
  return { codes, hashes: codes.map((c) => sha256(c.replace(/-/g, "").toUpperCase())) };
}
export const hashRecoveryCode = (code: string) => sha256(code.replace(/[-\s]/g, "").toUpperCase());

/* ------------------------- Single-use auth tokens -------------------------- */

/** Creates a single-use token (stored hashed). Returns the raw token for the email link. */
export async function createAuthToken(purpose: "password-reset" | "invite" | "email-verify", subjectType: "user" | "customer", subjectId: string, ttlMinutes: number) {
  const raw = randomBytes(32).toString("base64url");
  // Only one live token per purpose/subject
  await prisma.authToken.updateMany({ where: { purpose, subjectType, subjectId, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.authToken.create({ data: { purpose, subjectType, subjectId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlMinutes * 60_000) } });
  return raw;
}

/** Validates + marks a token used. Throws 400 for unknown, used or expired tokens. */
export async function consumeAuthToken(raw: string, purposes: string[], subjectType: "user" | "customer") {
  const row = await prisma.authToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!row || !purposes.includes(row.purpose) || row.subjectType !== subjectType) throw new HttpError(400, "This link is invalid. Please request a new one.");
  if (row.usedAt) throw new HttpError(400, "This link has already been used. Please request a new one.");
  if (row.expiresAt < new Date()) throw new HttpError(400, "This link has expired. Please request a new one.");
  // Atomic claim: only one concurrent request can mark it used
  const claimed = await prisma.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw new HttpError(400, "This link has already been used. Please request a new one.");
  return row;
}

/** Peek without consuming (to show the set-password form). */
export async function peekAuthToken(raw: string, purposes: string[], subjectType: "user" | "customer") {
  const row = await prisma.authToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!row || !purposes.includes(row.purpose) || row.subjectType !== subjectType || row.usedAt || row.expiresAt < new Date()) return null;
  return row;
}

/** Sets a new password and ends every other session (tokenVersion bump). */
export async function setUserPassword(userId: string, email: string, newPassword: string) {
  assertPasswordOk(newPassword, email);
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date(), tokenVersion: { increment: 1 }, mustChangePassword: false, failedLogins: 0, lockedUntil: null },
  });
}

/** Public URL of the website (for links in emails). */
export const webBaseUrl = () => (process.env.NEXT_PUBLIC_SITE_URL && process.env.NODE_ENV === "production" ? process.env.NEXT_PUBLIC_SITE_URL : (process.env.WEB_ORIGIN || "http://localhost:3000").split(",")[0]).replace(/\/$/, "");
