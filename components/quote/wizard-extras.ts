/**
 * Pure helpers for the wizard's optional extras (unit-tested, no React):
 *  - storage availability: build the public availability query and map the yes/no answer to a message key
 *  - protection plans: parse the public plans response (404 → module not live → hidden)
 */
import type { QuoteDraft } from "./flow";
import { totalPieces } from "./flow";

/** Query string for GET /v1/storage/availability, or null when the draft isn't ready to ask. */
export function availabilityQuery(d: Pick<QuoteDraft, "serviceType" | "storageMarket" | "storageStart" | "storageEnd" | "items">): string | null {
  if (d.serviceType !== "storage") return null;
  if (!d.storageMarket || d.storageMarket === "other-florida" || d.storageMarket === "outside-florida") return null;
  if (!d.storageStart || !d.storageEnd || d.storageEnd <= d.storageStart) return null;
  const pieces = Math.min(500, Math.max(1, totalPieces(d as QuoteDraft) || 1));
  const p = new URLSearchParams({ market: d.storageMarket, start: d.storageStart, end: d.storageEnd, pieces: String(pieces) });
  return p.toString();
}

/** Never blocks submission and never shows counts: available → "ok", anything else → "limited". */
export type AvailabilityState = "idle" | "checking" | "ok" | "limited";
export function availabilityState(body: unknown, httpOk: boolean): AvailabilityState {
  if (!httpOk || !body || typeof body !== "object") return "idle"; // service unavailable: say nothing
  return (body as { available?: unknown }).available === true ? "ok" : "limited";
}

export type ProtectionTier = { code: "basic" | "plus" | "vip"; name: string; priceCents: number; maxBenefitCents: number; benefits: string[] };
export type ProtectionPlans = { displayName: string; termsUrl: string | null; tiers: ProtectionTier[] };

const TIER_CODES = ["basic", "plus", "vip"] as const;

/** Parse GET /v1/protection/plans. 404 (module not live) or anything malformed → null (picker hidden). */
export function parseProtectionPlans(status: number, body: unknown): ProtectionPlans | null {
  if (status !== 200 || !body || typeof body !== "object") return null;
  const b = body as { ok?: boolean; displayName?: unknown; termsUrl?: unknown; tiers?: unknown };
  if (!b.ok || !Array.isArray(b.tiers)) return null;
  const tiers = b.tiers
    .filter((t): t is ProtectionTier => !!t && typeof t === "object" && (TIER_CODES as readonly string[]).includes((t as ProtectionTier).code))
    .map((t) => ({ code: t.code, name: String(t.name), priceCents: Number(t.priceCents) || 0, maxBenefitCents: Number(t.maxBenefitCents) || 0, benefits: Array.isArray(t.benefits) ? t.benefits.map(String) : [] }));
  if (!tiers.length) return null;
  // Never call it "insurance" (legal guardrail) even if an admin typed it
  const displayName = typeof b.displayName === "string" && !/insur/i.test(b.displayName) ? b.displayName : "Express Bags Protection";
  return { displayName, termsUrl: typeof b.termsUrl === "string" && /^https?:\/\//.test(b.termsUrl) ? b.termsUrl : null, tiers };
}
