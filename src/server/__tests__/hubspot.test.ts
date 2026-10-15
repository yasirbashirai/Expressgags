import { describe, expect, it } from "vitest";
import { emailDomain, mapQuoteToHubSpot } from "../integrations/hubspot";
import type { QuoteRequest } from "@/lib/quote-schema";

const q = {
  serviceType: "cruise",
  pickup: { type: "hotel", address: "Hotel, Miami Beach", market: "miami" },
  delivery: { type: "cruise-port", address: "PortMiami", market: "miami" },
  extraStops: [],
  serviceDate: "2026-11-14",
  timeWindow: "morning",
  speed: "scheduled",
  items: [{ category: "standard-checked", quantity: 4 }, { category: "carry-on", quantity: 2 }],
  contact: { name: "Maria Lopez Garcia", email: "Maria@GrandHotel.com", phone: "305-555-0100", company: "Grand Hotel", preferredContact: "email" },
  billingType: "hotel-or-dmc",
  leadSource: "hotel-concierge",
  storageWithPickup: false,
  storageWithDelivery: false,
  onsiteCoordination: false,
  attachmentIds: [],
  acceptsProhibitedItemsPolicy: true,
  consentToContact: true,
} as unknown as QuoteRequest;

describe("HubSpot mapping (Apollo-compatible)", () => {
  it("maps contact, company by domain and deal with Express Bags properties", () => {
    const m = mapQuoteToHubSpot(q, { reference: "EB-Q-261015-ABCD", route: "standard-quote" });
    expect(m.contact).toMatchObject({ email: "maria@grandhotel.com", firstname: "Maria", lastname: "Lopez Garcia", eb_lead_source: "hotel-concierge", eb_market: "miami", eb_service_interest: "cruise", eb_industry_segment: "Hotel / DMC" });
    expect(m.company).toMatchObject({ name: "Grand Hotel", domain: "grandhotel.com" });
    expect(m.deal).toMatchObject({ eb_quote_reference: "EB-Q-261015-ABCD", eb_total_pieces: "6", eb_quote_route: "standard-quote" });
    expect(m.deal.dealname).toContain("EB-Q-261015-ABCD");
  });
  it("never uses free email providers as a company domain", () => {
    expect(emailDomain("someone@gmail.com")).toBeNull();
    const m = mapQuoteToHubSpot({ ...q, contact: { ...q.contact, email: "a@gmail.com", company: "" } }, { reference: "R", route: "custom-quote" });
    expect(m.company).toBeNull();
  });
});
