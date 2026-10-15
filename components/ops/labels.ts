import { airports, ports } from "@/content/site";

/** Shared operations labels & badge styles (orders, dispatch, exceptions, tracking). */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmed",
  DRIVER_ASSIGNED: "Driver assigned",
  EN_ROUTE: "En route",
  PICKED_UP: "Picked up",
  AT_FACILITY: "At facility / storage",
  TRANSFERRED_TO_CARRIER: "With carrier",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const ORDER_STATUS_STYLE: Record<string, string> = {
  CONFIRMED: "bg-orange-50 text-orange-700 ring-orange-200",
  DRIVER_ASSIGNED: "bg-navy-50 text-navy ring-navy-100",
  EN_ROUTE: "bg-sky-50 text-sky-800 ring-sky-200",
  PICKED_UP: "bg-sky-50 text-sky-800 ring-sky-200",
  AT_FACILITY: "bg-violet-50 text-violet-800 ring-violet-200",
  TRANSFERRED_TO_CARRIER: "bg-violet-50 text-violet-800 ring-violet-200",
  IN_TRANSIT: "bg-sky-50 text-sky-800 ring-sky-200",
  OUT_FOR_DELIVERY: "bg-amber-50 text-amber-800 ring-amber-200",
  DELIVERED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CANCELLED: "bg-cloud text-muted ring-line",
};

/** Allowed next statuses (mirrors ORDER_FLOW in src/server/services/orders.ts). */
export const NEXT_STATUSES: Record<string, string[]> = {
  CONFIRMED: ["DRIVER_ASSIGNED", "CANCELLED"],
  DRIVER_ASSIGNED: ["EN_ROUTE", "CONFIRMED", "CANCELLED"],
  EN_ROUTE: ["PICKED_UP", "DRIVER_ASSIGNED", "CANCELLED"],
  PICKED_UP: ["AT_FACILITY", "TRANSFERRED_TO_CARRIER", "OUT_FOR_DELIVERY", "IN_TRANSIT", "DELIVERED"],
  AT_FACILITY: ["TRANSFERRED_TO_CARRIER", "OUT_FOR_DELIVERY", "IN_TRANSIT", "DELIVERED"],
  TRANSFERRED_TO_CARRIER: ["IN_TRANSIT", "DELIVERED"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "AT_FACILITY", "DELIVERED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "AT_FACILITY"],
  DELIVERED: [],
  CANCELLED: [],
};

export const PRIORITY_STYLE: Record<string, string> = {
  NORMAL: "bg-white text-slate-ink !ring-line",
  RUSH: "bg-orange-600 text-white",
  VIP: "bg-navy text-white",
};

export const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: "bg-rose-600 text-white",
  HIGH: "bg-rose-50 text-rose-800 ring-rose-200",
  MEDIUM: "bg-amber-50 text-amber-800 ring-amber-200",
  LOW: "bg-cloud text-slate-ink ring-line",
};

export const EXCEPTION_LABEL: Record<string, string> = {
  LATE_PICKUP: "Late pickup",
  CARRIER_DELAY: "Carrier delay",
  ADDRESS_PROBLEM: "Address problem",
  PAYMENT_FAILURE: "Payment failure",
  DESTINATION_CHANGE: "Destination change",
  OVERSIZED_ITEM: "Oversized item",
  COUNT_MISMATCH: "Bag count mismatch",
  DELIVERY_FAILED: "Delivery failed",
  CAPACITY: "Capacity issue",
  DAMAGE: "Damage reported",
  OTHER: "Other",
};

export const PIECE_CATEGORY_LABEL: Record<string, string> = {
  "carry-on": "Carry-on",
  "standard-checked": "Checked",
  large: "Large",
  oversized: "Oversized",
  special: "Special item",
  cargo: "Cargo",
};

export const TIME_WINDOW_LABEL: Record<string, string> = {
  "early-morning": "Early morning (5–8 AM)",
  morning: "Morning (8 AM–12 PM)",
  midday: "Midday (11 AM–2 PM)",
  afternoon: "Afternoon (12–5 PM)",
  evening: "Evening (5–9 PM)",
  "after-hours": "After hours",
  flexible: "Flexible",
};

export type Stop = { type?: string; address?: string; facility?: string; market?: string; contact?: string; notes?: string };
/** Facility code (airport code / port slug) → readable name. */
export const facilityName = (code?: string) => {
  if (!code) return "";
  const a = airports.find((x) => x.code === code);
  if (a) return a.code;
  return ports.find((x) => x.slug === code)?.name ?? code;
};

/** One-line stop description; skips the facility when the address already names it. */
export const stopText = (s: unknown) => {
  const st = (s ?? {}) as Stop;
  const f = facilityName(st.facility);
  const addr = st.address ?? "";
  return (f && !addr.toLowerCase().includes(f.toLowerCase()) ? [f, addr] : [addr]).filter(Boolean).join(" · ") || "-";
};

export const shortDate = (iso: string | Date) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const timeOf = (iso: string | Date) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
