/**
 * Carrier shipping settings (Setting key "carrierSettings"), editable by the owner/staff in
 * /admin/shipments/settings. Nothing here is a price: prices come from the carrier pricing rules
 * (PricingRuleSet engine "carrier") applied on top of Express Bags' own carrier account rates.
 */
import { z } from "zod";
import { prisma } from "../../db";
import { LUGGAGE_CATEGORIES } from "@/lib/quote-schema";

export const CARRIERS = ["UPS", "FedEx", "DHL", "USPS"] as const;
export type CarrierCode = (typeof CARRIERS)[number];

/** Per-piece carrier limits (published carrier maximums; oversize beyond these → custom quote). */
export const CARRIER_LIMITS: Record<CarrierCode, { maxWeightLbs: number; maxLengthPlusGirthIn: number; domestic: boolean; international: boolean }> = {
  UPS: { maxWeightLbs: 150, maxLengthPlusGirthIn: 165, domestic: true, international: true },
  FedEx: { maxWeightLbs: 150, maxLengthPlusGirthIn: 165, domestic: true, international: true },
  // DHL Express does not carry US-domestic (US → US) shipments: international only.
  DHL: { maxWeightLbs: 150, maxLengthPlusGirthIn: 165, domestic: false, international: true },
  USPS: { maxWeightLbs: 70, maxLengthPlusGirthIn: 130, domestic: true, international: true },
};

const dims = z.object({
  weightLbs: z.number().positive().max(150),
  lengthIn: z.number().positive().max(120),
  widthIn: z.number().positive().max(120),
  heightIn: z.number().positive().max(120),
});

const processingPoint = z.object({
  code: z.string().trim().min(2).max(30).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes"),
  name: z.string().trim().min(2).max(120),
  street1: z.string().trim().min(3).max(120),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().length(2),
  zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP"),
  /** PRIVATE: the processing point address is never shown publicly */
  active: z.boolean().default(true),
});

export const carrierSettingsSchema = z.object({
  /** Default parcel dimensions per luggage category (customers may override with real measurements) */
  defaultDims: z.record(z.enum(LUGGAGE_CATEGORIES), dims),
  enabledCarriers: z.array(z.enum(CARRIERS)).min(1, "Enable at least one carrier"),
  /** Show the carrier name to customers before checkout (default: hidden until the label is generated) */
  showCarrierBeforeCheckout: z.boolean(),
  /** First-mile flow: Express Bags pickup → processing point → carrier. Rates are shopped from here. */
  processingPoints: z.array(processingPoint).min(1),
  defaultProcessingPoint: z.string(),
  labelFormat: z.enum(["PDF", "PNG"]),
  /** Internal notes about Express Bags-owned carrier accounts (account numbers live in the carrier platform, not here) */
  accountNotes: z.string().max(2000),
});
export type CarrierSettings = z.infer<typeof carrierSettingsSchema>;

/**
 * Defaults are reasonable starting measurements only; Express Bags confirms them before launch.
 * The default processing point is a placeholder until Carlos supplies the real (private) address.
 */
export const DEFAULT_CARRIER_SETTINGS: CarrierSettings = {
  defaultDims: {
    "carry-on": { weightLbs: 25, lengthIn: 22, widthIn: 14, heightIn: 9 },
    "standard-checked": { weightLbs: 50, lengthIn: 27, widthIn: 19, heightIn: 11 },
    large: { weightLbs: 60, lengthIn: 30, widthIn: 20, heightIn: 12 },
    oversized: { weightLbs: 70, lengthIn: 34, widthIn: 22, heightIn: 14 },
    special: { weightLbs: 50, lengthIn: 48, widthIn: 14, heightIn: 14 },
  },
  enabledCarriers: ["UPS", "FedEx", "DHL", "USPS"],
  showCarrierBeforeCheckout: false,
  processingPoints: [
    { code: "miami-hq", name: "Miami processing point (placeholder)", street1: "P.O. Box 667538", city: "Miami", state: "FL", zip: "33166", active: true },
  ],
  defaultProcessingPoint: "miami-hq",
  labelFormat: "PDF",
  accountNotes: "",
};

const KEY = "carrierSettings";

export async function getCarrierSettings(): Promise<CarrierSettings> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const stored = (row?.value ?? {}) as Partial<CarrierSettings>;
  const merged = { ...DEFAULT_CARRIER_SETTINGS, ...stored, defaultDims: { ...DEFAULT_CARRIER_SETTINGS.defaultDims, ...(stored.defaultDims ?? {}) } };
  const parsed = carrierSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_CARRIER_SETTINGS;
}

export async function saveCarrierSettings(input: unknown, userEmail?: string) {
  const value = carrierSettingsSchema
    .refine((s) => s.processingPoints.some((p) => p.code === s.defaultProcessingPoint && p.active), {
      message: "The default processing point must be one of the active processing points",
      path: ["defaultProcessingPoint"],
    })
    .parse(input);
  await prisma.setting.upsert({ where: { key: KEY }, update: { value, updatedBy: userEmail }, create: { key: KEY, value, updatedBy: userEmail } });
  return value;
}

/** Billable weight for one parcel: max(actual, dimensional) using the common 139 divisor. */
export function dimensionalWeight(p: { weightLbs: number; lengthIn: number; widthIn: number; heightIn: number }) {
  return Math.round(((p.lengthIn * p.widthIn * p.heightIn) / 139) * 10) / 10;
}

export const lengthPlusGirth = (p: { lengthIn: number; widthIn: number; heightIn: number }) => {
  const [l, w, h] = [p.lengthIn, p.widthIn, p.heightIn].sort((a, b) => b - a);
  return l + 2 * (w + h);
};
