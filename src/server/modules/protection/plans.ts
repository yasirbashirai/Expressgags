/**
 * Optional Express Bags luggage protection plans (Master Requirements §8).
 *
 * Stored in Setting "protectionPlans". The tiers below are the owner's PROPOSED concept
 * (Basic $10 → up to $250, Plus $15 → up to $500, VIP $30 → up to $1,000), with the maximum
 * benefit applying per ORDER, not per item. This is NOT insurance: the module stays OFF until
 * Express Bags records Florida legal approval (approvedBy, approvedAt, termsUrl) AND turns on
 * features.protectionEnabled. Public copy must never call it "insurance".
 */
import { z } from "zod";
import { prisma } from "../../db";
import { getSetting } from "../../settings";

export const TIER_CODES = ["basic", "plus", "vip"] as const;
export type TierCode = (typeof TIER_CODES)[number];

const tierSchema = z.object({
  code: z.enum(TIER_CODES),
  name: z.string().trim().min(2).max(40),
  priceCents: z.number().int().min(0).max(1_000_000),
  /** Maximum total benefit for the whole order (not per item) */
  maxBenefitCents: z.number().int().min(0).max(100_000_000),
  /** Non-claim service benefits (e.g. VIP priority support) — clearly separated from protection at checkout */
  benefits: z.array(z.string().trim().min(2).max(160)).max(10).default([]),
  active: z.boolean().default(true),
});

export const plansSchema = z.object({
  /** Customer-facing product name (never "insurance") */
  displayName: z.string().trim().min(3).max(60).refine((v) => !/insur/i.test(v), "Do not call protection “insurance”"),
  tiers: z.array(tierSchema).min(1).max(3),
  /** Share of protection fees kept in the dedicated reserve (owner sets the exact value) */
  reservePercent: z.number().min(0).max(100),
  /** Evidence the customer must provide (shown on the claim form) */
  evidenceRules: z.array(z.string().trim().min(3).max(200)).max(10),
  /** Days after delivery a claim may be filed */
  claimWindowDays: z.number().int().min(1).max(365),
  /** Legal gate — all three required before the module can be offered */
  approval: z.object({
    approvedBy: z.string().trim().max(120).nullable(),
    approvedAt: z.string().max(40).nullable(),
    termsUrl: z.string().trim().url().nullable().or(z.literal("").transform(() => null)),
    structure: z.string().trim().max(200).nullable(),
  }),
});
export type ProtectionPlans = z.infer<typeof plansSchema>;

export const DEFAULT_PLANS: ProtectionPlans = {
  displayName: "Express Bags Protection",
  tiers: [
    { code: "basic", name: "Basic", priceCents: 1000, maxBenefitCents: 25000, benefits: [], active: true },
    { code: "plus", name: "Plus", priceCents: 1500, maxBenefitCents: 50000, benefits: [], active: true },
    {
      code: "vip",
      name: "VIP",
      priceCents: 3000,
      maxBenefitCents: 100000,
      benefits: ["Priority customer support", "Priority claims assistance", "Enhanced tracking notifications", "Concierge assistance for luggage delays where operationally feasible"],
      active: true,
    },
  ],
  reservePercent: 0, // exact reserve/backup percentage to be confirmed by Express Bags
  evidenceRules: [
    "Photos of the suitcase condition before departure or pickup",
    "Receipts or other acceptable proof of ownership and value for claimed items",
    "Photos of the damage or loss",
  ],
  claimWindowDays: 14,
  approval: { approvedBy: null, approvedAt: null, termsUrl: null, structure: null },
};

export async function getPlans(): Promise<ProtectionPlans> {
  const row = await prisma.setting.findUnique({ where: { key: "protectionPlans" } });
  const parsed = plansSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : DEFAULT_PLANS;
}

export async function savePlans(value: unknown, by: string) {
  const plans = plansSchema.parse(value);
  await prisma.setting.upsert({ where: { key: "protectionPlans" }, update: { value: plans, updatedBy: by }, create: { key: "protectionPlans", value: plans, updatedBy: by } });
  return plans;
}

export const legallyApproved = (p: ProtectionPlans) => !!(p.approval.approvedBy && p.approval.approvedAt && p.approval.termsUrl);

/** Live for customers only when the owner enabled the feature AND legal approval is recorded. */
export async function protectionLive() {
  const [features, plans] = await Promise.all([getSetting("features"), getPlans()]);
  return { live: !!features.protectionEnabled && legallyApproved(plans), enabledFlag: !!features.protectionEnabled, approved: legallyApproved(plans), plans };
}

export function tierFor(plans: ProtectionPlans, code: string | null | undefined) {
  return plans.tiers.find((t) => t.code === code) ?? null;
}
