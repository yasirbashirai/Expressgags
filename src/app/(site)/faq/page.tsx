import type { Metadata } from "next";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { JsonLd } from "@/components/ui/json-ld";
import { exclusions, faqs } from "@/content/site";
import { faqSchema, pageMeta } from "@/lib/seo";

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
          <div className="space-y-3 lg:col-span-8">
            {faqs.map((f, i) => (
              <details key={f.q} className="group card p-0 [&_summary::-webkit-details-marker]:hidden" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 p-6">
                  <h2 className="text-lg font-semibold">{f.q}</h2>
                  <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy transition group-open:rotate-45">+</span>
                </summary>
                <p className="px-6 pb-6 leading-relaxed text-slate-ink">{f.a}</p>
              </details>
            ))}
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
