/**
 * Single-use, hashed portal tokens (email verification, password reset, company invites).
 * Only the SHA-256 hash is stored; the raw token travels in the email link once.
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../../db";
import { env } from "../../lib/env";
import { HttpError } from "../../lib/errors";

export type PortalTokenPurpose = "email-verify" | "password-reset" | "invite";

const TTL_MS: Record<PortalTokenPurpose, number> = {
  "email-verify": 24 * 60 * 60 * 1000,
  "password-reset": 60 * 60 * 1000,
  invite: 7 * 24 * 60 * 60 * 1000,
};

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Public base URL of the website (for links in emails). */
export const siteUrl = () => (process.env.PORTAL_URL || process.env.NEXT_PUBLIC_SITE_URL || env.webOrigins[0] || "http://localhost:3000").replace(/\/$/, "");

/** Issues a token, invalidating older unused tokens of the same purpose for the same customer. */
export async function issueToken(purpose: PortalTokenPurpose, customerId: string) {
  const raw = randomBytes(32).toString("base64url");
  await prisma.authToken.updateMany({ where: { purpose, subjectType: "customer", subjectId: customerId, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.authToken.create({
    data: { purpose, subjectType: "customer", subjectId: customerId, tokenHash: hash(raw), expiresAt: new Date(Date.now() + TTL_MS[purpose]) },
  });
  return raw;
}

/** Looks up a valid token without consuming it (used to show the right form). */
export async function peekToken(purpose: PortalTokenPurpose, raw: string) {
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hash(raw) } });
  if (!row || row.purpose !== purpose || row.subjectType !== "customer" || row.usedAt || row.expiresAt < new Date()) {
    throw new HttpError(400, "This link is invalid or has expired. Please request a new one.");
  }
  return row;
}

/** Validates and marks a token as used; returns the customer id. */
export async function consumeToken(purpose: PortalTokenPurpose, raw: string) {
  const row = await peekToken(purpose, raw);
  const updated = await prisma.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (updated.count !== 1) throw new HttpError(400, "This link has already been used.");
  return row.subjectId;
}
