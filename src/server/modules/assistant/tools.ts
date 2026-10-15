/**
 * Assistant tools. Every model-supplied input is untrusted: validated with zod before anything runs,
 * and every result returned to the model contains only public / customer-verified information.
 */
import { z } from "zod";
import { airports, ports } from "@/content/site";
import { LOCATION_TYPES, LUGGAGE_CATEGORIES, MARKET_OPTIONS, SERVICE_TYPES, TIME_WINDOWS } from "@/lib/quote-schema";
import type { AiToolSpec } from "../../providers";
import { prisma } from "../../db";
import { publicToken } from "../../lib/reference";
import { STATUS_LABEL } from "../../services/orders";
import { verifierMatches } from "../tracking";
import { searchKnowledge } from "./knowledge";

export const TOOL_SPECS: AiToolSpec[] = [
  {
    name: "search_knowledge",
    description:
      "Search Express Bags' approved public website content (services, service areas, airports, cruise ports, FAQ, policies, prohibited items, storage, business accounts). Use it before answering any factual question you are not sure about.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Search words, English or Spanish" } }, required: ["query"], additionalProperties: false },
  },
  {
    name: "get_tracking_status",
    description:
      "Look up the status of an Express Bags delivery. Requires BOTH the Express Bags reference (EB-YYMMDD-XXXX or a piece ID) and a verifier: the booking email, the last 4 digits of the booking phone, or the delivery ZIP code. Never call it without both.",
    inputSchema: {
      type: "object",
      properties: { reference: { type: "string" }, verifier: { type: "string", description: "Booking email, phone last 4 digits, or delivery ZIP" } },
      required: ["reference", "verifier"],
      additionalProperties: false,
    },
  },
  {
    name: "start_quote",
    description:
      "Create a prefilled quote request link for the customer once you know the service and at least the pickup or delivery area. Include every detail the customer confirmed. The customer reviews and submits it themselves on /request-a-quote; no price is produced.",
    inputSchema: {
      type: "object",
      properties: {
        serviceType: { type: "string", enum: [...SERVICE_TYPES] },
        pickup: locationSchemaJson(),
        delivery: locationSchemaJson(),
        serviceDate: { type: "string", description: "YYYY-MM-DD if known" },
        timeWindow: { type: "string", enum: [...TIME_WINDOWS] },
        items: { type: "array", items: { type: "object", properties: { category: { type: "string", enum: [...LUGGAGE_CATEGORIES, "cargo"] }, quantity: { type: "integer", minimum: 1 }, description: { type: "string" } }, required: ["category", "quantity"], additionalProperties: false } },
        travelers: { type: "integer", minimum: 0 },
        flightDetails: { type: "string" },
        cruiseLine: { type: "string" },
        shipName: { type: "string" },
        groupName: { type: "string" },
        notes: { type: "string" },
        contactName: { type: "string" },
        contactEmail: { type: "string" },
        contactPhone: { type: "string" },
      },
      required: ["serviceType"],
      additionalProperties: false,
    },
  },
  {
    name: "create_lead",
    description:
      "Pass the customer to a human coordinator (handoff). Use when they ask for a person, for complaints, claims, approvals, urgent same-day needs or anything depending on live operations. Confirm their name and a phone or email first.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, topic: { type: "string" }, summary: { type: "string", description: "Short summary of what they need" } },
      required: ["name", "summary"],
      additionalProperties: false,
    },
  },
];

function locationSchemaJson() {
  return {
    type: "object",
    properties: {
      type: { type: "string", enum: [...LOCATION_TYPES] },
      address: { type: "string", description: "Address, hotel name, or area" },
      market: { type: "string", enum: [...MARKET_OPTIONS] },
      facility: { type: "string", description: "Airport code (MIA, FLL, EYW, PBI, MCO, TPA, RSW) or port (portmiami, port-everglades, port-of-key-west, port-of-palm-beach, port-canaveral, port-tampa-bay)" },
    },
    additionalProperties: false,
  };
}

// ---------------------------------------------------------------- zod validators (untrusted input)

const loc = z
  .object({
    type: z.enum(LOCATION_TYPES).optional(),
    address: z.string().max(300).optional(),
    market: z.enum(MARKET_OPTIONS).optional(),
    facility: z.string().max(80).optional(),
  })
  .strict();

export const startQuoteInput = z
  .object({
    serviceType: z.enum(SERVICE_TYPES),
    pickup: loc.optional(),
    delivery: loc.optional(),
    serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    timeWindow: z.enum(TIME_WINDOWS).optional(),
    items: z.array(z.object({ category: z.enum([...LUGGAGE_CATEGORIES, "cargo"] as const), quantity: z.number().int().min(1).max(5000), description: z.string().max(200).optional() }).strict()).max(20).optional(),
    travelers: z.number().int().min(0).max(10000).optional(),
    flightDetails: z.string().max(200).optional(),
    cruiseLine: z.string().max(120).optional(),
    shipName: z.string().max(120).optional(),
    groupName: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
    contactName: z.string().max(120).optional(),
    contactEmail: z.string().email().max(200).optional(),
    contactPhone: z.string().max(40).optional(),
  })
  .strict();

const trackInput = z.object({ reference: z.string().trim().min(6).max(40), verifier: z.string().trim().min(4).max(200) }).strict();
const searchInput = z.object({ query: z.string().trim().min(1).max(300) }).strict();
export const leadInput = z
  .object({ name: z.string().trim().min(1).max(120), email: z.string().email().max(200).optional(), phone: z.string().max(40).optional(), topic: z.string().max(80).optional(), summary: z.string().trim().min(1).max(2000) })
  .strict();

// ---------------------------------------------------------------- executors

export type ToolContext = { conversationId: string; lang: "en" | "es" };

/** Converts the tool's start_quote input into the quote wizard's draft shape (strings, see components/quote/flow.ts). */
export function toWizardDraft(q: z.infer<typeof startQuoteInput>) {
  const l = (x?: z.infer<typeof loc>) => {
    if (!x) return undefined;
    const facilityName = x.facility ? airports.find((a) => a.code === x.facility?.toUpperCase())?.name ?? ports.find((p) => p.slug === x.facility)?.name : undefined;
    return {
      type: x.type ?? "",
      address: x.address || facilityName || "",
      facility: x.facility ? (airports.find((a) => a.code === x.facility?.toUpperCase())?.code ?? x.facility) : "",
      market: x.market ?? "",
    };
  };
  return {
    serviceType: q.serviceType,
    pickup: l(q.pickup),
    delivery: l(q.delivery),
    serviceDate: q.serviceDate ?? "",
    timeWindow: q.timeWindow ?? "",
    items: q.items?.map((i) => ({ category: i.category, quantity: String(i.quantity), description: i.description ?? "" })),
    travelers: q.travelers != null ? String(q.travelers) : "",
    flightDetails: q.flightDetails ?? "",
    cruiseLine: q.cruiseLine ?? "",
    shipName: q.shipName ?? "",
    groupName: q.groupName ?? "",
    notes: [q.notes, "Started with the Express Bags website assistant."].filter(Boolean).join("\n"),
    contact: { name: q.contactName ?? "", email: q.contactEmail ?? "", phone: q.contactPhone ?? "" },
  };
}

export async function createQuoteDraft(input: z.infer<typeof startQuoteInput>, conversationId?: string) {
  const token = publicToken(24);
  await prisma.aiQuoteDraft.create({
    data: { token, conversationId, data: toWizardDraft(input) as object, expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000) },
  });
  return { token, url: `/request-a-quote?draft=${token}` };
}

/** Customer-verified tracking summary. Same verification rule as /v1/track; returns NO staff identities. */
export async function trackingSummary(reference: string, verifier: string) {
  const ref = reference.toUpperCase().replace(/\s+/g, "");
  const orderRef = /^EB-\d{6}-[A-Z0-9]{4}-\d{2,4}$/.test(ref) ? ref.replace(/-\d{2,4}$/, "") : ref;
  const order = await prisma.order.findUnique({
    where: { reference: orderRef },
    select: {
      reference: true, status: true, serviceDate: true, timeWindow: true, delivery: true,
      customer: { select: { email: true, phone: true } },
      pieces: { select: { status: true } },
      shipments: { select: { carrier: true, trackingNumber: true } },
    },
  });
  if (!order || !verifierMatches(verifier, { email: order.customer.email, phone: order.customer.phone, delivery: order.delivery })) return null;
  return {
    reference: order.reference,
    status: STATUS_LABEL[order.status],
    serviceDate: order.serviceDate.toISOString().slice(0, 10),
    timeWindow: order.timeWindow,
    pieces: `${order.pieces.filter((p) => p.status === "DELIVERED").length} of ${order.pieces.length} delivered`,
    carrierTracking: order.shipments.filter((s) => s.trackingNumber).map((s) => `${s.carrier} (carrier tracking number, separate from the Express Bags reference): ${s.trackingNumber}`),
    fullTrackingPage: "/track",
  };
}

export async function createLead(input: z.infer<typeof leadInput>, ctx: ToolContext) {
  if (!input.email && !input.phone) return { ok: false as const, error: "Ask for a phone number or email first." };
  const msg = await prisma.contactMessage.create({
    data: {
      name: input.name,
      email: input.email ?? "not-provided@assistant.local",
      phone: input.phone,
      topic: `assistant-handoff${input.topic ? `: ${input.topic}` : ""}`.slice(0, 120),
      message: `[Website assistant handoff · ${ctx.lang.toUpperCase()}]\n${input.summary}`,
    },
  });
  await prisma.aiConversation.update({ where: { id: ctx.conversationId }, data: { handoffRequested: true, leadEmail: input.email ?? undefined } }).catch(() => undefined);
  return { ok: true as const, leadId: msg.id };
}

/** Dispatches a model tool call. Returns a JSON string for the model. Throws on invalid input (→ error tool_result). */
export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<string> {
  switch (name) {
    case "search_knowledge": {
      const { query } = searchInput.parse(rawInput);
      const hits = searchKnowledge(query, 4).map((h) => ({ title: h.title, url: h.url, text: h.text.slice(0, 900) }));
      return JSON.stringify(hits.length ? hits : [{ note: "No matching public content. Offer to start a quote or call the office." }]);
    }
    case "get_tracking_status": {
      const { reference, verifier } = trackInput.parse(rawInput);
      const t = await trackingSummary(reference, verifier);
      return JSON.stringify(t ?? { found: false, note: "No delivery matched that reference and verifier. Ask the customer to double-check, or use /track." });
    }
    case "start_quote": {
      const input = startQuoteInput.parse(rawInput);
      const d = await createQuoteDraft(input, ctx.conversationId);
      return JSON.stringify({ link: d.url, note: "Give the customer this link. They review, add anything missing and submit. Pricing comes later as a written quotation." });
    }
    case "create_lead": {
      const r = await createLead(leadInput.parse(rawInput), ctx);
      return JSON.stringify(r.ok ? { ok: true, note: "Lead passed to the office team. Tell the customer a coordinator will follow up and they can call (305) 783-2860." } : r);
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}
