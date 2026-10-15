/**
 * Nationwide / international luggage shipping quotes (Carlos's carrier documents, Master Req. §3–4).
 *
 * Flow: Express Bags picks the luggage up (first mile) → Express Bags processing point → UPS / FedEx /
 * DHL / USPS → destination. Rates are shopped FROM the processing point, one parcel per bag (each bag
 * gets its own label and tracking number), using Express Bags' own carrier accounts through the
 * multi-carrier provider. The carrier engine then turns BILLABLE carrier cost (dimensional weight
 * already applied by the carrier) into Express Bags service levels and retail prices.
 *
 * Carrier rules enforced here (before pricing):
 *  - DHL Express only for international destinations (no US-domestic DHL)
 *  - USPS only for parcels ≤ 70 lb and ≤ 130" length + girth
 *  - UPS / FedEx ≤ 150 lb and ≤ 165" length + girth per piece; anything bigger → custom quote
 *  - one carrier failing never breaks the others; all failing → "Request a Quote"
 */
import type { LUGGAGE_CATEGORIES } from "@/lib/quote-schema";
import { DEFAULT_CARRIER_RULES, type CarrierPricingRules } from "../../engines/config";
import { publicOffer, quoteCarrierShipment, type CarrierResponse, type ServiceOffer } from "../../engines/pricing/carrier";
import type { Address, CarrierRate as ProviderRate, Parcel } from "../../providers";
import { carriers } from "../../providers/registry";
import { getActiveRules, getSetting } from "../../settings";
import { isInternational } from "./address";
import { CARRIER_LIMITS, CARRIERS, dimensionalWeight, getCarrierSettings, lengthPlusGirth, type CarrierCode, type CarrierSettings } from "./settings";

type Category = (typeof LUGGAGE_CATEGORIES)[number] | "cargo";

export type PieceInput = { category: Category; weightLbs?: number; lengthIn?: number; widthIn?: number; heightIn?: number };

export type NationwideInput = {
  destination: Address;
  /** Customer's own pickup location (first mile). Omit when bags are dropped at the processing point. */
  includePickup: boolean;
  pieces: PieceInput[];
  /** Override the processing point (defaults to settings.defaultProcessingPoint) */
  processingPoint?: string;
};

export type ParcelLine = Parcel & { category: Category; billableWeightLbs: number; lengthPlusGirth: number; eligible: CarrierCode[]; usedDefaults: boolean };

/** Per-offer references to the provider rate for every parcel (needed to buy the labels later). */
export type RateRefs = Record<string, { providerRateId: string; shipmentRef?: string; costCents: number }[]>;

export type NationwideResult =
  | { status: "priced"; offers: ServiceOffer[]; carriersFailed: string[]; parcels: ParcelLine[]; rateRefs: RateRefs; origin: Address; rules: CarrierPricingRules }
  | { status: "request-quote"; reason: string; carriersFailed: string[]; parcels: ParcelLine[] };

const RATE_TIMEOUT_MS = 12_000;
const offerKey = (carrier: string, service: string) => `${carrier}|${service}`;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Carrier rates timed out")), ms);
    p.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });
}

/** Fill missing measurements from the configured defaults; compute billable weight + eligible carriers. */
export function buildParcels(pieces: PieceInput[], settings: CarrierSettings, international: boolean): ParcelLine[] {
  return pieces.map((p) => {
    const cat = p.category === "cargo" ? "special" : p.category;
    const def = settings.defaultDims[cat];
    const usedDefaults = !(p.weightLbs && p.lengthIn && p.widthIn && p.heightIn);
    const parcel = {
      weightLbs: p.weightLbs || def.weightLbs,
      lengthIn: p.lengthIn || def.lengthIn,
      widthIn: p.widthIn || def.widthIn,
      heightIn: p.heightIn || def.heightIn,
    };
    const lpg = lengthPlusGirth(parcel);
    const eligible = CARRIERS.filter((c) => {
      const lim = CARRIER_LIMITS[c];
      if (!settings.enabledCarriers.includes(c)) return false;
      if (international ? !lim.international : !lim.domestic) return false;
      return parcel.weightLbs <= lim.maxWeightLbs && lpg <= lim.maxLengthPlusGirthIn;
    });
    return { ...parcel, category: p.category, billableWeightLbs: Math.max(parcel.weightLbs, dimensionalWeight(parcel)), lengthPlusGirth: lpg, eligible, usedDefaults };
  });
}

/** Internal quote with costs (staff + engine). Never return this object to a customer. */
export async function quoteNationwide(input: NationwideInput, opts: { settings?: CarrierSettings; rules?: CarrierPricingRules } = {}): Promise<NationwideResult> {
  const settings = opts.settings ?? (await getCarrierSettings());
  const baseRules = opts.rules ?? ((await getActiveRules("carrier").catch(() => DEFAULT_CARRIER_RULES)) as CarrierPricingRules);
  const rules: CarrierPricingRules = {
    ...baseRules,
    showCarrierNameBeforeCheckout: settings.showCarrierBeforeCheckout,
    disabledCarriers: Array.from(new Set([...baseRules.disabledCarriers, ...CARRIERS.filter((c) => !settings.enabledCarriers.includes(c))])),
  };
  const international = isInternational(input.destination);
  const parcels = buildParcels(input.pieces, settings, international);

  if (parcels.length === 0) return { status: "request-quote", reason: "Add at least one bag to ship.", carriersFailed: [], parcels };
  const thresholds = await getSetting("thresholds");
  if (parcels.length > thresholds.maxAutoPieces) {
    return { status: "request-quote", reason: "Large shipments are planned by our team. Please request a quote.", carriersFailed: [], parcels };
  }
  const tooBig = parcels.find((p) => p.eligible.length === 0);
  if (tooBig) {
    return {
      status: "request-quote",
      reason: "One item is above carrier size or weight limits. Our team will plan it as a custom quote.",
      carriersFailed: [],
      parcels,
    };
  }

  const point = settings.processingPoints.find((p) => p.code === (input.processingPoint ?? settings.defaultProcessingPoint) && p.active) ?? settings.processingPoints[0];
  const origin: Address = { name: "Express Bags, Inc.", street1: point.street1, city: point.city, state: point.state, zip: point.zip, country: "US" };

  // One rate request per parcel (each bag is its own shipment / label), in parallel.
  const provider = carriers();
  const perParcel = await Promise.all(
    parcels.map(async (parcel) => {
      try {
        const r = await withTimeout(provider.rates(origin, input.destination, [parcel]), RATE_TIMEOUT_MS);
        const rates = r.rates.filter((rate) => (parcel.eligible as string[]).includes(rate.carrier));
        return { ok: true as const, rates, errors: r.errors, shipmentRef: r.shipmentRef };
      } catch (e) {
        return { ok: false as const, rates: [] as ProviderRate[], errors: [(e as Error).message], shipmentRef: undefined };
      }
    }),
  );

  // Aggregate: a carrier service is offerable only if it priced EVERY parcel.
  const agg = new Map<string, { carrier: string; service: string; costCents: number; transitDays: number; refs: RateRefs[string] }>();
  perParcel.forEach((res, idx) => {
    for (const rate of res.rates) {
      const k = offerKey(rate.carrier, rate.service);
      const cur = agg.get(k) ?? { carrier: rate.carrier, service: rate.service, costCents: 0, transitDays: 0, refs: [] };
      if (cur.refs.length !== idx) continue; // missing for an earlier parcel → can never cover all parcels
      cur.costCents += rate.costCents;
      cur.transitDays = Math.max(cur.transitDays, rate.transitDays ?? 99);
      cur.refs.push({ providerRateId: rate.providerRateId, shipmentRef: res.shipmentRef, costCents: rate.costCents });
      agg.set(k, cur);
    }
  });
  const complete = [...agg.values()].filter((a) => a.refs.length === parcels.length);

  // Which carriers failed: provider error mentions them, or they priced no parcel while eligible.
  const allErrors = perParcel.flatMap((p) => p.errors).join(" | ");
  const everyCallFailed = perParcel.every((p) => !p.ok);
  const eligibleCarriers = new Set(parcels.flatMap((p) => p.eligible));
  const responses: CarrierResponse[] = [];
  for (const carrier of eligibleCarriers) {
    const rates = complete.filter((a) => a.carrier === carrier);
    const mentioned = new RegExp(`\\b${carrier}\\b`, "i").test(allErrors);
    if (rates.length) responses.push({ carrier, rates: rates.map((a) => ({ carrier, service: a.service, billableCostCents: a.costCents, transitDays: a.transitDays })) });
    else responses.push({ carrier, error: everyCallFailed ? "unavailable" : mentioned ? "carrier error" : "no rates" });
  }

  const oversizedPieces = parcels.filter((p) => p.category === "oversized" || p.category === "special" || p.lengthPlusGirth > 130).length;
  const overweightPieces = parcels.filter((p) => p.weightLbs > 50).length;
  const priced = quoteCarrierShipment(responses, { pieces: parcels.length, oversizedPieces, overweightPieces, includePickup: input.includePickup }, rules);
  const carriersFailed = priced.carriersFailed.filter((c) => {
    const r = responses.find((x) => x.carrier === c);
    return r?.error === "unavailable" || r?.error === "carrier error";
  });
  if (priced.status !== "priced") return { status: "request-quote", reason: priced.reason, carriersFailed, parcels };

  const rateRefs: RateRefs = {};
  for (const o of priced.offers) rateRefs[o.level] = agg.get(offerKey(o.carrier, o.carrierService))?.refs ?? [];
  return { status: "priced", offers: priced.offers, carriersFailed, parcels, rateRefs, origin, rules };
}

/** Customer-facing projection: Express Bags service names + retail prices only (carrier name only if allowed). */
export function publicNationwide(result: NationwideResult) {
  if (result.status !== "priced") return { available: false as const, reason: result.reason };
  const offers = result.offers.filter((o) => !o.manualReview).map((o) => publicOffer(o, result.rules));
  if (!offers.length) return { available: false as const, reason: "This shipment needs a quick review by our team." };
  return { available: true as const, offers, pieces: result.parcels.length, measurementsEstimated: result.parcels.some((p) => p.usedDefaults) };
}
