/** Carrier shipping labels & badge styles shared by the shipments admin screens. */
export const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  CREATED: "Created",
  LABELED: "Label ready",
  TENDERED: "Handed to carrier",
  IN_TRANSIT: "In transit",
  DELIVERED: "Delivered",
  EXCEPTION: "Carrier exception",
  VOIDED: "Voided",
};

export const SHIPMENT_STATUS_STYLE: Record<string, string> = {
  CREATED: "bg-cloud text-muted ring-line",
  LABELED: "bg-orange-50 text-orange-700 ring-orange-200",
  TENDERED: "bg-violet-50 text-violet-800 ring-violet-200",
  IN_TRANSIT: "bg-sky-50 text-sky-800 ring-sky-200",
  DELIVERED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  EXCEPTION: "bg-rose-50 text-rose-800 ring-rose-200",
  VOIDED: "bg-cloud text-muted ring-line line-through",
};

export const LEVEL_LABEL: Record<string, string> = {
  economy: "Economy",
  standard: "Standard",
  priority: "Priority",
  express: "Express",
  "next-day": "Next Day",
};

export const CATEGORY_LABEL: Record<string, string> = {
  "carry-on": "Carry-on",
  "standard-checked": "Standard checked",
  large: "Large",
  oversized: "Oversized",
  special: "Special item",
  cargo: "Cargo",
};

export const pct = (n: number | null | undefined) => (n == null ? "-" : `${Math.round(n * 10) / 10}%`);
