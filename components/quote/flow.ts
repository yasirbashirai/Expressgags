/**
 * Quote wizard logic (pure, framework-free, unit-tested).
 *
 * - QuoteDraft: the loose, form-friendly state the wizard edits (strings for inputs).
 * - getSteps(): which steps each service shows (traveler flows never see freight questions).
 * - buildPayload(): turns a draft into the shared QuoteRequest shape sent to the API.
 * - validateStep(): validates only the fields that belong to one step, using quoteRequestSchema.
 */
import { airports, ports } from "@/content/site";
import {
  quoteRequestSchema,
  type QuoteRequest,
  type ServiceType,
  LUGGAGE_CATEGORIES,
  MARKET_OPTIONS,
  LOCATION_TYPES,
  TIME_WINDOWS,
  SPEEDS,
  LEAD_SOURCES,
  BILLING_TYPES,
} from "@/lib/quote-schema";

export type MarketOption = (typeof MARKET_OPTIONS)[number];
export type LocationType = (typeof LOCATION_TYPES)[number];
export type ItemCategory = (typeof LUGGAGE_CATEGORIES)[number] | "cargo";

export type DraftLocation = {
  type: LocationType | "";
  address: string;
  facility: string;
  market: MarketOption | "";
  notes: string;
};

export type DraftItem = {
  category: ItemCategory;
  description: string;
  quantity: string;
  weightLbs: string;
  lengthIn: string;
  widthIn: string;
  heightIn: string;
};

export type QuoteDraft = {
  serviceType: ServiceType | "";
  pickup: DraftLocation;
  delivery: DraftLocation;
  extraStops: DraftLocation[];
  serviceDate: string;
  timeWindow: (typeof TIME_WINDOWS)[number] | "";
  deadline: string;
  speed: (typeof SPEEDS)[number];
  items: DraftItem[];
  travelers: string;
  flightDetails: string;
  cruiseLine: string;
  shipName: string;
  sailingDate: string;
  eventName: string;
  storageStart: string;
  storageEnd: string;
  storageWithPickup: boolean;
  storageWithDelivery: boolean;
  storageMarket: MarketOption | "";
  groupName: string;
  hotelsOrVenues: string;
  vehiclesNeeded: string;
  onsiteCoordination: boolean;
  groupInvolvesAirport: boolean;
  groupInvolvesCruise: boolean;
  recurringRoute: boolean;
  accessNotes: string;
  specialHandling: string;
  laborNeeded: string;
  contact: { name: string; email: string; phone: string; company: string; preferredContact: "email" | "phone" | "whatsapp" | "text" };
  onsiteContact: string;
  billingType: (typeof BILLING_TYPES)[number];
  leadSource: (typeof LEAD_SOURCES)[number] | "";
  notes: string;
  attachments: { id: string; name: string }[];
  acceptsProhibitedItemsPolicy: boolean;
  consentToContact: boolean;
  website: string; // honeypot
  /** Wizard language; sent with the request so confirmations go out in the same language */
  language: "en" | "es";
  /** Optional protection plan (only offered while the protection module is live) */
  protectionTier: "" | "basic" | "plus" | "vip";
};

export const emptyLocation = (type: LocationType | "" = "", market: MarketOption | "" = ""): DraftLocation => ({
  type,
  address: "",
  facility: "",
  market,
  notes: "",
});

export const emptyItem = (category: ItemCategory = "standard-checked", quantity = "1"): DraftItem => ({
  category,
  description: "",
  quantity,
  weightLbs: "",
  lengthIn: "",
  widthIn: "",
  heightIn: "",
});

export function emptyDraft(): QuoteDraft {
  return {
    serviceType: "",
    pickup: emptyLocation(),
    delivery: emptyLocation(),
    extraStops: [],
    serviceDate: "",
    timeWindow: "",
    deadline: "",
    speed: "scheduled",
    items: [emptyItem()],
    travelers: "",
    flightDetails: "",
    cruiseLine: "",
    shipName: "",
    sailingDate: "",
    eventName: "",
    storageStart: "",
    storageEnd: "",
    storageWithPickup: false,
    storageWithDelivery: false,
    storageMarket: "",
    groupName: "",
    hotelsOrVenues: "",
    vehiclesNeeded: "",
    onsiteCoordination: false,
    groupInvolvesAirport: false,
    groupInvolvesCruise: false,
    recurringRoute: false,
    accessNotes: "",
    specialHandling: "",
    laborNeeded: "",
    contact: { name: "", email: "", phone: "", company: "", preferredContact: "email" },
    onsiteContact: "",
    billingType: "individual",
    leadSource: "",
    notes: "",
    attachments: [],
    acceptsProhibitedItemsPolicy: false,
    consentToContact: false,
    website: "",
    language: "en",
    protectionTier: "",
  };
}

/** Sensible defaults when a service is chosen (pre-set location types and item categories). */
export function applyServiceDefaults(draft: QuoteDraft, service: ServiceType): QuoteDraft {
  const next: QuoteDraft = { ...draft, serviceType: service };
  const keepMarket = draft.pickup.market || "";
  const cargo = service === "courier" || service === "truck";
  const itemsAreCargo = next.items.every((i) => i.category === "cargo");
  if (cargo && !itemsAreCargo) next.items = [emptyItem("cargo", "1")];
  if (!cargo && itemsAreCargo) next.items = [emptyItem()];
  if (service === "airport") {
    if (!next.pickup.type) next.pickup = { ...emptyLocation("airport", keepMarket) };
    if (!next.delivery.type) next.delivery = { ...emptyLocation("hotel", keepMarket) };
  } else if (service === "cruise") {
    if (!next.pickup.type) next.pickup = { ...emptyLocation("hotel", keepMarket) };
    if (!next.delivery.type) next.delivery = { ...emptyLocation("cruise-port", keepMarket) };
  } else if (service === "nationwide-shipping") {
    next.speed = SHIPPING_SPEEDS.includes(next.speed) ? next.speed : "standard";
    if (!next.pickup.type) next.pickup = { ...emptyLocation("hotel", keepMarket) };
    if (!next.delivery.type) next.delivery = { ...emptyLocation("residence", "outside-florida") };
  } else {
    if (!next.pickup.type) next.pickup = { ...emptyLocation(cargo ? "business" : "hotel", keepMarket) };
    if (!next.delivery.type) next.delivery = { ...emptyLocation(cargo ? "business" : "airport", keepMarket) };
  }
  if (service !== "nationwide-shipping" && SHIPPING_SPEEDS.includes(next.speed)) next.speed = "scheduled";
  if (service === "storage" && !next.storageMarket) next.storageMarket = keepMarket;
  return next;
}

export const SHIPPING_SPEEDS: QuoteDraft["speed"][] = ["economy", "standard", "priority", "express", "next-day"];
export const LOCAL_SPEEDS: QuoteDraft["speed"][] = ["scheduled", "same-day", "urgent"];

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

export type StepId = "service" | "route" | "storage" | "group" | "timing" | "items" | "contact" | "review";

export type StepDef = {
  id: StepId;
  title: string;
  short: string;
  /** Schema paths owned by this step (prefix match on issue paths) */
  paths: string[];
};

const STEP_LIBRARY: Record<StepId, StepDef> = {
  service: { id: "service", title: "What do you need?", short: "Service", paths: ["serviceType"] },
  route: { id: "route", title: "Pickup and delivery", short: "Route", paths: ["pickup", "delivery", "extraStops"] },
  storage: {
    id: "storage",
    title: "Storage details",
    short: "Storage",
    paths: ["storageStart", "storageEnd", "serviceDate", "pickup", "delivery", "storageMarket"],
  },
  group: {
    id: "group",
    title: "Group or event details",
    short: "Program",
    paths: ["groupName", "eventName", "serviceDate", "deadline", "pickup", "delivery", "extraStops", "travelers", "hotelsOrVenues", "vehiclesNeeded"],
  },
  timing: { id: "timing", title: "Date and timing", short: "Timing", paths: ["serviceDate", "timeWindow", "deadline", "speed", "sailingDate"] },
  items: {
    id: "items",
    title: "What are we moving?",
    short: "Items",
    paths: ["items", "travelers", "flightDetails", "cruiseLine", "shipName", "eventName", "accessNotes", "specialHandling", "laborNeeded", "vehiclesNeeded"],
  },
  contact: {
    id: "contact",
    title: "Your contact details",
    short: "Contact",
    paths: ["contact", "onsiteContact", "billingType", "leadSource", "notes", "attachmentIds"],
  },
  review: { id: "review", title: "Review and send", short: "Review", paths: ["acceptsProhibitedItemsPolicy", "consentToContact", "website"] },
};

/** The ordered steps for a service. Before a service is chosen only "service" is known. */
export function getSteps(service: ServiceType | ""): StepDef[] {
  const s = STEP_LIBRARY;
  switch (service) {
    case "storage":
      return [s.service, s.storage, { ...s.timing, title: "Drop-off timing", paths: ["timeWindow"] }, s.items, s.contact, s.review];
    case "group-event":
      return [s.service, s.group, { ...s.timing, paths: ["timeWindow"] }, s.items, s.contact, s.review];
    case "":
      return [s.service];
    default:
      return [s.service, s.route, s.timing, s.items, s.contact, s.review];
  }
}

/* ------------------------------------------------------------------ */
/* Payload                                                              */
/* ------------------------------------------------------------------ */

const num = (v: string): number | undefined => {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

function toLocation(l: DraftLocation) {
  return {
    type: (l.type || "other") as LocationType,
    address: l.address.trim(),
    facility: l.facility,
    market: (l.market || undefined) as MarketOption,
    notes: l.notes,
  };
}

const SERVICE_FACILITY_LABEL = (l: DraftLocation): string => {
  if (l.type === "airport") return airports.find((a) => a.code === l.facility)?.name ?? "";
  if (l.type === "cruise-port") return ports.find((p) => p.slug === l.facility)?.name ?? "";
  return "";
};

/** Pre-fills an empty address with the airport/port name so a traveler doesn't have to type it. */
export function locationWithFacility(l: DraftLocation, facility: string): DraftLocation {
  const next = { ...l, facility };
  const label = SERVICE_FACILITY_LABEL(next);
  const previous = SERVICE_FACILITY_LABEL(l);
  if (label && (!l.address || l.address === previous)) next.address = label;
  if (l.type === "airport") {
    const a = airports.find((x) => x.code === facility);
    if (a) next.market = a.market as MarketOption;
  }
  if (l.type === "cruise-port") {
    const p = ports.find((x) => x.slug === facility);
    if (p) next.market = p.market as MarketOption;
  }
  return next;
}

export function buildPayload(d: QuoteDraft): Record<string, unknown> {
  const service = d.serviceType;
  const storage = service === "storage";
  const storageMarket = (d.storageMarket || d.pickup.market || d.delivery.market || undefined) as MarketOption | undefined;

  let pickup = toLocation(d.pickup);
  let delivery = toLocation(d.delivery);
  if (storage) {
    // Storage-only: customer drops off and retrieves at Express Bags storage. The schema requires
    // both ends, so the storage facility stands in for whichever end the customer handles.
    if (!d.storageWithPickup) pickup = { type: "storage", address: "Customer drop-off at Express Bags storage", facility: "", market: storageMarket as MarketOption, notes: "" };
    if (!d.storageWithDelivery) delivery = { type: "storage", address: "Customer retrieval from Express Bags storage", facility: "", market: storageMarket as MarketOption, notes: "" };
  }

  const extraNotes: string[] = [];
  if (service === "group-event") {
    const involves = [d.groupInvolvesAirport && "airport", d.groupInvolvesCruise && "cruise"].filter(Boolean);
    if (involves.length) extraNotes.push(`Program involves: ${involves.join(" and ")}`);
  }
  if ((service === "courier" || service === "truck") && d.recurringRoute) extraNotes.push("Recurring route requested");
  const notes = [d.notes.trim(), ...extraNotes].filter(Boolean).join("\n");

  const serviceDate = storage ? (d.storageStart || "").slice(0, 10) : d.serviceDate;

  const payload: Record<string, unknown> = {
    serviceType: service || undefined,
    pickup,
    delivery,
    extraStops: d.extraStops.map(toLocation),
    serviceDate,
    timeWindow: d.timeWindow || undefined,
    deadline: d.deadline,
    speed: d.speed,
    items: d.items.map((i) => ({
      category: i.category,
      description: i.description,
      quantity: num(i.quantity),
      weightLbs: num(i.weightLbs),
      lengthIn: num(i.lengthIn),
      widthIn: num(i.widthIn),
      heightIn: num(i.heightIn),
    })),
    travelers: num(d.travelers),
    flightDetails: d.flightDetails,
    cruiseLine: d.cruiseLine,
    shipName: d.shipName,
    sailingDate: d.sailingDate,
    eventName: d.eventName,
    storageStart: storage ? d.storageStart : "",
    storageEnd: storage ? d.storageEnd : "",
    storageWithPickup: storage && d.storageWithPickup,
    storageWithDelivery: storage && d.storageWithDelivery,
    groupName: d.groupName,
    hotelsOrVenues: num(d.hotelsOrVenues),
    vehiclesNeeded: d.vehiclesNeeded,
    onsiteCoordination: d.onsiteCoordination,
    accessNotes: d.accessNotes,
    specialHandling: d.specialHandling,
    laborNeeded: d.laborNeeded,
    contact: { ...d.contact, name: d.contact.name.trim(), email: d.contact.email.trim(), phone: d.contact.phone.trim() },
    onsiteContact: d.onsiteContact,
    billingType: d.billingType,
    leadSource: d.leadSource || undefined,
    notes,
    attachmentIds: d.attachments.map((a) => a.id),
    acceptsProhibitedItemsPolicy: d.acceptsProhibitedItemsPolicy,
    consentToContact: d.consentToContact,
    website: d.website,
    language: d.language === "es" ? "es" : "en",
  };
  if (d.protectionTier) payload.protectionTier = d.protectionTier;
  return payload;
}

/* ------------------------------------------------------------------ */
/* Validation                                                           */
/* ------------------------------------------------------------------ */

export type FieldErrors = Record<string, string>;

const FRIENDLY: Record<string, string> = {
  serviceType: "Choose a service to continue",
  timeWindow: "Choose a time window",
  leadSource: "Let us know how you heard about us",
  "pickup.market": "Choose the area",
  "delivery.market": "Choose the area",
  "pickup.type": "Choose a location type",
  "delivery.type": "Choose a location type",
};

/** Extra business rules that the shared schema leaves optional. */
function extraIssues(d: QuoteDraft): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [];
  const s = d.serviceType;
  if (s === "nationwide-shipping") {
    d.items.forEach((it, i) => {
      for (const k of ["weightLbs", "lengthIn", "widthIn", "heightIn"] as const) {
        const v = num(it[k]);
        if (v === undefined || !(v > 0)) {
          out.push({ path: `items.${i}.${k}`, message: k === "weightLbs" ? "Weight required" : "Size required" });
        }
      }
    });
  }
  if (s === "storage") {
    if (!d.storageStart) out.push({ path: "storageStart", message: "Choose the drop-off date and time" });
    if (!d.storageEnd) out.push({ path: "storageEnd", message: "Choose the retrieval or delivery date and time" });
    if (d.storageStart && d.storageEnd && d.storageEnd <= d.storageStart) out.push({ path: "storageEnd", message: "Retrieval must be after drop-off" });
    if (!d.storageMarket) out.push({ path: "storageMarket", message: "Choose the storage area" });
  }
  if (s === "group-event" && !d.groupName.trim() && !d.eventName.trim()) {
    out.push({ path: "groupName", message: "Enter the group or event name" });
  }
  if (s === "cruise") {
    const hasPort = d.pickup.type === "cruise-port" || d.delivery.type === "cruise-port";
    if (!hasPort) out.push({ path: "delivery.type", message: "A cruise request needs a cruise port at pickup or delivery" });
  }
  if (s === "airport") {
    const hasAirport = d.pickup.type === "airport" || d.delivery.type === "airport";
    if (!hasAirport) out.push({ path: "pickup.type", message: "An airport request needs an airport at pickup or delivery" });
  }
  for (const [key, loc] of [["pickup", d.pickup], ["delivery", d.delivery]] as const) {
    if ((loc.type === "airport" || loc.type === "cruise-port") && !loc.facility) {
      const isStorageStandIn = s === "storage";
      if (!isStorageStandIn) out.push({ path: `${key}.facility`, message: loc.type === "airport" ? "Choose the airport" : "Choose the cruise port" });
    }
  }
  return out;
}

export function validateDraft(d: QuoteDraft): FieldErrors {
  const errors: FieldErrors = {};
  const res = quoteRequestSchema.safeParse(buildPayload(d));
  if (!res.success) {
    for (const issue of res.error.issues) {
      const path = issue.path.map(String).join(".");
      if (!errors[path]) errors[path] = FRIENDLY[path] ?? issue.message;
    }
  }
  for (const e of extraIssues(d)) if (!errors[e.path]) errors[e.path] = e.message;
  return errors;
}

/** Errors that belong to a given step only. */
export function validateStep(d: QuoteDraft, step: StepDef): FieldErrors {
  const all = validateDraft(d);
  const out: FieldErrors = {};
  for (const [path, msg] of Object.entries(all)) {
    if (step.paths.some((p) => path === p || path.startsWith(p + "."))) out[path] = msg;
  }
  // Storage stand-in locations are generated, never shown as errors on the storage step
  if (d.serviceType === "storage" && step.id === "storage") {
    for (const k of Object.keys(out)) {
      if (k.startsWith("pickup") && !d.storageWithPickup) delete out[k];
      if (k.startsWith("delivery") && !d.storageWithDelivery) delete out[k];
    }
  }
  return out;
}

export function parseFinal(d: QuoteDraft): { ok: true; data: QuoteRequest } | { ok: false; errors: FieldErrors } {
  const errors = validateDraft(d);
  if (Object.keys(errors).length) return { ok: false, errors };
  const res = quoteRequestSchema.safeParse(buildPayload(d));
  if (!res.success) return { ok: false, errors: { form: "Please review the form" } };
  return { ok: true, data: res.data };
}

/** Restore a draft from storage defensively (unknown shape → merged over defaults). */
export function reviveDraft(raw: unknown): QuoteDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const base = emptyDraft();
  const r = raw as Partial<QuoteDraft>;
  try {
    return {
      ...base,
      ...r,
      pickup: { ...base.pickup, ...(r.pickup ?? {}) },
      delivery: { ...base.delivery, ...(r.delivery ?? {}) },
      contact: { ...base.contact, ...(r.contact ?? {}) },
      items: Array.isArray(r.items) && r.items.length ? r.items.map((i) => ({ ...emptyItem(), ...i })) : base.items,
      extraStops: Array.isArray(r.extraStops) ? r.extraStops.map((l) => ({ ...emptyLocation(), ...l })) : [],
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
      language: r.language === "es" ? "es" : "en",
      protectionTier: r.protectionTier === "basic" || r.protectionTier === "plus" || r.protectionTier === "vip" ? r.protectionTier : "",
      // Never restore the legal confirmations or honeypot
      acceptsProhibitedItemsPolicy: false,
      consentToContact: false,
      website: "",
    };
  } catch {
    return null;
  }
}

export const isServiceType = (v: string | null | undefined): v is ServiceType =>
  !!v && (["luggage-local", "airport", "cruise", "storage", "group-event", "courier", "truck", "nationwide-shipping"] as string[]).includes(v);

export const isMarket = (v: string | null | undefined): v is MarketOption => !!v && (MARKET_OPTIONS as readonly string[]).includes(v);

/** Count of pieces across item lines (for the review summary). */
export const totalPieces = (d: QuoteDraft) => d.items.reduce((n, i) => n + (Number(i.quantity) || 0), 0);
