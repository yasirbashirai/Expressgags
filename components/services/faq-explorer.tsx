"use client";

/**
 * Searchable, categorized FAQ accordion. Search matches question and answer text; categories are
 * chips; every answer stays in the DOM for find-in-page (hidden ones use the hidden attribute).
 */
import { useId, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

export type FaqItem = { q: string; a: string; category: string };

export function FaqExplorer({ items, categories }: { items: FaqItem[]; categories: string[] }) {
  const uid = useId();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("All");
  const [open, setOpen] = useState<number | null>(0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.map((it) => (cat === "All" || it.category === cat) && (!q || `${it.q} ${it.a}`.toLowerCase().includes(q)));
  }, [items, query, cat]);
  const count = visible.filter(Boolean).length;

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor={`${uid}-q`} className="sr-only">Search frequently asked questions</label>
          <input id={`${uid}-q`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions, e.g. storage, cruise, oversized"
            className="w-full rounded-full border border-line bg-white py-3.5 pl-11 pr-11 text-sm shadow-[var(--shadow-card)] outline-none focus:border-navy focus:ring-2 focus:ring-navy/15" />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted hover:bg-cloud"><X className="h-4 w-4" /></button>
          )}
        </div>
        <p className="text-sm text-muted" aria-live="polite">{count} {count === 1 ? "answer" : "answers"}</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter by topic">
        {["All", ...categories].map((c) => (
          <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${cat === c ? "bg-navy text-white" : "border border-line bg-white text-slate-ink hover:border-navy/40"}`}>
            {c}
          </button>
        ))}
      </div>

      <ul className="mt-8 space-y-3">
        {items.map((f, i) => {
          const isOpen = open === i;
          return (
            <li key={f.q} hidden={!visible[i]}>
              <div className={`overflow-hidden rounded-[1.25rem] border bg-white transition-shadow ${isOpen ? "border-orange/40 shadow-[var(--shadow-card)]" : "border-line"}`}>
                <h2>
                  <button type="button" aria-expanded={isOpen} aria-controls={`${uid}-a${i}`} id={`${uid}-h${i}`} onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left">
                    <span>
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-700">{f.category}</span>
                      <span className="mt-1 block font-display text-lg font-semibold text-navy">{f.q}</span>
                    </span>
                    <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg transition ${isOpen ? "rotate-45 bg-orange-600 text-white" : "bg-navy-50 text-navy"}`}>+</span>
                  </button>
                </h2>
                <div id={`${uid}-a${i}`} role="region" aria-labelledby={`${uid}-h${i}`} hidden={!isOpen} className="px-6 pb-6 leading-relaxed text-slate-ink">
                  {f.a}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {count === 0 && (
        <p className="mt-8 rounded-2xl bg-cloud p-6 text-slate-ink">No answer matches yet. Ask us directly on the contact page or start a quote request and dispatch will answer for your exact route.</p>
      )}
    </div>
  );
}
