/**
 * Carrier-based luggage-shipping pricing layer (Master Platform Requirements §3–4).
 *
 * Raw UPS / FedEx / DHL (later USPS) account rates are INTERNAL costs. This engine:
 *  1. drops failed / disabled / prohibited carriers,
 *  2. for each Express Bags service level, keeps rates that meet its promised transit time,
 *  3. picks the cheapest qualifying rate (or a preferred carrier within a tolerance),
 *  4. builds the Express Bags retail price:
 *       carrier billable cost + surcharges + handling + pickup + protection + required profit,
 *  5. enforces minimum price / minimum profit per piece (raise to floor or manual review).
 * Rates must be the carrier-returned BILLABLE cost (dimensional weight already applied).
 */
import {
  cents,
  DEFAULT_CARRIER_RULES,
  profitMetrics,
  round2,
  SERVICE_LEVELS,
  type CarrierPricingRules,
  type MarginMode,
  type ServiceLevelCode,
} from "../config";

export type CarrierRate = {
  carrier: string; // "UPS" | "FedEx" | "DHL" | "USPS" | …
  service: string; // carrier's own service name, e.g. "FedEx 2Day"
  billableCostCents: number;
  surchargesCents?: number;
  transitDays: number;
};

/** A carrier API call result: either rates or an error (e.g. timeout). */
export type CarrierResponse = { carrier: string; rates?: CarrierRate[]; error?: string };

export type ShipmentContext = {
  pieces: number;
  oversizedPieces?: number;
  overweightPieces?: number;
  destinationZone?: string;
  includePickup?: boolean;
  protectionCents?: number;
};

export type ServiceOffer = {
  level: ServiceLevelCode;
  levelName: string;
  /** Internal only — hidden from customers unless showCarrierNameBeforeCheckout */
  carrier: string;
  carrierService: string;
  transitDays: number;
  retailCents: number;
  costCents: number;
  profitCents: number;
  markupPercent: number;
  marginPercent: number;
  manualReview: boolean;
  notes: string[];
};

export type CarrierQuoteResult =
  | { status: "priced"; offers: ServiceOffer[]; carriersFailed: string[] }
  | { status: "request-quote"; reason: string; carriersFailed: string[] };

/** Price from cost using a markup percentage: $100 at 40% → $140. */
export function markupToPrice(costCents: number, markupPercent: number) {
  return cents(costCents * (1 + markupPercent / 100));
}

/** Price from cost using a TRUE gross-margin percentage: $100 at 40% GM → $166.67. */
export function marginToPrice(costCents: number, marginPercent: number) {
  if (marginPercent >= 100) throw new Error("Gross margin must be below 100%");
  return cents(costCents / (1 - marginPercent / 100));
}

export function applyMode(costCents: number, percent: number, mode: MarginMode) {
  return mode === "margin" ? marginToPrice(costCents, percent) : markupToPrice(costCents, percent);
}

/** Pick the rate to use for one service level: cheapest, unless the preferred carrier is within tolerance. */
export function selectRate(rates: CarrierRate[], rules: CarrierPricingRules): CarrierRate | null {
  if (rates.length === 0) return null;
  const total = (r: CarrierRate) => r.billableCostCents + (r.surchargesCents ?? 0);
  const sorted = [...rates].sort((a, b) => total(a) - total(b) || a.transitDays - b.transitDays);
  const cheapest = sorted[0];
  if (rules.preferredCarrier) {
    const pref = sorted.find((r) => r.carrier === rules.preferredCarrier);
    if (pref && total(pref) <= total(cheapest) * (1 + rules.preferenceTolerancePercent / 100)) return pref;
  }
  return cheapest;
}

export function quoteCarrierShipment(
  responses: CarrierResponse[],
  ctx: ShipmentContext,
  rules: CarrierPricingRules = DEFAULT_CARRIER_RULES,
): CarrierQuoteResult {
  const carriersFailed = responses.filter((r) => r.error || !r.rates).map((r) => r.carrier);
  const usable = responses
    .filter((r) => !r.error && r.rates)
    .flatMap((r) => r.rates!)
    .filter((r) => !rules.disabledCarriers.includes(r.carrier));

  if (usable.length === 0) {
    return {
      status: "request-quote",
      reason: carriersFailed.length ? "Carrier rates are temporarily unavailable" : "No eligible carrier rates",
      carriersFailed,
    };
  }

  const offers: ServiceOffer[] = [];
  for (const level of SERVICE_LEVELS) {
    const eligible = usable.filter(
      (r) => r.transitDays <= level.maxTransitDays && !(rules.prohibitedCarrierLevels[r.carrier] ?? []).includes(level.code),
    );
    const rate = selectRate(eligible, rules);
    if (!rate) continue;
    offers.push(buildOffer(rate, level.code, level.name, ctx, rules));
  }

  if (offers.length === 0) return { status: "request-quote", reason: "No carrier service meets the requested delivery times", carriersFailed };
  return { status: "priced", offers, carriersFailed };
}

function buildOffer(rate: CarrierRate, level: ServiceLevelCode, levelName: string, ctx: ShipmentContext, rules: CarrierPricingRules): ServiceOffer {
  const notes: string[] = [];
  // Express Bags' total internal cost for this shipment
  const cost =
    rate.billableCostCents +
    (rate.surchargesCents ?? 0) +
    rules.handlingFee +
    (ctx.includePickup === false ? 0 : rules.pickupFee) +
    (ctx.oversizedPieces ?? 0) * rules.oversizeFeePerPiece +
    (ctx.overweightPieces ?? 0) * rules.overweightFeePerPiece +
    (ctx.protectionCents ?? 0);

  const percent =
    rules.percentByServiceLevel[level] ?? rules.percentByCarrier[rate.carrier] ?? rules.defaultPercent;
  let retail = applyMode(cost, percent, rules.mode);

  const zoneAdj = ctx.destinationZone ? rules.zoneAdjustPercent[ctx.destinationZone] ?? 0 : 0;
  if (zoneAdj) retail = cents(retail * (1 + zoneAdj / 100));
  if (rules.reservePercent > 0) retail = cents(retail * (1 + rules.reservePercent / 100));
  if (ctx.pieces >= rules.multiPieceDiscount.minPieces && rules.multiPieceDiscount.percent > 0) {
    retail = cents(retail * (1 - rules.multiPieceDiscount.percent / 100));
    notes.push(`Multi-piece discount ${rules.multiPieceDiscount.percent}%`);
  }
  if (rules.promoPercent > 0) retail = cents(retail * (1 - rules.promoPercent / 100));

  // Guardrails: carrier price spikes must never silently remove profit
  let manualReview = false;
  const minProfit = rules.minimumProfitPerPiece * Math.max(1, ctx.pieces);
  const floor = Math.max(rules.minimumPrice, cost + minProfit);
  if (retail < floor) {
    if (rules.raiseToFloor) {
      notes.push(`Raised to floor $${(floor / 100).toFixed(2)} (minimum price / minimum profit)`);
      retail = floor;
    } else {
      manualReview = true;
      notes.push("Below minimum price or minimum profit; staff review required");
    }
  }

  return {
    level,
    levelName,
    carrier: rate.carrier,
    carrierService: rate.service,
    transitDays: rate.transitDays,
    ...profitMetrics(cost, retail),
    manualReview,
    notes,
  };
}

/** Customer-facing view of an offer: Express Bags names and prices only. */
export function publicOffer(o: ServiceOffer, rules: CarrierPricingRules) {
  return {
    level: o.level,
    name: o.levelName,
    price: round2(o.retailCents / 100),
    transitDays: o.transitDays,
    ...(rules.showCarrierNameBeforeCheckout ? { carrier: o.carrier } : {}),
  };
}
