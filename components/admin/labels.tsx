import { markets } from "@/content/site";
import { SERVICE_LABELS, type ServiceType } from "@/lib/quote-schema";

export const serviceLabel = (s: string) => SERVICE_LABELS[s as ServiceType] ?? s;

export const marketLabel = (slug: string) =>
  slug === "other-florida" ? "Other Florida route" : slug === "outside-florida" ? "Outside Florida" : markets.find((m) => m.slug === slug)?.name ?? slug;

export const ROUTE_LABEL = { CUSTOM_QUOTE: "Custom quote", STANDARD_QUOTE: "Standard", SPECIAL_ROUTE: "Special route" } as const;

export const STATUS_STYLE: Record<string, string> = {
  NEW: "bg-orange-50 text-orange-700 ring-orange-200",
  REVIEWING: "bg-navy-50 text-navy ring-navy-100",
  QUOTED: "bg-sky-50 text-sky-800 ring-sky-200",
  WON: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  LOST: "bg-rose-50 text-rose-800 ring-rose-200",
  ARCHIVED: "bg-cloud text-muted ring-line",
  REVIEWED: "bg-navy-50 text-navy ring-navy-100",
};

export const ROUTE_STYLE: Record<string, string> = {
  CUSTOM_QUOTE: "bg-navy text-white",
  STANDARD_QUOTE: "bg-white text-slate-ink !ring-line",
  SPECIAL_ROUTE: "bg-orange-100 text-orange-700",
};

export function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ring-transparent ${className}`}>{children}</span>;
}
