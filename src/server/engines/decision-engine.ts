/**
 * Service decision engine: decides the fulfillment path for a quote request BEFORE any price
 * is calculated (Master Platform Requirements §1.1 and §6).
 *
 *  - "custom-quote"   → large / complex / fleet-scale / group-event work, priced manually
 *  - "special-route"  → outside the eight priority markets ("Other Florida route")
 *  - "standard-quote" → normal orders that qualify for standard (later automatic) pricing
 *
 * All thresholds are admin-configurable (DecisionThresholds).
 */
import type { QuoteRequest } from "@/lib/quote-schema";
import { DEFAULT_THRESHOLDS, type DecisionThresholds } from "./config";

export type QuoteRoute = "custom-quote" | "standard-quote" | "special-route";

export type Decision = {
  route: QuoteRoute;
  /** Human-readable reasons, stored with the request for staff */
  reasons: string[];
  /** Which pricing engine would price a standard request (when pricing is enabled) */
  engine: "local" | "carrier" | "storage" | null;
  totalPieces: number;
};

type DecisionInput = Pick<QuoteRequest, "serviceType" | "pickup" | "delivery" | "items"> &
  Partial<Pick<QuoteRequest, "extraStops" | "travelers" | "vehiclesNeeded" | "speed">>;

/** Length + girth (L + 2W + 2H) in inches — the carrier-style oversize measure. */
export function lengthPlusGirth(l = 0, w = 0, h = 0) {
  const [a, b, c] = [l, w, h].sort((x, y) => y - x);
  return a + 2 * b + 2 * c;
}

export function decideRoute(req: DecisionInput, thresholds: DecisionThresholds = DEFAULT_THRESHOLDS): Decision {
  const reasons: string[] = [];
  const totalPieces = req.items.reduce((sum, it) => sum + (it.quantity || 0), 0);
  const stops = req.extraStops?.length ?? 0;
  const oversizedPieces = req.items
    .filter((it) => it.category === "oversized" || it.category === "special")
    .reduce((s, it) => s + it.quantity, 0);

  // 1. Outside the priority markets → special route review
  const markets = [req.pickup.market, req.delivery.market, ...(req.extraStops ?? []).map((s) => s.market)];
  if (req.serviceType !== "nationwide-shipping" && markets.some((m) => m === "other-florida" || m === "outside-florida")) {
    reasons.push("Route includes a location outside the eight priority Florida markets");
    return { route: "special-route", reasons, engine: null, totalPieces };
  }

  // 2. Service types that always need planning
  if (thresholds.alwaysCustomServices.includes(req.serviceType)) {
    reasons.push(`"${req.serviceType}" service is always quoted manually`);
  }
  if (totalPieces > thresholds.maxAutoPieces) reasons.push(`${totalPieces} pieces exceeds the automatic limit of ${thresholds.maxAutoPieces}`);
  if (stops > thresholds.maxAutoExtraStops) reasons.push(`${stops} extra stops exceeds the automatic limit of ${thresholds.maxAutoExtraStops}`);
  if ((req.travelers ?? 0) > thresholds.maxAutoTravelers) reasons.push(`${req.travelers} travelers exceeds the automatic limit of ${thresholds.maxAutoTravelers}`);
  if (oversizedPieces > thresholds.maxAutoOversizedPieces) reasons.push(`${oversizedPieces} oversized/special pieces exceeds the limit of ${thresholds.maxAutoOversizedPieces}`);
  if (req.vehiclesNeeded && /\b([2-9]|\d{2,})\s*(trucks?|vehicles?|vans?)\b|multiple|several|fleet/i.test(req.vehiclesNeeded)) {
    reasons.push("Request mentions multiple vehicles");
  }
  for (const it of req.items) {
    if ((it.weightLbs ?? 0) > thresholds.maxAutoItemWeightLbs) {
      reasons.push(`An item weighs ${it.weightLbs} lbs (limit ${thresholds.maxAutoItemWeightLbs})`);
      break;
    }
    const lg = lengthPlusGirth(it.lengthIn, it.widthIn, it.heightIn);
    if (lg > thresholds.maxAutoItemLengthGirthIn) {
      reasons.push(`An item measures ${lg} in length + girth (limit ${thresholds.maxAutoItemLengthGirthIn})`);
      break;
    }
  }

  if (reasons.length > 0) return { route: "custom-quote", reasons, engine: null, totalPieces };

  const engine = req.serviceType === "nationwide-shipping" ? "carrier" : req.serviceType === "storage" ? "storage" : "local";
  reasons.push(
    engine === "carrier"
      ? "Standard luggage shipment (carrier rates confirmed by staff while automatic pricing is off)"
      : "Within automatic limits for standard pricing",
  );
  return { route: "standard-quote", reasons, engine, totalPieces };
}
