/**
 * "Book this again": turns a past order (or its original quote request) into a quote-wizard draft
 * (shape of components/quote/flow.ts QuoteDraft, string fields). Dates and legal confirmations are
 * intentionally left blank so the customer chooses a new date and re-confirms the policies.
 */
import type { QuoteRequest } from "@/lib/quote-schema";

type Loc = { type?: string; address?: string; facility?: string | null; market?: string; notes?: string | null };
type Piece = { category: string; description?: string | null; weightLbs?: number | null; lengthIn?: number | null; widthIn?: number | null; heightIn?: number | null };

const loc = (l: Loc | null | undefined) => ({
  type: l?.type ?? "",
  address: l?.address ?? "",
  facility: l?.facility ?? "",
  market: l?.market ?? "",
  notes: l?.notes ?? "",
});
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function draftFromQuote(q: QuoteRequest) {
  return {
    serviceType: q.serviceType,
    pickup: loc(q.pickup),
    delivery: loc(q.delivery),
    extraStops: (q.extraStops ?? []).map(loc),
    timeWindow: q.timeWindow,
    speed: q.speed,
    items: q.items.map((i) => ({ category: i.category, description: s(i.description), quantity: String(i.quantity), weightLbs: s(i.weightLbs), lengthIn: s(i.lengthIn), widthIn: s(i.widthIn), heightIn: s(i.heightIn) })),
    travelers: s(q.travelers),
    cruiseLine: s(q.cruiseLine),
    groupName: s(q.groupName),
    hotelsOrVenues: s(q.hotelsOrVenues),
    vehiclesNeeded: s(q.vehiclesNeeded),
    onsiteCoordination: !!q.onsiteCoordination,
    accessNotes: s(q.accessNotes),
    specialHandling: s(q.specialHandling),
    laborNeeded: s(q.laborNeeded),
    contact: { ...q.contact, company: s(q.contact.company) },
    onsiteContact: s(q.onsiteContact),
    billingType: q.billingType,
    leadSource: "repeat-client",
    notes: "",
  };
}

export function draftFromOrder(order: { serviceType: string; pickup: unknown; delivery: unknown; extraStops: unknown; timeWindow: string | null; accessNotes: string | null; specialHandling: string | null; pieces: Piece[] }, contactInfo: { name: string; email: string; phone: string | null; company?: string | null }) {
  // Group identical piece categories into item lines with quantities
  const lines = new Map<string, { category: string; description: string; quantity: number; weightLbs: string; lengthIn: string; widthIn: string; heightIn: string }>();
  for (const p of order.pieces) {
    const key = `${p.category}|${p.description ?? ""}`;
    const line = lines.get(key) ?? { category: p.category, description: s(p.description), quantity: 0, weightLbs: s(p.weightLbs), lengthIn: s(p.lengthIn), widthIn: s(p.widthIn), heightIn: s(p.heightIn) };
    line.quantity += 1;
    lines.set(key, line);
  }
  return {
    serviceType: order.serviceType,
    pickup: loc(order.pickup as Loc),
    delivery: loc(order.delivery as Loc),
    extraStops: Array.isArray(order.extraStops) ? (order.extraStops as Loc[]).map(loc) : [],
    timeWindow: order.timeWindow ?? "",
    items: [...lines.values()].map((l) => ({ ...l, quantity: String(l.quantity) })),
    accessNotes: s(order.accessNotes),
    specialHandling: s(order.specialHandling),
    contact: { name: contactInfo.name, email: contactInfo.email, phone: s(contactInfo.phone), company: s(contactInfo.company), preferredContact: "email" },
    leadSource: "repeat-client",
    notes: "",
  };
}
