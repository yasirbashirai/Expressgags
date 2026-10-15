import { JsonLd } from "@/components/ui/json-ld";
import { faqSchema } from "@/lib/seo";

/** Accessible FAQ accordion (native <details>) with FAQPage schema. */
export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  if (!items.length) return null;
  return (
    <>
      <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
        {items.map((f) => (
          <details key={f.q} className="group p-5 open:bg-navy-50/50 md:p-6">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-display text-lg font-semibold text-navy">
              {f.q}
              <span aria-hidden className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-navy/20 text-sm transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 leading-relaxed text-slate-ink">{f.a}</p>
          </details>
        ))}
      </div>
      <JsonLd data={faqSchema(items)} />
    </>
  );
}
