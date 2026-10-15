/**
 * AI lead qualification: when a quote request is created, summarise it for the office (segment, size,
 * urgency, value band, next action, missing info) and store it on QuoteRequest.aiSummary (internal only).
 * Runs only when a real AI provider is configured and the setting is on; never blocks quote intake.
 * Only the request itself is sent to the model: no other customers' data, no internal costs.
 */
import { z } from "zod";
import { SERVICE_LABELS, type ServiceType } from "@/lib/quote-schema";
import { prisma } from "../../db";
import { on } from "../../lib/events";
import { ai } from "../../providers/registry";
import { getAssistantSettings } from "./settings";

export const leadSummarySchema = z.object({
  segment: z.enum(["hotel-resort", "dmc-tour-operator", "corporate", "cruise-passenger", "traveler", "sports-team", "entertainment", "event-convention", "commercial", "other"]),
  size: z.enum(["single", "small-group", "large-group", "fleet-scale"]),
  urgency: z.enum(["same-day", "this-week", "planned", "unknown"]),
  valueBand: z.enum(["low", "medium", "high", "strategic"]),
  recurringPotential: z.boolean(),
  summary: z.string().max(600),
  nextAction: z.string().max(300),
  missingInfo: z.array(z.string().max(120)).max(8),
});
export type LeadSummary = z.infer<typeof leadSummarySchema> & { model: string; generatedAt: string };

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["segment", "size", "urgency", "valueBand", "recurringPotential", "summary", "nextAction", "missingInfo"],
  properties: {
    segment: { type: "string", enum: leadSummarySchema.shape.segment.options },
    size: { type: "string", enum: leadSummarySchema.shape.size.options },
    urgency: { type: "string", enum: leadSummarySchema.shape.urgency.options },
    valueBand: { type: "string", enum: leadSummarySchema.shape.valueBand.options },
    recurringPotential: { type: "boolean" },
    summary: { type: "string" },
    nextAction: { type: "string" },
    missingInfo: { type: "array", items: { type: "string" } },
  },
};

const SYSTEM = `You qualify inbound quote requests for Express Bags, a Florida luggage, hospitality and commercial logistics company (Miami HQ).
Return ONLY the JSON object requested. Be factual: use only the request content. Never estimate prices.
Value band guide: strategic = recurring B2B account potential (hotels, DMCs, corporate, events with repeat calendars) or fleet-scale work; high = large group or multi-vehicle; medium = small group or business courier; low = single traveler one-off.
nextAction: one concrete step for the office (e.g. "Call within 2 hours: same-day cruise transfer, confirm terminal access"). missingInfo: details dispatch still needs.`;

/** Strips contact details before sending the request to the model (they aren't needed to qualify the lead). */
export function redactForModel(payload: Record<string, unknown>) {
  const p = structuredClone(payload) as Record<string, unknown> & { contact?: Record<string, unknown> };
  if (p.contact) p.contact = { company: p.contact.company ?? null, preferredContact: p.contact.preferredContact ?? null };
  delete p.onsiteContact;
  delete p.attachmentIds;
  delete p.website;
  return p;
}

export async function summarizeQuote(quoteId: string): Promise<LeadSummary | null> {
  const provider = ai();
  if (provider.name === "scripted") return null;
  const settings = await getAssistantSettings();
  if (!settings.leadSummaries) return null;
  const quote = await prisma.quoteRequest.findUnique({ where: { id: quoteId }, select: { payload: true, route: true, routeReasons: true, totalPieces: true, serviceType: true, billingType: true, leadSource: true } });
  if (!quote) return null;
  const content = JSON.stringify({
    service: SERVICE_LABELS[quote.serviceType as ServiceType] ?? quote.serviceType,
    route: quote.route,
    routeReasons: quote.routeReasons,
    totalPieces: quote.totalPieces,
    billingType: quote.billingType,
    leadSource: quote.leadSource,
    request: redactForModel(quote.payload as Record<string, unknown>),
  });
  const res = await provider.chat(SYSTEM, [{ role: "user", content }], { maxTokens: 1500, model: settings.model, jsonSchema: JSON_SCHEMA });
  const parsed = leadSummarySchema.safeParse(JSON.parse(res.text || "null"));
  if (!parsed.success) return null;
  const summary: LeadSummary = { ...parsed.data, model: settings.model, generatedAt: new Date().toISOString() };
  await prisma.quoteRequest.update({ where: { id: quoteId }, data: { aiSummary: summary as object } });
  await prisma.quoteEvent.create({ data: { quoteId, type: "ai_summary", detail: `AI lead summary: ${summary.segment}, ${summary.valueBand} value`, actor: "assistant" } });
  return summary;
}

let subscribed = false;
/** Subscribe once (called from the module index). */
export function subscribeLeadQualification() {
  if (subscribed) return;
  subscribed = true;
  on("quote.created", async ({ quoteId }) => {
    await summarizeQuote(quoteId).catch((e) => console.error("[assistant] lead summary failed:", (e as Error).message));
  });
}
