/**
 * Local pickup & drop-off pricing engine (Master Platform Requirements §5, §13).
 * Zone- and/or distance-based, built ONLY from Express Bags' admin-configured rules.
 * It never calls carrier rates. Output includes internal profit metrics.
 */
import { cents, DEFAULT_LOCAL_RULES, profitMetrics, type LocalPricingRules } from "../config";

export type LocalPriceInput = {
  pickupZone: string;
  deliveryZone: string;
  /** Driving distance in miles (from a maps API in production) */
  miles?: number;
  pieces: { category: string; quantity: number }[];
  vehicleClass?: string;
  pickupLocationType?: string;
  deliveryLocationType?: string;
  tollsCents?: number;
  parkingCents?: number;
  waitingHours?: number;
  sameDay?: boolean;
  urgent?: boolean;
  afterHours?: boolean;
};

export type PriceLine = { label: string; cents: number };

export type PriceResult = {
  lines: PriceLine[];
  subtotalCents: number;
  retailCents: number;
  costCents: number;
  profitCents: number;
  markupPercent: number;
  marginPercent: number;
  /** true when guardrails could not be met → staff must review */
  manualReview: boolean;
  notes: string[];
};

export function zonePairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

export function priceLocal(input: LocalPriceInput, rules: LocalPricingRules = DEFAULT_LOCAL_RULES): PriceResult {
  const lines: PriceLine[] = [];
  const notes: string[] = [];

  // 1. Base transport charge: same zone → explicit zone pair → per-mile fallback
  const pairKey = zonePairKey(input.pickupZone, input.deliveryZone);
  if (input.pickupZone === input.deliveryZone) {
    lines.push({ label: `Local trip within ${input.pickupZone}`, cents: rules.sameZoneBase });
  } else if (rules.zonePairBase[pairKey] !== undefined) {
    lines.push({ label: `Zone route ${input.pickupZone} → ${input.deliveryZone}`, cents: rules.zonePairBase[pairKey] });
  } else {
    const miles = Math.max(input.miles ?? 0, rules.minimumMilesCharged);
    if (input.miles === undefined) notes.push("No distance supplied; minimum miles charged");
    lines.push({ label: `Distance ${miles} mi × $${(rules.perMile / 100).toFixed(2)}`, cents: cents(miles * rules.perMile) });
  }

  // 2. Per-piece handling
  for (const p of input.pieces) {
    const rate = rules.perPiece[p.category] ?? rules.perPiece["standard-checked"] ?? 0;
    if (p.quantity > 0) lines.push({ label: `${p.quantity} × ${p.category}`, cents: rate * p.quantity });
  }

  // 3. Vehicle & location surcharges, tolls, parking, waiting
  if (input.vehicleClass && rules.vehicleSurcharge[input.vehicleClass]) {
    lines.push({ label: `Vehicle: ${input.vehicleClass}`, cents: rules.vehicleSurcharge[input.vehicleClass] });
  }
  for (const [which, type] of [["Pickup", input.pickupLocationType], ["Delivery", input.deliveryLocationType]] as const) {
    if (type && rules.locationSurcharge[type]) lines.push({ label: `${which} at ${type}`, cents: rules.locationSurcharge[type] });
  }
  if (input.tollsCents) lines.push({ label: "Tolls", cents: input.tollsCents });
  if (input.parkingCents) lines.push({ label: "Parking / access fees", cents: input.parkingCents });
  if (input.waitingHours) lines.push({ label: `Waiting ${input.waitingHours} h`, cents: cents(input.waitingHours * rules.waitingPerHour) });

  let subtotal = lines.reduce((s, l) => s + l.cents, 0);

  // 4. Timing multipliers (only the strongest applies, plus after-hours)
  const timing = input.urgent ? rules.multipliers.urgent : input.sameDay ? rules.multipliers.sameDay : 1;
  if (timing > 1) {
    const add = cents(subtotal * (timing - 1));
    lines.push({ label: input.urgent ? "Urgent service" : "Same-day service", cents: add });
    subtotal += add;
  }
  if (input.afterHours && rules.multipliers.afterHours > 1) {
    const add = cents(subtotal * (rules.multipliers.afterHours - 1));
    lines.push({ label: "After-hours service", cents: add });
    subtotal += add;
  }

  // 5. Discounts
  const pieceCount = input.pieces.reduce((s, p) => s + p.quantity, 0);
  if (pieceCount >= rules.multiPieceDiscount.minPieces && rules.multiPieceDiscount.percent > 0) {
    const d = -cents(subtotal * (rules.multiPieceDiscount.percent / 100));
    lines.push({ label: `Multi-piece discount ${rules.multiPieceDiscount.percent}%`, cents: d });
    subtotal += d;
  }
  if (rules.promoPercent > 0) {
    const d = -cents(subtotal * (rules.promoPercent / 100));
    lines.push({ label: `Promotion ${rules.promoPercent}%`, cents: d });
    subtotal += d;
  }

  // 6. Guardrails: minimum charge and minimum profit
  let retail = subtotal;
  if (retail < rules.minimumCharge) {
    notes.push("Raised to minimum local service charge");
    lines.push({ label: "Minimum charge adjustment", cents: rules.minimumCharge - retail });
    retail = rules.minimumCharge;
  }
  const cost = cents(retail * (rules.estimatedCostPercent / 100));
  let manualReview = false;
  if (retail - cost < rules.minimumProfit) {
    manualReview = true;
    notes.push("Estimated profit is below the minimum profit rule; staff review required");
  }

  return { lines, subtotalCents: subtotal, ...profitMetrics(cost, retail), manualReview, notes };
}
