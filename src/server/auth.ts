/**
 * Admin authentication: bcrypt passwords, JWT in an httpOnly cookie, role-based guards,
 * and an audit-log helper for every admin write.
 */
import bcrypt from "bcryptjs";
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

export function issueSession(res: Response, user: AuthUser) {
  const token = jwt.sign({ sub: user.id, role: user.role }, secret(), { expiresIn: TTL_SECONDS });
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
    let payload: { sub: string };
    try {
      payload = jwt.verify(token, secret()) as { sub: string };
    } catch {
      throw new HttpError(401, "Your session has expired. Please sign in again.");
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) throw new HttpError(401, "Please sign in.");
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
