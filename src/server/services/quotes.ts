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
import { emit } from "../lib/events";
import { protectionLive, tierFor } from "../modules/protection/plans";

const ROUTE_DB = { "custom-quote": "CUSTOM_QUOTE", "standard-quote": "STANDARD_QUOTE", "special-route": "SPECIAL_ROUTE" } as const;

export const ROUTE_MESSAGES: Record<QuoteRoute, string> = {
  "standard-quote":
    "Thank you. Your request has been received. Our dispatch team will confirm route, vehicle, timing and access, then send your written quotation.",
  "custom-quote":
    "Thank you. Your request needs a planned logistics quotation. A coordinator will review the details and contact you to build your custom quote.",
  "special-route":
    "Thank you. This route is outside our eight priority Florida markets, so it is reviewed as a special quotation. We will contact you once route, capacity and timing are confirmed.",
};

/** Spanish (es-US) versions of the route messages, used when the customer wrote in Spanish. */
export const ROUTE_MESSAGES_ES: Record<QuoteRoute, string> = {
  "standard-quote":
    "Gracias. Recibimos su solicitud. Nuestro equipo de despacho confirmará la ruta, el vehículo, el horario y el acceso, y luego le enviará su cotización por escrito.",
  "custom-quote":
    "Gracias. Su solicitud requiere una cotización logística planificada. Un coordinador revisará los detalles y le contactará para preparar su cotización personalizada.",
  "special-route":
    "Gracias. Esta ruta está fuera de nuestros ocho mercados prioritarios de Florida, por eso se revisa como cotización especial. Le contactaremos cuando confirmemos la ruta, la capacidad y el horario.",
};

const SERVICE_LABELS_ES: Record<string, string> = {
  "luggage-local": "Recogida y entrega local de equipaje",
  airport: "Equipaje en aeropuertos",
  cruise: "Equipaje de cruceros",
  storage: "Almacenamiento de maletas",
  "group-event": "Logística de grupos, VIP o eventos",
  courier: "Mensajería y última milla",
  truck: "Furgoneta de carga o camión de caja",
  "nationwide-shipping": "Envío de maletas a todo EE. UU.",
};

export function marketName(slug: string) {
  if (slug === "other-florida") return "Other Florida route";
  if (slug === "outside-florida") return "Outside Florida";
  return markets.find((m) => m.slug === slug)?.name ?? slug;
}

/**
 * Optional links for requests made by signed-in portal users (concierge desk, company accounts):
 * attach to an existing customer/company instead of matching by email, and merge extra
 * fields (PO number, cost center, guest name/room…) into the stored payload.
 */
export type QuoteLinkOptions = { customerId?: string; companyId?: string | null; extraPayload?: Record<string, unknown>; actor?: string };

export async function createQuote(input: QuoteRequest, meta: { ip?: string; userAgent?: string }, opts: QuoteLinkOptions = {}) {
  // A protection plan is only accepted while the module is live and the tier is active; otherwise it is dropped
  if (input.protectionTier) {
    const p = await protectionLive();
    const tier = p.live ? tierFor(p.plans, input.protectionTier) : null;
    if (!tier || tier.active === false) input = { ...input, protectionTier: undefined };
  }
  const thresholds = await getSetting("thresholds");
  const features = await getSetting("features");
  const contactSettings = await getSetting("contact");
  const decision = decideRoute(input, thresholds);

  // Unique reference (retry on the rare collision)
  let reference = quoteReference();
  for (let i = 0; i < 5 && (await prisma.quoteRequest.findUnique({ where: { reference } })); i++) reference = quoteReference();

  const email = input.contact.email.toLowerCase();
  const domain = emailDomain(email);
  const company = opts.customerId
    ? opts.companyId
      ? await prisma.company.findUnique({ where: { id: opts.companyId } })
      : null
    : input.contact.company
    ? domain
      ? await prisma.company.upsert({ where: { domain }, update: {}, create: { name: input.contact.company, domain, market: input.pickup.market } })
      : await prisma.company.create({ data: { name: input.contact.company, market: input.pickup.market } })
    : null;
  // The language the customer used drives their confirmation and later notifications (customer.language)
  const language = input.language === "es" || input.language === "en" ? input.language : undefined;
  const customer = opts.customerId
    ? await prisma.customer.findUniqueOrThrow({ where: { id: opts.customerId } })
    : await prisma.customer.upsert({
    where: { email },
    update: { name: input.contact.name, phone: input.contact.phone, preferredContact: input.contact.preferredContact, companyId: company?.id ?? undefined, ...(language ? { language } : {}) },
    create: { email, name: input.contact.name, phone: input.contact.phone, preferredContact: input.contact.preferredContact, companyId: company?.id, ...(language ? { language } : {}) },
  });
  const es = (language ?? customer.language) === "es";

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
      payload: (opts.extraPayload ? { ...input, ...opts.extraPayload } : input) as object,
      customerId: customer.id,
      companyId: company?.id,
      hubspotSyncStatus: features.hubspotSyncEnabled ? "PENDING" : "DISABLED",
      ipHash: meta.ip ? createHash("sha256").update(env.ipHashSalt + meta.ip).digest("hex").slice(0, 32) : undefined,
      userAgent: meta.userAgent?.slice(0, 300),
      events: { create: { type: "created", detail: `Routed as ${decision.route}: ${decision.reasons.join("; ")}`, actor: opts.actor ?? "website" } },
    },
  });

  // Emails (never block or fail the request)
  const service = SERVICE_LABELS[input.serviceType];
  const customerMail = es
    ? sendMail({
        to: email,
        subject: `Recibimos su solicitud ${reference} | Express Bags`,
        text: `Hola ${input.contact.name}:\n\n${ROUTE_MESSAGES_ES[decision.route]}\n\nReferencia: ${reference}\nServicio: ${SERVICE_LABELS_ES[input.serviceType] ?? service}\nFecha: ${input.serviceDate}\n\nExpress Bags, Inc.`,
        html: brandedHtml("Recibimos su solicitud", [
          `Hola ${input.contact.name}:`,
          ROUTE_MESSAGES_ES[decision.route],
          `Referencia: ${reference}`,
          `Servicio: ${SERVICE_LABELS_ES[input.serviceType] ?? service} · Fecha: ${input.serviceDate} · Piezas: ${decision.totalPieces}`,
          "Conserve su número de referencia para cualquier seguimiento.",
        ]),
      })
    : sendMail({
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

  // Domain event for subscribers (AI lead qualification, notifications…); never blocks the response
  void emit("quote.created", { quoteId: quote.id, reference });

  return { reference, route: decision.route, message: es ? ROUTE_MESSAGES_ES[decision.route] : ROUTE_MESSAGES[decision.route] };
}
