/**
 * Signed unsubscribe links for marketing-type emails (survey / review requests).
 * Token = HMAC-SHA256(JWT_SECRET, "unsub:" + email), so links can't be forged for other addresses.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../lib/env";

const sign = (email: string) =>
  createHmac("sha256", env.jwtSecret || "eb-dev-secret").update(`unsub:${email.trim().toLowerCase()}`).digest("base64url").slice(0, 32);

export function unsubscribeToken(email: string) {
  return sign(email);
}

export function verifyUnsubscribe(email: string, token: string) {
  const a = Buffer.from(sign(email));
  const b = Buffer.from(token || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** API URL (the unsubscribe endpoint lives on the API). */
export function apiBaseUrl() {
  return (process.env.PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || `http://localhost:${env.port}`).replace(/\/$/, "");
}

export function unsubscribeUrl(email: string) {
  const e = email.trim().toLowerCase();
  return `${apiBaseUrl()}/v1/marketing/unsubscribe?e=${encodeURIComponent(e)}&t=${unsubscribeToken(e)}`;
}
