/**
 * Typed configuration for the platform engines.
 *
 * Every commercial rule is editable by Express Bags from the admin panel (stored in the
 * Setting / PricingRuleSet tables). The values below are SAFE PLACEHOLDER DEFAULTS only,
 * so the engines and tests can run. They are not Express Bags' real prices: Carlos must
 * enter and approve real rates before `pricingEnabled` is ever switched on.
 */

export type CentsRule = number; // all money is integer US cents

/* ----------------------------- Decision engine ---------------------------- */

export type DecisionThresholds = {
  /** Above this many total pieces → custom quotation */
  maxAutoPieces: number;
  /** Above this many extra stops → custom quotation */
  maxAutoExtraStops: number;
  /** Above this many travelers → custom quotation */
  maxAutoTravelers: number;
  /** Any single item heavier than this (lbs) → custom quotation */
  maxAutoItemWeightLbs: number;
  /** Any single item with length+girth over this (inches) → custom quotation */
  maxAutoItemLengthGirthIn: number;
  /** More oversized/special pieces than this → custom quotation */
  maxAutoOversizedPieces: number;
  /** Service types that always need a planned, manual quotation */
  alwaysCustomServices: string[];
};

export const DEFAULT_THRESHOLDS: DecisionThresholds = {
  maxAutoPieces: 20,
  maxAutoExtraStops: 2,
  maxAutoTravelers: 15,
  maxAutoItemWeightLbs: 100,
  maxAutoItemLengthGirthIn: 130,
  maxAutoOversizedPieces: 4,
  alwaysCustomServices: ["group-event", "truck"],
};

/* ------------------------------ Local pricing ----------------------------- */

export type LocalPricingRules = {
  /** Base trip charge when both ends are in the same zone */
  sameZoneBase: CentsRule;
  /** Explicit zone-pair prices, key "ZONE_A|ZONE_B" (order-insensitive) */
  zonePairBase: Record<string, CentsRule>;
  /** Fallback when no zone-pair price exists */
  perMile: CentsRule;
  minimumMilesCharged: number;
  /** Per-piece charge by luggage category */
  perPiece: Record<string, CentsRule>;
  /** Additional charge by vehicle class code */
  vehicleSurcharge: Record<string, CentsRule>;
  /** Additional charge by pickup/delivery location type (airport, cruise-port, …) */
  locationSurcharge: Record<string, CentsRule>;
  waitingPerHour: CentsRule;
  /** Multipliers applied to the subtotal */
  multipliers: { sameDay: number; urgent: number; afterHours: number };
  /** Estimated direct operating cost as % of retail (labor, fuel, vehicle) for profit guardrails */
  estimatedCostPercent: number;
  minimumCharge: CentsRule;
  minimumProfit: CentsRule;
  /** Multi-piece discount: percentage off when pieces >= threshold */
  multiPieceDiscount: { minPieces: number; percent: number };
  promoPercent: number;
};

export const DEFAULT_LOCAL_RULES: LocalPricingRules = {
  sameZoneBase: 7500,
  zonePairBase: {},
  perMile: 350,
  minimumMilesCharged: 10,
  perPiece: { "carry-on": 1000, "standard-checked": 1500, large: 2000, oversized: 3500, special: 4500, cargo: 2500 },
  vehicleSurcharge: { "cargo-van": 0, "box-15": 7500, "box-20": 12500, "box-26": 20000 },
  locationSurcharge: { airport: 1500, "cruise-port": 2000, "private-aviation": 2500 },
  waitingPerHour: 4500,
  multipliers: { sameDay: 1.25, urgent: 1.5, afterHours: 1.2 },
  estimatedCostPercent: 55,
  minimumCharge: 8500,
  minimumProfit: 3000,
  multiPieceDiscount: { minPieces: 6, percent: 5 },
  promoPercent: 0,
};

/* ----------------------------- Carrier pricing ---------------------------- */

export type ServiceLevelCode = "economy" | "standard" | "priority" | "express" | "next-day";

export type ServiceLevelDef = { code: ServiceLevelCode; name: string; maxTransitDays: number; minTransitDays?: number };

export const SERVICE_LEVELS: ServiceLevelDef[] = [
  { code: "economy", name: "Economy", minTransitDays: 5, maxTransitDays: 7 },
  { code: "standard", name: "Standard", maxTransitDays: 4 },
  { code: "priority", name: "Priority", maxTransitDays: 3 },
  { code: "express", name: "Express", maxTransitDays: 2 },
  { code: "next-day", name: "Next Day", maxTransitDays: 1 },
];

export type MarginMode = "markup" | "margin";

export type CarrierPricingRules = {
  mode: MarginMode;
  /** % applied according to `mode` */
  defaultPercent: number;
  percentByCarrier: Record<string, number>;
  percentByServiceLevel: Partial<Record<ServiceLevelCode, number>>;
  /** Percentage adjustment by destination zone/region code */
  zoneAdjustPercent: Record<string, number>;
  handlingFee: CentsRule;
  pickupFee: CentsRule;
  oversizeFeePerPiece: CentsRule;
  overweightFeePerPiece: CentsRule;
  multiPieceDiscount: { minPieces: number; percent: number };
  promoPercent: number;
  /** Reserve / backup % added on top (exact value set by Express Bags) */
  reservePercent: number;
  minimumPrice: CentsRule;
  minimumProfitPerPiece: CentsRule;
  /** When true, a price below the floor is raised to the floor; when false → manual review */
  raiseToFloor: boolean;
  disabledCarriers: string[];
  /** carrier → service levels it may NOT be used for */
  prohibitedCarrierLevels: Record<string, ServiceLevelCode[]>;
  /** Preferred carrier wins if within this % of the cheapest qualifying rate */
  preferredCarrier?: string;
  preferenceTolerancePercent: number;
  showCarrierNameBeforeCheckout: boolean;
};

export const DEFAULT_CARRIER_RULES: CarrierPricingRules = {
  mode: "markup",
  defaultPercent: 40,
  percentByCarrier: {},
  percentByServiceLevel: {},
  zoneAdjustPercent: {},
  handlingFee: 1500,
  pickupFee: 2500,
  oversizeFeePerPiece: 2500,
  overweightFeePerPiece: 2500,
  multiPieceDiscount: { minPieces: 3, percent: 5 },
  promoPercent: 0,
  reservePercent: 0,
  minimumPrice: 9900,
  minimumProfitPerPiece: 2000,
  raiseToFloor: true,
  disabledCarriers: [],
  prohibitedCarrierLevels: {},
  preferenceTolerancePercent: 0,
  showCarrierNameBeforeCheckout: false,
};

/* ----------------------------- Storage pricing ---------------------------- */

export type StoragePricingRules = {
  /** Charging structure Express Bags chooses */
  structure: "hourly" | "daily";
  perPiecePerHour: CentsRule;
  perPiecePerDay: CentsRule;
  /** Hours that count as one "day" once exceeded in hourly mode */
  dayCapHours: number;
  minimumCharge: CentsRule;
  oversizedPerPiece: CentsRule;
  multiPieceDiscount: { minPieces: number; percent: number };
  /** Discount once storage is this many days or more */
  multiDayDiscount: { minDays: number; percent: number };
  pickupFee: CentsRule;
  deliveryFee: CentsRule;
  afterHoursFee: CentsRule;
  /** Overstay charged per piece per day after the booked end */
  overstayPerPiecePerDay: CentsRule;
  reservePercent: number;
  promoPercent: number;
  estimatedCostPercent: number;
  minimumProfit: CentsRule;
};

export const DEFAULT_STORAGE_RULES: StoragePricingRules = {
  structure: "daily",
  perPiecePerHour: 300,
  perPiecePerDay: 1500,
  dayCapHours: 8,
  minimumCharge: 2000,
  oversizedPerPiece: 1000,
  multiPieceDiscount: { minPieces: 5, percent: 10 },
  multiDayDiscount: { minDays: 3, percent: 10 },
  pickupFee: 4500,
  deliveryFee: 4500,
  afterHoursFee: 2500,
  overstayPerPiecePerDay: 2000,
  reservePercent: 0,
  promoPercent: 0,
  estimatedCostPercent: 40,
  minimumProfit: 1000,
};

/* ------------------------------ Shared helpers ---------------------------- */

/** Round to whole cents. */
export const cents = (n: number) => Math.round(n);

/** Profit metrics shown internally only: cost, retail, profit $, markup %, gross margin %. */
export function profitMetrics(costCents: number, retailCents: number) {
  const profit = retailCents - costCents;
  return {
    costCents,
    retailCents,
    profitCents: profit,
    markupPercent: costCents > 0 ? round1((profit / costCents) * 100) : 0,
    marginPercent: retailCents > 0 ? round1((profit / retailCents) * 100) : 0,
  };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;
