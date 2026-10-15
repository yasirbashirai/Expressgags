/**
 * Marketing attribution + Meta Conversions API.
 *
 * Design (quote-schema.ts stays untouched): after a successful quote submission the browser POSTs
 * /v1/attribution { reference, attribution, consent }. We attach it to that QuoteRequest's payload
 * (only within 2 hours of creation, only once). Advertising click IDs (gclid/fbclid/fbc/fbp) are kept
 * ONLY when the visitor granted marketing consent, and the Meta CAPI "Lead" event is sent from here
 * (not on quote.created) because only this request knows the visitor's consent choice.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../../db";
import { getMarketingSettings } from "./settings";

const touch = z
  .object({
    source: z.string().max(120).optional(),
    medium: z.string().max(120).optional(),
    campaign: z.string().max(200).optional(),
    term: z.string().max(200).optional(),
    content: z.string().max(200).optional(),
    landingPage: z.string().max(500).optional(),
    referrer: z.string().max(500).optional(),
    gclid: z.string().max(300).optional(),
    fbclid: z.string().max(300).optional(),
    at: z.string().max(40).optional(),
  })
  .strict();

export const attributionSchema = z.object({
  reference: z.string().regex(/^EB-Q-\d{6}-[A-Z0-9]{4}$/),
  attribution: z.object({ first: touch.optional(), last: touch.optional() }),
  consent: z.object({ analytics: z.boolean(), marketing: z.boolean() }),
  fbp: z.string().max(200).optional(),
  fbc: z.string().max(300).optional(),
  pageUrl: z.string().max(500).optional(),
});
export type AttributionInput = z.infer<typeof attributionSchema>;

const stripAdIds = (t?: z.infer<typeof touch>) => {
  if (!t) return t;
  const rest = { ...t };
  delete rest.gclid;
  delete rest.fbclid;
  return rest;
};

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** Meta normalization: email trimmed + lowercased; phone digits only incl. country code. */
export const hashEmail = (email: string) => sha256(email.trim().toLowerCase());
export const hashPhone = (phone: string) => {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `1${digits}`;
  return sha256(digits);
};

/** Attach attribution to the quote. Always resolves (no enumeration of references). */
export async function recordAttribution(input: AttributionInput, meta: { ip?: string; userAgent?: string }) {
  const quote = await prisma.quoteRequest.findUnique({ where: { reference: input.reference }, include: { customer: { select: { email: true, phone: true } } } });
  if (!quote) return { stored: false };
  if (Date.now() - quote.createdAt.getTime() > 2 * 60 * 60_000) return { stored: false };
  const payload = (quote.payload ?? {}) as Record<string, unknown>;
  if (payload.attribution) return { stored: false };
  const marketing = input.consent.marketing;
  const attribution = {
    first: marketing ? input.attribution.first : stripAdIds(input.attribution.first),
    last: marketing ? input.attribution.last : stripAdIds(input.attribution.last),
    consent: input.consent,
    recordedAt: new Date().toISOString(),
  };
  await prisma.quoteRequest.update({ where: { id: quote.id }, data: { payload: { ...payload, attribution } as object } });
  if (marketing) {
    await sendMetaLead({ reference: quote.reference, email: quote.customer.email, phone: quote.customer.phone, ip: meta.ip, userAgent: meta.userAgent, fbp: input.fbp, fbc: input.fbc, url: input.pageUrl, serviceType: quote.serviceType }).catch((e) =>
      console.error("[meta-capi] failed", (e as Error).message),
    );
  }
  return { stored: true };
}

/** Build the Meta CAPI payload (exported for tests). */
export function metaLeadPayload(p: { reference: string; email: string; phone?: string | null; ip?: string; userAgent?: string; fbp?: string; fbc?: string; url?: string; serviceType?: string }, now = new Date()) {
  return {
    data: [
      {
        event_name: "Lead",
        event_time: Math.floor(now.getTime() / 1000),
        // Same id as the browser pixel event (eventID = reference) so Meta de-duplicates them
        event_id: p.reference,
        action_source: "website",
        event_source_url: p.url,
        user_data: {
          em: [hashEmail(p.email)],
          ...(p.phone ? { ph: [hashPhone(p.phone)] } : {}),
          ...(p.ip ? { client_ip_address: p.ip } : {}),
          ...(p.userAgent ? { client_user_agent: p.userAgent } : {}),
          ...(p.fbp ? { fbp: p.fbp } : {}),
          ...(p.fbc ? { fbc: p.fbc } : {}),
        },
        custom_data: { content_category: p.serviceType ?? "quote" },
      },
    ],
  };
}

export async function sendMetaLead(p: Parameters<typeof metaLeadPayload>[0]) {
  const token = process.env.META_CAPI_TOKEN;
  const { metaPixelId } = await getMarketingSettings();
  if (!token || !metaPixelId) return { sent: false };
  const version = process.env.META_GRAPH_VERSION || "v21.0";
  const body = metaLeadPayload(p);
  if (process.env.META_TEST_EVENT_CODE) Object.assign(body, { test_event_code: process.env.META_TEST_EVENT_CODE });
  const res = await fetch(`https://graph.facebook.com/${version}/${metaPixelId}/events?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Meta CAPI ${res.status}`);
  return { sent: true };
}
