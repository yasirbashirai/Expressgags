/**
 * Quote intake service: decision engine → store → emails → HubSpot sync (when enabled).
 */
import { createHash } from "node:crypto";
import { SERVICE_LABELS, type QuoteRequest } from "@/lib/quote-schema";
import { markets } from "@/content/site";
import { prisma } from "../db";
import { decideRoute, type QuoteRoute } from "../engines/decision-engine";
import { brandedHtml, sendMail } from "../lib/email";
import { env } from "../lib/env";
import { quoteReference } from "../lib/reference";
import { mapQuoteToHubSpot, syncToHubSpot, emailDomain } from "../integrations/hubspot";
import { getSetting } from "../settings";

const ROUTE_DB = { "custom-quote": "CUSTOM_QUOTE", "standard-quote": "STANDARD_QUOTE", "special-route": "SPECIAL_ROUTE" } as const;

export const ROUTE_MESSAGES: Record<QuoteRoute, string> = {
  "standard-quote":
    "Thank you. Your request has been received. Our dispatch team will confirm route, vehicle, timing and access, then send your written quotation.",
  "custom-quote":
    "Thank you. Your request needs a planned logistics quotation. A coordinator will review the details and contact you to build your custom quote.",
  "special-route":
    "Thank you. This route is outside our eight priority Florida markets, so it is reviewed as a special quotation. We will contact you once route, capacity and timing are confirmed.",
};

export function marketName(slug: string) {
  if (slug === "other-florida") return "Other Florida route";
  if (slug === "outside-florida") return "Outside Florida";
  return markets.find((m) => m.slug === slug)?.name ?? slug;
}

export async function createQuote(input: QuoteRequest, meta: { ip?: string; userAgent?: string }) {
  const thresholds = await getSetting("thresholds");
  const features = await getSetting("features");
  const contactSettings = await getSetting("contact");
  const decision = decideRoute(input, thresholds);

  // Unique reference (retry on the rare collision)
  let reference = quoteReference();
  for (let i = 0; i < 5 && (await prisma.quoteRequest.findUnique({ where: { reference } })); i++) reference = quoteReference();

  const email = input.contact.email.toLowerCase();
  const domain = emailDomain(email);
  const company = input.contact.company
    ? domain
      ? await prisma.company.upsert({ where: { domain }, update: {}, create: { name: input.contact.company, domain, market: input.pickup.market } })
      : await prisma.company.create({ data: { name: input.contact.company, market: input.pickup.market } })
    : null;
  const customer = await prisma.customer.upsert({
    where: { email },
    update: { name: input.contact.name, phone: input.contact.phone, preferredContact: input.contact.preferredContact, companyId: company?.id ?? undefined },
    create: { email, name: input.contact.name, phone: input.contact.phone, preferredContact: input.contact.preferredContact, companyId: company?.id },
  });

  const hubspotOn = features.hubspotSyncEnabled && !!env.hubspotToken;
  const quote = await prisma.quoteRequest.create({
    data: {
      reference,
      serviceType: input.serviceType,
      route: ROUTE_DB[decision.route],
      routeReasons: decision.reasons,
      pickupMarket: input.pickup.market,
      deliveryMarket: input.delivery.market,
      serviceDate: input.serviceDate,
      totalPieces: decision.totalPieces,
      leadSource: input.leadSource,
      billingType: input.billingType,
      payload: input as object,
      customerId: customer.id,
      companyId: company?.id,
      hubspotSyncStatus: features.hubspotSyncEnabled ? "PENDING" : "DISABLED",
      ipHash: meta.ip ? createHash("sha256").update(env.ipHashSalt + meta.ip).digest("hex").slice(0, 32) : undefined,
      userAgent: meta.userAgent?.slice(0, 300),
      events: { create: { type: "created", detail: `Routed as ${decision.route}: ${decision.reasons.join("; ")}`, actor: "website" } },
    },
  });

  // Emails (never block or fail the request)
  const service = SERVICE_LABELS[input.serviceType];
  const customerMail = sendMail({
    to: email,
    subject: `We received your request ${reference} | Express Bags`,
    text: `Hello ${input.contact.name},\n\n${ROUTE_MESSAGES[decision.route]}\n\nReference: ${reference}\nService: ${service}\nDate: ${input.serviceDate}\n\nExpress Bags, Inc.`,
    html: brandedHtml("We received your request", [
      `Hello ${input.contact.name},`,
      ROUTE_MESSAGES[decision.route],
      `Reference: ${reference}`,
      `Service: ${service} · Date: ${input.serviceDate} · Pieces: ${decision.totalPieces}`,
      "Please keep your reference number for any follow-up.",
    ]),
  });
  const staffMail = contactSettings.notifyEmail
    ? sendMail({
        to: contactSettings.notifyEmail,
        replyTo: email,
        subject: `New ${decision.route.replace("-", " ")}: ${reference} · ${service} · ${marketName(input.pickup.market)}`,
        text: `${reference}\n${service}\nRoute: ${decision.route} (${decision.reasons.join("; ")})\n${input.pickup.address} → ${input.delivery.address}\nDate: ${input.serviceDate} ${input.timeWindow}\nPieces: ${decision.totalPieces}\nContact: ${input.contact.name}, ${email}, ${input.contact.phone}\nLead source: ${input.leadSource}`,
      })
    : Promise.resolve("LOGGED" as const);
  await Promise.allSettled([customerMail, staffMail]);

  if (hubspotOn) {
    try {
      const { dealId } = await syncToHubSpot(mapQuoteToHubSpot(input, { reference, route: decision.route }));
      await prisma.quoteRequest.update({ where: { id: quote.id }, data: { hubspotSyncStatus: "SYNCED", hubspotDealId: dealId } });
    } catch (e) {
      await prisma.quoteRequest.update({ where: { id: quote.id }, data: { hubspotSyncStatus: "FAILED", hubspotError: (e as Error).message.slice(0, 500) } });
    }
  }

  return { reference, route: decision.route, message: ROUTE_MESSAGES[decision.route] };
}
