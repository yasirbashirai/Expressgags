import { markets } from "@/content/site";

/** Market select options for portal forms (8 priority markets + special routes). */
export const MARKET_LABELS: Record<string, string> = {
  ...Object.fromEntries(markets.map((m) => [m.slug, m.name])),
  "other-florida": "Other Florida route (special quote)",
};
