"use client";

/**
 * Shared helpers for the Team / Fleet / Credentials / Users admin screens: labels, expiry badges,
 * date formatting, file links and a small hook for loading API data.
 */
import { useCallback, useEffect, useState } from "react";
import { markets } from "@/content/site";
import { api, API_URL } from "@/components/admin/api";
import { Badge } from "@/components/admin/labels";

export const ROLE_LABEL: Record<string, string> = { DRIVER: "Driver", HELPER: "Helper", DISPATCH: "Dispatch", OFFICE: "Office", MANAGEMENT: "Management" };
export const EMP_STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", INACTIVE: "Inactive", ON_LEAVE: "On leave" };
export const VEHICLE_CLASS_LABEL: Record<string, string> = { "cargo-van": "Cargo van", "box-15": "15-ft box truck", "box-20": "20-ft box truck", "box-26": "26-ft box truck" };
export const VEHICLE_STATUS_LABEL: Record<string, string> = { AVAILABLE: "Available", IN_SERVICE: "In service", MAINTENANCE: "Maintenance", OUT_OF_SERVICE: "Out of service" };
export const CREDENTIAL_TYPE_LABEL: Record<string, string> = {
  TWIC: "TWIC card", AIRPORT_BADGE: "Airport badge", PORT_PASS: "Port pass", VEHICLE_PERMIT: "Vehicle permit",
  INSURANCE_COI: "Insurance certificate (COI)", DOT: "USDOT registration", MC: "MC authority", BONDING: "Bonding", OTHER: "Other",
};
export const STAFF_ROLE_LABEL: Record<string, string> = { OWNER: "Owner", STAFF: "Office staff", DISPATCHER: "Dispatcher", DRIVER: "Driver (app only)", ACCOUNTING: "Accounting" };

/** Facilities for credentials: company + airports + ports from the site facts. */
export const FACILITY_OPTIONS = [
  { value: "company", label: "Company-level" },
  ...["MIA", "FLL", "EYW", "PBI", "MCO", "TPA", "RSW"].map((c) => ({ value: c, label: `${c} airport` })),
  { value: "portmiami", label: "PortMiami" },
  { value: "port-everglades", label: "Port Everglades" },
  { value: "port-of-key-west", label: "Port of Key West" },
  { value: "port-of-palm-beach", label: "Port of Palm Beach" },
  { value: "port-canaveral", label: "Port Canaveral" },
  { value: "port-tampa-bay", label: "Port Tampa Bay" },
  { value: "private-aviation", label: "Private aviation terminals" },
];
export const facilityLabel = (v: string) => FACILITY_OPTIONS.find((f) => f.value === v)?.label ?? v;
export const MARKET_OPTIONS = markets.map((m) => ({ value: m.slug, label: m.name }));
export const marketName = (slug?: string | null) => (slug ? markets.find((m) => m.slug === slug)?.name ?? slug : "-");

export const shortDate = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "-";
export const isoDay = (d?: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
export const daysUntil = (d?: string | Date | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000) : null);

/** Red when expired, orange within 30 days, amber within 60, otherwise plain date. */
export function ExpiryBadge({ date, label }: { date?: string | Date | null; label?: string }) {
  const days = daysUntil(date);
  if (days === null) return <span className="text-muted">-</span>;
  const text = `${label ? `${label} ` : ""}${shortDate(date)}`;
  if (days < 0) return <Badge className="bg-rose-50 text-rose-800 ring-rose-200">Expired {text}</Badge>;
  if (days <= 30) return <Badge className="bg-orange-50 text-orange-700 ring-orange-200">{days}d · {text}</Badge>;
  if (days <= 60) return <Badge className="bg-amber-50 text-amber-800 ring-amber-200">{days}d · {text}</Badge>;
  return <span className="text-sm text-slate-ink">{text}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const style: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    AVAILABLE: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    IN_SERVICE: "bg-navy-50 text-navy ring-navy-100",
    ON_LEAVE: "bg-amber-50 text-amber-800 ring-amber-200",
    MAINTENANCE: "bg-orange-50 text-orange-700 ring-orange-200",
    INACTIVE: "bg-cloud text-muted ring-line",
    OUT_OF_SERVICE: "bg-rose-50 text-rose-800 ring-rose-200",
    SCHEDULED: "bg-navy-50 text-navy ring-navy-100",
    COMPLETED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    CANCELLED: "bg-cloud text-muted ring-line",
  };
  const label = EMP_STATUS_LABEL[status] ?? VEHICLE_STATUS_LABEL[status] ?? status.charAt(0) + status.slice(1).toLowerCase();
  return <Badge className={style[status] ?? "bg-cloud text-slate-ink ring-line"}>{label}</Badge>;
}

/** Private file URL (served only to signed-in staff). */
export const fileUrl = (module: "team" | "fleet", uploadId: string, inline = false) => `${API_URL}/v1/admin/${module}/files/${uploadId}${inline ? "?inline=1" : ""}`;

/** Loads JSON from the admin API with reload support. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setError(null);
    api<T>(path)
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, reload, setData };
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{message}</p>;
}

export const selectCls = "rounded-xl border border-line bg-white px-3 py-2 text-sm text-slate-ink focus:border-navy focus:outline-none";

export { BUSINESS_TZ, fromZonedInput, zonedInput, zonedParts, zonedTime, zonedToUtc } from "./business-time";
