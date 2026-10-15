/**
 * Platform settings: stored as key/value JSON in the Setting table and merged over safe
 * defaults. Pricing rule sets are versioned in PricingRuleSet (one active per engine).
 */
import { z } from "zod";
import { prisma } from "./db";
import {
  DEFAULT_CARRIER_RULES,
  DEFAULT_LOCAL_RULES,
  DEFAULT_STORAGE_RULES,
  DEFAULT_THRESHOLDS,
  type CarrierPricingRules,
  type DecisionThresholds,
  type LocalPricingRules,
  type StoragePricingRules,
} from "./engines/config";

export const contactSettingsSchema = z.object({
  /** When true the public site may show info@express-bags.com (Carlos must confirm the mailbox is live) */
  emailLive: z.boolean(),
  /** Where staff notifications for new requests are sent (configurable, never hard-coded) */
  notifyEmail: z.string().email().or(z.literal("")),
});

export const featureSettingsSchema = z.object({
  /** Public automatic pricing. MUST stay false until Express Bags approves real rates (Master Req. §16) */
  pricingEnabled: z.boolean(),
  hubspotSyncEnabled: z.boolean(),
  /** Online booking + checkout for instantly priced orders (requires pricingEnabled) */
  instantBookingEnabled: z.boolean().default(false),
  /** Optional luggage protection tiers + claims (OFF until Florida legal structure is approved) */
  protectionEnabled: z.boolean().default(false),
  /** Nationwide carrier shipping quotes/labels (requires Express Bags carrier accounts) */
  carrierShippingEnabled: z.boolean().default(false),
  /** SMS/WhatsApp customer notifications */
  smsEnabled: z.boolean().default(false),
  /** Website AI assistant (English + Spanish) */
  aiAssistantEnabled: z.boolean().default(true),
  /** QuickBooks Online sync */
  quickbooksSyncEnabled: z.boolean().default(false),
  /** Post-delivery satisfaction survey + review request */
  surveysEnabled: z.boolean().default(true),
});

export const thresholdsSchema = z.object({
  maxAutoPieces: z.number().int().min(0),
  maxAutoExtraStops: z.number().int().min(0),
  maxAutoTravelers: z.number().int().min(0),
  maxAutoItemWeightLbs: z.number().min(0),
  maxAutoItemLengthGirthIn: z.number().min(0),
  maxAutoOversizedPieces: z.number().int().min(0),
  alwaysCustomServices: z.array(z.string()),
});

export type ContactSettings = z.infer<typeof contactSettingsSchema>;
export type FeatureSettings = z.infer<typeof featureSettingsSchema>;

export const DEFAULT_SETTINGS = {
  contact: { emailLive: false, notifyEmail: "" } as ContactSettings,
  features: { pricingEnabled: false, hubspotSyncEnabled: false, instantBookingEnabled: false, protectionEnabled: false, carrierShippingEnabled: false, smsEnabled: false, aiAssistantEnabled: true, quickbooksSyncEnabled: false, surveysEnabled: true } as FeatureSettings,
  thresholds: DEFAULT_THRESHOLDS as DecisionThresholds,
};

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export const SETTING_SCHEMAS = { contact: contactSettingsSchema, features: featureSettingsSchema, thresholds: thresholdsSchema };

export async function getSetting<K extends SettingKey>(key: K): Promise<(typeof DEFAULT_SETTINGS)[K]> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return { ...DEFAULT_SETTINGS[key], ...((row?.value as object) ?? {}) } as (typeof DEFAULT_SETTINGS)[K];
}

export async function getAllSettings() {
  const [contact, features, thresholds] = await Promise.all([getSetting("contact"), getSetting("features"), getSetting("thresholds")]);
  return { contact, features, thresholds };
}

export async function updateSetting(key: SettingKey, value: unknown, userEmail?: string) {
  const parsed = SETTING_SCHEMAS[key].partial().parse(value);
  const current = await getSetting(key);
  const merged = { ...current, ...parsed };
  await prisma.setting.upsert({
    where: { key },
    update: { value: merged as object, updatedBy: userEmail },
    create: { key, value: merged as object, updatedBy: userEmail },
  });
  return merged;
}

/* ------------------------------ Pricing rules ----------------------------- */

export type EngineName = "local" | "carrier" | "storage";
export const DEFAULT_RULES: { local: LocalPricingRules; carrier: CarrierPricingRules; storage: StoragePricingRules } = {
  local: DEFAULT_LOCAL_RULES,
  carrier: DEFAULT_CARRIER_RULES,
  storage: DEFAULT_STORAGE_RULES,
};

export async function getActiveRules<E extends EngineName>(engine: E): Promise<(typeof DEFAULT_RULES)[E]> {
  const row = await prisma.pricingRuleSet.findFirst({ where: { engine, active: true }, orderBy: { version: "desc" } });
  return { ...DEFAULT_RULES[engine], ...((row?.rules as object) ?? {}) } as (typeof DEFAULT_RULES)[E];
}

/** Saves a NEW version and activates it (old versions are kept for history). */
export async function saveRules(engine: EngineName, rules: object, userEmail?: string, note?: string) {
  const latest = await prisma.pricingRuleSet.findFirst({ where: { engine }, orderBy: { version: "desc" } });
  const merged = { ...DEFAULT_RULES[engine], ...rules };
  return prisma.$transaction(async (tx) => {
    await tx.pricingRuleSet.updateMany({ where: { engine, active: true }, data: { active: false } });
    return tx.pricingRuleSet.create({
      data: { engine, version: (latest?.version ?? 0) + 1, active: true, rules: merged as object, createdBy: userEmail, note },
    });
  });
}
