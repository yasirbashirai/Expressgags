/**
 * Money helpers shared by quotations, invoices, payments and reports.
 * All amounts are integer US cents. Internal economics (cost, profit, markup, margin) are computed
 * here and must only ever be returned by admin APIs — never by public/customer endpoints.
 */
import { prisma } from "../../db";
import { env } from "../../lib/env";

export const LINE_KINDS = [
  "transport",
  "truck",
  "driver",
  "helper",
  "mileage",
  "waiting",
  "storage",
  "handling",
  "equipment",
  "coordination",
  "protection",
  "discount",
  "other",
] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export type LineInput = {
  kind: LineKind;
  description: string;
  quantity: number;
  unit?: string | null;
  unitCents: number;
  unitCostCents?: number | null;
};

/** Round to whole cents (half away from zero). */
export const toCents = (n: number) => Math.round(n);

/** Line total: quantity × unit price. Discount lines are always negative. */
export function lineTotal(l: Pick<LineInput, "kind" | "quantity" | "unitCents">) {
  const t = toCents(l.quantity * l.unitCents);
  return l.kind === "discount" ? -Math.abs(t) : t;
}

export type QuotationMath = {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  costCents: number;
  profitCents: number;
  /** profit ÷ cost */
  markupPercent: number;
  /** profit ÷ price (gross margin) */
  marginPercent: number;
  depositCents: number;
};

const pct1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Totals and internal economics for a set of lines.
 * Carlos's example: cost $100 with a 40% markup sells at $140 → 28.6% gross margin;
 * a true 40% gross margin on $100 cost needs $166.67.
 */
export function quotationMath(lines: LineInput[], deposit: { type: "none" | "percent" | "flat"; value: number } = { type: "none", value: 0 }): QuotationMath {
  let subtotal = 0;
  let discount = 0;
  let cost = 0;
  for (const l of lines) {
    const t = lineTotal(l);
    if (t < 0) discount += -t;
    else subtotal += t;
    if (l.unitCostCents != null && l.kind !== "discount") cost += toCents(l.quantity * l.unitCostCents);
  }
  const total = Math.max(0, subtotal - discount);
  const profit = total - cost;
  let depositCents = 0;
  if (deposit.type === "percent") depositCents = toCents((total * Math.min(100, Math.max(0, deposit.value))) / 100);
  if (deposit.type === "flat") depositCents = Math.min(total, toCents(Math.max(0, deposit.value)));
  return {
    subtotalCents: subtotal,
    discountCents: discount,
    totalCents: total,
    costCents: cost,
    profitCents: profit,
    markupPercent: cost > 0 ? pct1((profit / cost) * 100) : 0,
    marginPercent: total > 0 ? pct1((profit / total) * 100) : 0,
    depositCents,
  };
}

/** Selling price from cost with a markup % (cost × (1 + m)). */
export const priceFromMarkup = (costCents: number, markupPercent: number) => toCents(costCents * (1 + markupPercent / 100));
/** Selling price from cost with a true gross margin % (cost ÷ (1 − g)). */
export const priceFromMargin = (costCents: number, marginPercent: number) => {
  if (marginPercent >= 100) throw new Error("Gross margin must be below 100%.");
  return toCents(costCents / (1 - marginPercent / 100));
};

/** Public website base URL for links in emails (quotation, invoice, checkout). */
export function webUrl(path = "") {
  const base = (process.env.PUBLIC_WEB_URL || process.env.NEXT_PUBLIC_SITE_URL || env.webOrigins[0] || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

/** Atomic counter (race-safe under concurrency). */
export async function nextSequence(name: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ value: number }[]>`
    INSERT INTO "MoneySequence" ("name", "value") VALUES (${name}, 1)
    ON CONFLICT ("name") DO UPDATE SET "value" = "MoneySequence"."value" + 1
    RETURNING "value"`;
  return Number(rows[0].value);
}

export const invoiceNumber = (n: number) => `EB-INV-${String(n).padStart(6, "0")}`;

/** Keys that must never appear in a customer-facing response. */
export const INTERNAL_KEYS = ["costCents", "unitCostCents", "marginPct", "marginPercent", "markupPercent", "profitCents", "pricingBreakdown"] as const;

/** Deep-strip internal economics from any object before it leaves a public endpoint (defense in depth). */
export function stripInternal<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripInternal) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if ((INTERNAL_KEYS as readonly string[]).includes(k)) continue;
      out[k] = stripInternal(v);
    }
    return out as T;
  }
  return value;
}

export const fmtUsd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
