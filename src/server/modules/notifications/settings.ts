/**
 * Notification + marketing settings (stored in the Setting table under "notifications" and "marketing").
 * Defaults are safe: email for every customer event, SMS only for the moments that matter on the day,
 * quiet hours 9 PM–7 AM Miami time, survey 2 hours after delivery, no review link until Carlos sets one.
 */
import { z } from "zod";
import { prisma } from "../../db";
import type { TemplateKey } from "../../lib/templates";

const channelToggle = z.object({ email: z.boolean(), sms: z.boolean() });

/** Customer-facing templates that can be switched per channel in admin. */
export const CUSTOMER_EVENT_KEYS = [
  "order.confirmed",
  "order.driver_assigned",
  "order.en_route",
  "order.picked_up",
  "order.at_facility",
  "order.transferred_to_carrier",
  "order.in_transit",
  "order.out_for_delivery",
  "order.delivered",
  "order.cancelled",
  "order.update",
  "quotation.sent",
  "quotation.accepted",
  "invoice.issued",
  "payment.receipt",
  "customer.welcome",
  "survey.request",
  "storage.reminder",
] as const satisfies readonly TemplateKey[];
export type CustomerEventKey = (typeof CUSTOMER_EVENT_KEYS)[number];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

export const notificationSettingsSchema = z.object({
  events: z.record(z.string(), channelToggle),
  /** Extra staff alert recipients (in addition to contact.notifyEmail) */
  staffRecipients: z.array(z.string().email()).max(10),
  quietHours: z.object({ enabled: z.boolean(), start: hhmm, end: hhmm }),
  surveyDelayMinutes: z.number().int().min(0).max(60 * 24 * 7),
  /** Google review link shown to 4–5 star survey respondents (empty = hidden) */
  googleReviewUrl: z.string().url().or(z.literal("")),
  /** Ratings at or below this alert staff and never show the review prompt */
  lowRatingThreshold: z.number().int().min(1).max(4),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

const ON = { email: true, sms: true };
const EMAIL_ONLY = { email: true, sms: false };
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  events: {
    "order.confirmed": ON,
    "order.driver_assigned": ON,
    "order.en_route": ON,
    "order.picked_up": EMAIL_ONLY,
    "order.at_facility": EMAIL_ONLY,
    "order.transferred_to_carrier": EMAIL_ONLY,
    "order.in_transit": EMAIL_ONLY,
    "order.out_for_delivery": ON,
    "order.delivered": ON,
    "order.cancelled": ON,
    "order.update": ON,
    // Quotation and invoice emails are already sent by their modules (with links); SMS nudge only.
    "quotation.sent": { email: false, sms: true },
    "quotation.accepted": EMAIL_ONLY,
    "invoice.issued": { email: false, sms: false },
    "payment.receipt": EMAIL_ONLY,
    "customer.welcome": EMAIL_ONLY,
    "survey.request": ON,
    "storage.reminder": ON,
  },
  staffRecipients: [],
  quietHours: { enabled: true, start: "21:00", end: "07:00" },
  surveyDelayMinutes: 120,
  googleReviewUrl: "",
  lowRatingThreshold: 3,
};

/** Public tag IDs only (never secrets). */
export const marketingSettingsSchema = z.object({
  ga4Id: z.string().regex(/^G-[A-Z0-9]{4,}$/i, "GA4 IDs look like G-XXXXXXX").or(z.literal("")),
  googleAdsId: z.string().regex(/^AW-\d{6,}$/i, "Google Ads IDs look like AW-123456789").or(z.literal("")),
  googleAdsQuoteLabel: z.string().max(60).regex(/^[\w-]*$/, "Letters, numbers, - and _ only"),
  googleAdsBookingLabel: z.string().max(60).regex(/^[\w-]*$/, "Letters, numbers, - and _ only"),
  metaPixelId: z.string().regex(/^\d{8,20}$/, "Meta Pixel IDs are 8–20 digits").or(z.literal("")),
});
export type MarketingSettings = z.infer<typeof marketingSettingsSchema>;
export const DEFAULT_MARKETING_SETTINGS: MarketingSettings = { ga4Id: "", googleAdsId: "", googleAdsQuoteLabel: "", googleAdsBookingLabel: "", metaPixelId: "" };

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const row = await prisma.setting.findUnique({ where: { key: "notifications" } });
  const stored = (row?.value ?? {}) as Partial<NotificationSettings>;
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...stored,
    events: { ...DEFAULT_NOTIFICATION_SETTINGS.events, ...(stored.events ?? {}) },
    quietHours: { ...DEFAULT_NOTIFICATION_SETTINGS.quietHours, ...(stored.quietHours ?? {}) },
  };
}

export async function saveNotificationSettings(value: unknown, by?: string) {
  const parsed = notificationSettingsSchema.parse(value);
  await prisma.setting.upsert({ where: { key: "notifications" }, create: { key: "notifications", value: parsed, updatedBy: by }, update: { value: parsed, updatedBy: by } });
  return parsed;
}

export async function getMarketingSettings(): Promise<MarketingSettings> {
  const row = await prisma.setting.findUnique({ where: { key: "marketing" } });
  return { ...DEFAULT_MARKETING_SETTINGS, ...((row?.value ?? {}) as Partial<MarketingSettings>) };
}

export async function saveMarketingSettings(value: unknown, by?: string) {
  const parsed = marketingSettingsSchema.parse(value);
  await prisma.setting.upsert({ where: { key: "marketing" }, create: { key: "marketing", value: parsed, updatedBy: by }, update: { value: parsed, updatedBy: by } });
  return parsed;
}
