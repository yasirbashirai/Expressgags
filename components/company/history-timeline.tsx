"use client";

import { useState } from "react";
import { historyEras } from "@/content/site";

/**
 * Interactive editorial timeline 2010–2026. Era chips jump to a chapter;
 * the active chapter is expanded in a large feature panel, all chapters stay readable below.
 */
export function HistoryTimeline() {
  const [active, setActive] = useState(0);
  const era = historyEras[active];
  const isCovid = era.title.toLowerCase().includes("pandemic");

  return (
    <div>
      {/* Era selector */}
      <div role="tablist" aria-label="Company history eras" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:thin]">
        {historyEras.map((e, i) => (
          <button
            key={e.years + e.title}
            role="tab"
            type="button"
            id={`era-tab-${i}`}
            aria-selected={i === active}
            aria-controls="era-panel"
            onClick={() => setActive(i)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              i === active ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-navy/40"
            }`}
          >
            {e.years}
          </button>
        ))}
      </div>

      <div
        id="era-panel"
        role="tabpanel"
        aria-labelledby={`era-tab-${active}`}
        className={`relative mt-6 overflow-hidden rounded-[1.75rem] p-8 md:p-12 ${isCovid ? "bg-charcoal text-white" : "bg-navy text-white"}`}
      >
        <div aria-hidden className="absolute -right-24 -top-24 h-80 w-80 rounded-full border-[3px] border-orange/60" />
        <p className="font-display text-6xl font-extrabold text-orange md:text-8xl">{era.years}</p>
        <h3 className="mt-4 text-2xl font-bold text-white md:text-4xl">{era.title}</h3>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/80">{era.text}</p>
        <div className="mt-8 flex gap-3">
          <button type="button" className="btn-ghost-light !py-2" disabled={active === 0} onClick={() => setActive((a) => Math.max(0, a - 1))}>
            Previous
          </button>
          <button type="button" className="btn-primary !py-2" disabled={active === historyEras.length - 1} onClick={() => setActive((a) => Math.min(historyEras.length - 1, a + 1))}>
            Next chapter
          </button>
        </div>
      </div>

      {/* Full chronological list (always visible, good for reading and SEO) */}
      <ol className="relative mt-16 border-l-2 border-dashed border-orange/50 pl-8 md:ml-32">
        {historyEras.map((e, i) => (
          <li key={e.years + e.title} className="relative pb-10 last:pb-0">
            <span aria-hidden className={`absolute -left-[2.6rem] top-1.5 h-4 w-4 rounded-full border-4 border-white shadow ${i === active ? "bg-navy" : "bg-orange"}`} />
            <p className="font-display text-sm font-bold text-orange-700 md:absolute md:-left-44 md:top-1 md:w-28 md:text-right">{e.years}</p>
            <h3 className="text-xl font-bold">{e.title}</h3>
            <p className="mt-2 max-w-2xl leading-relaxed text-slate-ink">{e.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
