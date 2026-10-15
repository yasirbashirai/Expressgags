"use client";

/**
 * Optional protection plan picker (review step). Rendered only while the protection module is live
 * (GET /v1/protection/plans returns 200). Wording is always "protection", never "insurance".
 */
import { ShieldCheck } from "lucide-react";
import type { Lang } from "@/content/i18n/quote";
import { useQuoteT } from "./i18n";
import type { ProtectionPlans } from "./wizard-extras";

export type { ProtectionPlans } from "./wizard-extras";

const usd = (cents: number, lang: Lang) => (cents / 100).toLocaleString(lang === "es" ? "es-US" : "en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 });

export function protectionLabel(plans: ProtectionPlans, code: string, lang: Lang) {
  const tier = plans.tiers.find((x) => x.code === code);
  if (!tier) return "";
  return `${plans.displayName} ${tier.name} · ${usd(tier.priceCents, lang)}`;
}

export function ProtectionPicker({ plans, value, onChange }: { plans: ProtectionPlans; value: "" | "basic" | "plus" | "vip"; onChange: (v: "" | "basic" | "plus" | "vip") => void }) {
  const { t, lang } = useQuoteT();
  const options: { code: "" | "basic" | "plus" | "vip"; title: string; sub: string; benefits: string[] }[] = [
    { code: "", title: t.protectionNone, sub: "", benefits: [] },
    ...plans.tiers.map((tier) => ({ code: tier.code, title: `${tier.name} · ${usd(tier.priceCents, lang)}`, sub: t.protectionUpTo(usd(tier.maxBenefitCents, lang)), benefits: tier.benefits })),
  ];
  return (
    <fieldset className="rounded-2xl border border-line bg-cloud/60 p-4 sm:p-6" data-testid="protection-picker">
      <legend className="sr-only">{t.protectionTitle}</legend>
      <p className="flex items-center gap-2 text-base font-bold text-navy"><ShieldCheck className="h-5 w-5 text-orange" aria-hidden /> {t.protectionTitle}</p>
      <p className="mt-1 text-sm text-muted">{t.protectionText}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const active = value === o.code;
          return (
            <label key={o.code || "none"} className={`flex min-h-12 cursor-pointer gap-3 rounded-xl border px-4 py-3 text-sm transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-orange/40 ${active ? "border-navy bg-navy text-white" : "border-line bg-white hover:border-navy/30"}`}>
              <input type="radio" name="protectionTier" value={o.code} checked={active} onChange={() => onChange(o.code)} className="sr-only" />
              <span aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${active ? "border-white bg-orange shadow-[inset_0_0_0_3px_var(--color-navy)]" : "border-navy/30"}`} />
              <span>
                <span className="block font-semibold">{o.title}</span>
                {o.sub && <span className={`block text-xs ${active ? "text-white/75" : "text-muted"}`}>{o.sub}</span>}
                {o.benefits.length > 0 && <span className={`mt-1 block text-xs ${active ? "text-white/75" : "text-muted"}`}>{o.benefits.join(" · ")}</span>}
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted">
        {t.protectionPerOrder}
        {plans.termsUrl && (
          <>
            {" "}
            <a href={plans.termsUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-700 underline">{t.protectionTerms}</a>
          </>
        )}
      </p>
    </fieldset>
  );
}
