import type { Metadata } from "next";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { JsonLd } from "@/components/ui/json-ld";
import { exclusions, faqs } from "@/content/site";
import { faqSchema, pageMeta } from "@/lib/seo";
import { FaqExplorer } from "@/components/services/faq-explorer";

/** Topic for each FAQ (same order as faqs in site.ts). */
const CATEGORY = ["Coverage & timing", "Pricing", "Coverage & timing", "Airports & ports", "Groups & special items", "Storage", "Proof & privacy", "Proof & privacy", "Groups & special items", "Changes & claims", "Changes & claims"];
const CATEGORIES = [...new Set(CATEGORY)];

export const metadata: Metadata = pageMeta({
  title: "FAQ | Luggage Delivery, Storage, Courier & Box-Truck Questions",
  description: "Answers about where Express Bags operates, pricing, same-day service, airports and cruise ports, large groups, storage, proof of delivery, special items and schedule changes.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <>
      <PageHero
        eyebrow="FAQ"
        title="Frequently asked questions."
        lead="Short, honest answers. If your question depends on a specific route, date or item, a quote request gets you an exact answer from dispatch."
        crumbs={[{ name: "Home", path: "/" }, { name: "FAQ", path: "/faq" }]}
      />
      <Section>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <FaqExplorer items={faqs.map((f, i) => ({ ...f, category: CATEGORY[i] ?? "General" }))} categories={CATEGORIES} />
          </div>
          <aside className="lg:col-span-4">
            <div className="rounded-[var(--radius-card)] bg-sand p-7 lg:sticky lg:top-32">
              <h2 className="text-lg font-bold">What we do not accept</h2>
              <ul className="mt-4 space-y-2 text-sm text-slate-ink">
                {exclusions.map((x) => (<li key={x} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />{x}</li>))}
              </ul>
              <p className="mt-4 text-xs text-muted">Restricted, fragile, high-value, oversized or unusual items need advance review and written acceptance.</p>
            </div>
          </aside>
        </div>
      </Section>
      <JsonLd data={faqSchema(faqs)} />
      <CtaBand />
    </>
  );
}
