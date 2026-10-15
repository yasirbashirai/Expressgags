/**
 * HubSpot CRM integration (Phase 1 — CRM-ready).
 *
 * Website inquiries flow: quote request → HubSpot contact + company + deal.
 * Property names are designed so Apollo.io (future B2B prospecting, Carlos' Sep 3 message) can
 * enrich the same contacts/companies inside HubSpot without redevelopment:
 *  - company is keyed by email domain (HubSpot + Apollo both de-duplicate on domain)
 *  - industry segment, market, service line and lead source are explicit custom properties.
 *
 * Calls HubSpot only when HUBSPOT_TOKEN is set AND settings.features.hubspotSyncEnabled is true.
 */
import type { QuoteRequest } from "@/lib/quote-schema";
import { SERVICE_LABELS } from "@/lib/quote-schema";
import { env } from "../lib/env";

/** Free email providers never become a HubSpot company domain. */
const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com", "live.com", "msn.com", "me.com", "proton.me", "protonmail.com"]);

const BILLING_TO_SEGMENT: Record<string, string> = {
  individual: "Individual traveler",
  "company-account": "Corporate account",
  "hotel-or-dmc": "Hotel / DMC",
  "event-organizer": "Events & entertainment",
  other: "Other",
};

export function emailDomain(email: string) {
  const d = email.split("@")[1]?.toLowerCase().trim() ?? "";
  return d && !FREE_MAIL.has(d) ? d : null;
}

export function mapQuoteToHubSpot(q: QuoteRequest, meta: { reference: string; route: string }) {
  const [firstname, ...rest] = q.contact.name.trim().split(/\s+/);
  const domain = emailDomain(q.contact.email);
  const segment = BILLING_TO_SEGMENT[q.billingType] ?? "Other";
  return {
    contact: {
      email: q.contact.email.toLowerCase(),
      firstname,
      lastname: rest.join(" "),
      phone: q.contact.phone,
      company: q.contact.company || undefined,
      eb_lead_source: q.leadSource,
      eb_market: q.pickup.market,
      eb_service_interest: q.serviceType,
      eb_industry_segment: segment,
      eb_preferred_contact: q.contact.preferredContact,
      lifecyclestage: "lead",
    },
    company: domain || q.contact.company
      ? { name: q.contact.company || domain || undefined, domain: domain || undefined, eb_industry_segment: segment, eb_market: q.pickup.market }
      : null,
    deal: {
      dealname: `${meta.reference} · ${SERVICE_LABELS[q.serviceType]}`,
      pipeline: "default",
      dealstage: "appointmentscheduled",
      eb_quote_reference: meta.reference,
      eb_quote_route: meta.route,
      eb_service_type: q.serviceType,
      eb_pickup_market: q.pickup.market,
      eb_delivery_market: q.delivery.market,
      eb_service_date: q.serviceDate,
      eb_total_pieces: String(q.items.reduce((s, i) => s + i.quantity, 0)),
      eb_lead_source: q.leadSource,
    },
  };
}

export type HubSpotPayload = ReturnType<typeof mapQuoteToHubSpot>;

/** Pushes contact (upsert by email), optional company and a deal. Returns the deal id. */
export async function syncToHubSpot(payload: HubSpotPayload): Promise<{ dealId: string }> {
  if (!env.hubspotToken) throw new Error("HUBSPOT_TOKEN is not configured");
  const api = async (path: string, body: object) => {
    const res = await fetch(`https://api.hubapi.com${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.hubspotToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HubSpot ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json() as Promise<{ id?: string; results?: { id: string }[] }>;
  };
  const strip = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));

  const contact = await api("/crm/v3/objects/contacts/batch/upsert", {
    inputs: [{ idProperty: "email", id: payload.contact.email, properties: strip(payload.contact) }],
  });
  const contactId = contact.results?.[0]?.id;
  const deal = await api("/crm/v3/objects/deals", {
    properties: strip(payload.deal),
    associations: contactId ? [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }] : [],
  });
  return { dealId: String(deal.id) };
}
