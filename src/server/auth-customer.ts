/**
 * Customer portal authentication (separate from staff auth): bcrypt passwords, JWT in the httpOnly
 * "eb_customer" cookie. Account roles: INDIVIDUAL | COMPANY_ADMIN | COMPANY_USER | CONCIERGE.
 */
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "./db";
import { env, isProd } from "./lib/env";
import { HttpError } from "./lib/errors";

export const CUSTOMER_COOKIE = "eb_customer";
const TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export type AuthCustomer = { id: string; email: string; name: string; accountRole: string; companyId: string | null };

declare module "express-serve-static-core" {
  interface Request {
    customer?: AuthCustomer;
  }
}

const secret = () => {
  if (!env.jwtSecret || env.jwtSecret.length < 16) throw new Error("JWT_SECRET must be set (16+ characters)");
  return env.jwtSecret + ":customer"; // distinct signing domain from staff sessions
};

export function issueCustomerSession(res: Response, c: { id: string }) {
  const token = jwt.sign({ sub: c.id, typ: "customer" }, secret(), { expiresIn: TTL_SECONDS });
  res.cookie(CUSTOMER_COOKIE, token, { httpOnly: true, secure: isProd, sameSite: isProd ? "none" : "lax", maxAge: TTL_SECONDS * 1000, path: "/" });
}

export function clearCustomerSession(res: Response) {
  res.clearCookie(CUSTOMER_COOKIE, { path: "/", httpOnly: true, secure: isProd, sameSite: isProd ? "none" : "lax" });
}

async function load(req: Request): Promise<AuthCustomer | null> {
  const token = req.cookies?.[CUSTOMER_COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, secret()) as { sub: string; typ: string };
    if (p.typ !== "customer") return null;
    const c = await prisma.customer.findUnique({ where: { id: p.sub } });
    if (!c || !c.passwordHash) return null;
    return { id: c.id, email: c.email, name: c.name, accountRole: c.accountRole, companyId: c.companyId };
  } catch {
    return null;
  }
}

export async function requireCustomer(req: Request, _res: Response, next: NextFunction) {
  try {
    const c = await load(req);
    if (!c) throw new HttpError(401, "Please sign in to your Express Bags account.");
    req.customer = c;
    next();
  } catch (e) {
    next(e);
  }
}

export async function optionalCustomer(req: Request, _res: Response, next: NextFunction) {
  req.customer = (await load(req)) ?? undefined;
  next();
}

/** Company-scoped roles may see all company orders; individuals only their own. */
export function customerOrderScope(c: AuthCustomer) {
  if (c.companyId && (c.accountRole === "COMPANY_ADMIN" || c.accountRole === "CONCIERGE")) return { companyId: c.companyId };
  return { customerId: c.id };
}
