/**
 * Shared quote-request contract used by BOTH the website quote engine (client-side validation)
 * and the Express API (server-side validation). Change it here only.
 *
 * Field list follows Carlos's completed form (Q9 job walkthrough, Q11 quote fields)
 * and the Master Platform Requirements (service-specific flows, luggage categories,
 * custom-quote triggers, lead source, prohibited-items acknowledgement).
 */
import { z } from "zod";

export const SERVICE_TYPES = [
  "luggage-local", // local pickup & drop-off (hotel, home, airport, port…)
  "airport",
  "cruise",
  "storage",
  "group-event", // VIP / group / sports / entertainment / event — custom quote
  "courier", // professional courier & last-mile
  "truck", // cargo van & box truck / commercial cargo
  "nationwide-shipping", // long-distance luggage shipping via carriers (pricing OFF at launch)
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_LABELS: Record<ServiceType, string> = {
  "luggage-local": "Local luggage pickup & delivery",
  airport: "Airport luggage",
  cruise: "Cruise-port luggage",
  storage: "Luggage storage",
  "group-event": "Group, VIP or event logistics",
  courier: "Courier & last-mile delivery",
  truck: "Cargo van or box truck",
  "nationwide-shipping": "Ship luggage across the U.S.",
};

export const MARKET_OPTIONS = [
  "miami",
  "fort-lauderdale-broward",
  "florida-keys-key-west",
  "west-palm-beach",
  "orlando",
  "tampa",
  "fort-myers",
  "cape-canaveral-port-canaveral",
  "other-florida", // special quote
  "outside-florida", // nationwide shipping only
] as const;

export const LUGGAGE_CATEGORIES = ["carry-on", "standard-checked", "large", "oversized", "special"] as const;
export const LUGGAGE_CATEGORY_LABELS: Record<(typeof LUGGAGE_CATEGORIES)[number], string> = {
  "carry-on": "Carry-on",
  "standard-checked": "Standard checked luggage",
  large: "Large luggage",
  oversized: "Oversized luggage",
  special: "Custom / special item (golf clubs, instruments, equipment…)",
};

export const LOCATION_TYPES = ["hotel", "airport", "cruise-port", "residence", "business", "venue", "private-aviation", "storage", "other"] as const;

export const TIME_WINDOWS = ["early-morning", "morning", "midday", "afternoon", "evening", "after-hours", "flexible"] as const;

export const SPEEDS = ["scheduled", "same-day", "urgent", "economy", "standard", "priority", "express", "next-day"] as const;

export const LEAD_SOURCES = [
  "referral",
  "repeat-client",
  "hotel-concierge",
  "partner",
  "google-search",
  "google-business-profile",
  "paid-ad",
  "social-media",
  "event",
  "other",
] as const;

export const BILLING_TYPES = ["individual", "company-account", "hotel-or-dmc", "event-organizer", "other"] as const;

const location = z.object({
  type: z.enum(LOCATION_TYPES),
  address: z.string().trim().min(3, "Enter an address, ZIP code or location name").max(300),
  /** Airport code or port slug when type is airport / cruise-port */
  facility: z.string().max(80).optional().or(z.literal("")),
  market: z.enum(MARKET_OPTIONS),
  notes: z.string().max(500).optional().or(z.literal("")),
});

const itemLine = z.object({
  category: z.enum(LUGGAGE_CATEGORIES).or(z.literal("cargo")),
  description: z.string().max(200).optional().or(z.literal("")),
  quantity: z.coerce.number().int().min(1).max(5000),
  weightLbs: z.coerce.number().min(0).max(20000).optional(),
  lengthIn: z.coerce.number().min(0).max(600).optional(),
  widthIn: z.coerce.number().min(0).max(600).optional(),
  heightIn: z.coerce.number().min(0).max(600).optional(),
});

export const quoteRequestSchema = z
  .object({
    serviceType: z.enum(SERVICE_TYPES),
    pickup: location,
    delivery: location,
    /** Extra stops for multi-stop jobs */
    extraStops: z.array(location).max(20).default([]),
    serviceDate: z.string().min(8, "Choose a date"), // ISO yyyy-mm-dd
    timeWindow: z.enum(TIME_WINDOWS),
    deadline: z.string().max(120).optional().or(z.literal("")),
    speed: z.enum(SPEEDS).default("scheduled"),
    items: z.array(itemLine).min(1, "Add at least one item"),
    travelers: z.coerce.number().int().min(0).max(10000).optional(),
    // Travel / event details
    flightDetails: z.string().max(200).optional().or(z.literal("")),
    cruiseLine: z.string().max(120).optional().or(z.literal("")),
    shipName: z.string().max(120).optional().or(z.literal("")),
    sailingDate: z.string().max(20).optional().or(z.literal("")),
    eventName: z.string().max(200).optional().or(z.literal("")),
    // Storage
    storageStart: z.string().max(40).optional().or(z.literal("")),
    storageEnd: z.string().max(40).optional().or(z.literal("")),
    storageWithPickup: z.boolean().default(false),
    storageWithDelivery: z.boolean().default(false),
    // Group / event logistics (custom-quote form)
    groupName: z.string().max(200).optional().or(z.literal("")),
    hotelsOrVenues: z.coerce.number().int().min(0).max(500).optional(),
    vehiclesNeeded: z.string().max(200).optional().or(z.literal("")),
    onsiteCoordination: z.boolean().default(false),
    // Access & handling
    accessNotes: z.string().max(1000).optional().or(z.literal("")), // stairs, dock, parking, terminal rules
    specialHandling: z.string().max(1000).optional().or(z.literal("")),
    laborNeeded: z.string().max(200).optional().or(z.literal("")),
    // Contact & billing
    contact: z.object({
      name: z.string().trim().min(2, "Enter your name").max(120),
      email: z.string().trim().email("Enter a valid email").max(200),
      phone: z.string().trim().min(7, "Enter a phone number").max(40),
      company: z.string().max(200).optional().or(z.literal("")),
      preferredContact: z.enum(["email", "phone", "whatsapp", "text"]).default("email"),
    }),
    onsiteContact: z.string().max(300).optional().or(z.literal("")),
    billingType: z.enum(BILLING_TYPES).default("individual"),
    leadSource: z.enum(LEAD_SOURCES),
    notes: z.string().max(4000).optional().or(z.literal("")),
    attachmentIds: z.array(z.string().max(100)).max(10).default([]),
    acceptsProhibitedItemsPolicy: z.literal(true, { message: "Please confirm the prohibited-items policy" }),
    consentToContact: z.literal(true, { message: "Please agree to be contacted about this request" }),
    /** Language the customer used (confirmation emails and messages follow it) */
    language: z.enum(["en", "es"]).optional(),
    /** Optional Express Bags protection plan (only accepted while the protection module is live) */
    protectionTier: z.enum(["basic", "plus", "vip"]).optional(),
    /** Honeypot — must stay empty (bots fill it) */
    website: z.string().max(0).optional().or(z.literal("")),
  });

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

/** API response for a submitted quote request */
export type QuoteSubmitResponse = {
  ok: true;
  reference: string; // e.g. EB-Q-260415-7K3P
  route: "custom-quote" | "standard-quote" | "special-route";
  message: string;
};
