/** Human labels and option lists for the quote wizard (all values match src/lib/quote-schema.ts). */
import { Globe, Luggage, PackageCheck, Plane, Ship, Truck, Users, Warehouse, type LucideIcon } from "lucide-react";
import { airports, markets, otherFloridaRoute, ports } from "@/content/site";
import type { ServiceType } from "@/lib/quote-schema";
import type { DraftItem, LocationType, MarketOption, QuoteDraft } from "./flow";
import { esMarkets } from "@/content/es";
import { QUOTE_STRINGS, type Lang } from "@/content/i18n/quote";

export const SERVICE_CARDS: { type: ServiceType; title: string; text: string; Icon: LucideIcon; note?: string }[] = [
  { type: "luggage-local", title: "Local luggage pickup & delivery", text: "Hotel, home, airport, port or venue, anywhere in our Florida markets.", Icon: Luggage },
  { type: "airport", title: "Airport luggage", text: "Arrivals and departures at MIA, FLL, EYW, PBI, MCO, TPA and RSW.", Icon: Plane },
  { type: "cruise", title: "Cruise-port luggage", text: "Hotel-to-ship, ship-to-airport and other port transfers.", Icon: Ship },
  { type: "storage", title: "Luggage storage", text: "Short-term holding between itineraries, with optional pickup or delivery.", Icon: Warehouse },
  { type: "group-event", title: "Group, VIP or event logistics", text: "Tours, teams, artists, conventions and multi-vehicle programs.", Icon: Users, note: "Custom quotation" },
  { type: "courier", title: "Courier & last-mile delivery", text: "Scheduled and time-sensitive business deliveries with proof of delivery.", Icon: PackageCheck },
  { type: "truck", title: "Cargo van or box truck", text: "Pallets, equipment and commercial routes, up to 26-foot trucks.", Icon: Truck },
  { type: "nationwide-shipping", title: "Ship luggage across the U.S.", text: "Door-to-door shipping beyond Florida, with Express Bags pickup.", Icon: Globe, note: "Pricing confirmed by quotation" },
];

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  hotel: "Hotel or resort",
  airport: "Airport",
  "cruise-port": "Cruise port",
  residence: "Home or vacation rental",
  business: "Business",
  venue: "Venue, arena or convention center",
  "private-aviation": "Private aviation terminal",
  storage: "Express Bags storage",
  other: "Other location",
};

export const LOCATION_TYPES_FOR: (service: ServiceType | "") => LocationType[] = (service) => {
  if (service === "courier" || service === "truck") return ["business", "hotel", "venue", "residence", "airport", "cruise-port", "other"];
  return ["hotel", "airport", "cruise-port", "residence", "business", "venue", "private-aviation", "other"];
};

export const MARKET_CHOICES: { value: MarketOption; label: string }[] = [
  ...markets.map((m) => ({ value: m.slug as MarketOption, label: m.name })),
  { value: "other-florida", label: otherFloridaRoute.label },
];
export const MARKET_CHOICES_SHIPPING: { value: MarketOption; label: string }[] = [
  ...MARKET_CHOICES,
  { value: "outside-florida", label: "Outside Florida" },
];

export const AIRPORT_CHOICES = airports.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));
export const PORT_CHOICES = ports.map((p) => ({ value: p.slug, label: p.name }));

export const TIME_WINDOW_LABELS: Record<Exclude<QuoteDraft["timeWindow"], "">, string> = {
  "early-morning": "Early morning (before 8 AM)",
  morning: "Morning (8 AM – 12 PM)",
  midday: "Midday (11 AM – 2 PM)",
  afternoon: "Afternoon (12 PM – 5 PM)",
  evening: "Evening (5 PM – 9 PM)",
  "after-hours": "After hours",
  flexible: "Flexible",
};

export const SPEED_LABELS: Record<QuoteDraft["speed"], { label: string; hint: string }> = {
  scheduled: { label: "Scheduled", hint: "Planned for your date and window" },
  "same-day": { label: "Same day", hint: "Subject to capacity and dispatch confirmation" },
  urgent: { label: "Urgent", hint: "As soon as dispatch can confirm" },
  economy: { label: "Economy", hint: "About 5 to 7 business days" },
  standard: { label: "Standard", hint: "About 4 business days" },
  priority: { label: "Priority", hint: "About 3 business days" },
  express: { label: "Express", hint: "About 2 business days" },
  "next-day": { label: "Next day", hint: "When available" },
};

export const ITEM_CATEGORY_LABELS: Record<DraftItem["category"], string> = {
  "carry-on": "Carry-on",
  "standard-checked": "Standard checked bag",
  large: "Large bag",
  oversized: "Oversized bag",
  special: "Special item (golf clubs, instruments, equipment)",
  cargo: "Cargo / business item",
};

export const LEAD_SOURCE_LABELS: Record<Exclude<QuoteDraft["leadSource"], "">, string> = {
  referral: "Referral",
  "repeat-client": "I'm a returning client",
  "hotel-concierge": "Hotel or concierge",
  partner: "Travel or business partner",
  "google-search": "Google search",
  "google-business-profile": "Google Maps / Business Profile",
  "paid-ad": "Online ad",
  "social-media": "Social media",
  event: "Event or trade show",
  other: "Other",
};

export const BILLING_LABELS: Record<QuoteDraft["billingType"], string> = {
  individual: "Individual / personal",
  "company-account": "Company account",
  "hotel-or-dmc": "Hotel, resort or DMC",
  "event-organizer": "Event organizer",
  other: "Other",
};

export const PREFERRED_CONTACT_LABELS: Record<QuoteDraft["contact"]["preferredContact"], string> = {
  email: "Email",
  phone: "Phone call",
  whatsapp: "WhatsApp",
  text: "Text message",
};

export const VEHICLE_CHOICES = ["Cargo van", "15-foot box truck", "20-foot box truck", "26-foot box truck", "Not sure, please recommend"];

export function marketLabel(v: string) {
  return MARKET_CHOICES_SHIPPING.find((m) => m.value === v)?.label ?? v;
}

/* ------------------------------------------------------------------ */
/* Language-aware labels (values never change, only labels)            */
/* ------------------------------------------------------------------ */

/** Market choices in the wizard language. Spanish market names come from src/content/es.ts. */
export function marketChoicesFor(lang: Lang, shipping = false): { value: MarketOption; label: string }[] {
  const t = QUOTE_STRINGS[lang];
  const list: { value: MarketOption; label: string }[] = [
    ...markets.map((m) => ({ value: m.slug as MarketOption, label: lang === "es" ? esMarkets[m.slug]?.name ?? m.name : m.name })),
    { value: "other-florida", label: t.otherFlorida },
  ];
  if (shipping) list.push({ value: "outside-florida", label: t.outsideFlorida });
  return list;
}

export function marketLabelFor(v: string, lang: Lang) {
  return marketChoicesFor(lang, true).find((m) => m.value === v)?.label ?? v;
}
