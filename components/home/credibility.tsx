import Link from "next/link";
import { ArrowRight, ArrowUpRight, Plane, Ship } from "lucide-react";
import { airports, company, industries, markets, notableProjects, ports } from "@/content/site";
import { Reveal } from "@/components/motion/reveal";

/**
 * Credibility band: operating history in numbers, project categories (generic wording only, never
 * named end-clients without written permission) and an auto-scrolling industries ribbon.
 */
export function Credibility() {
  const facts = [
    { n: String(company.founded), l: "Operating in Florida since", sub: "An established operator, not a startup" },
    { n: "1,400+", l: "Passengers in one corporate program", sub: "Four-figure group logistics from the first years" },
    { n: "197", l: "People in one music-cruise program", sub: "Dedicated artist, guest and gear trucks" },
    { n: "26 ft", l: "Largest box truck class", sub: "From a cargo van to multi-truck movements" },
  ];
  const SHOWCASE = ["rbc-groups", "u2", "nba", "royal-family", "themed-cruises", "pallet"];
  const projects = SHOWCASE.map((id) => notableProjects.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <section className="relative overflow-hidden bg-sand py-20 md:py-28" aria-labelledby="cred-title">
      <div className="container-eb">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="eyebrow">Since {company.founded}</p>
            <h2 id="cred-title" className="mt-3 text-3xl font-bold md:text-5xl">Proven in one of the country&apos;s most demanding travel markets.</h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-ink">
              Corporate charters, professional sports, touring productions, themed cruises and VIP movements through private aviation terminals. Our new platform digitizes capability already proven in the field.
            </p>
            <Link href="/our-history" className="btn-navy mt-8">Read our history <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
            {facts.map((f, i) => (
              <Reveal as="li" key={f.l} delay={i * 90} className={`rounded-[1.5rem] p-6 ${i === 0 ? "bg-navy text-white" : "bg-white shadow-[var(--shadow-card)]"}`}>
                <p className={`font-display text-5xl font-extrabold tracking-tight ${i === 0 ? "text-orange" : "text-navy"}`}>{f.n}</p>
                <p className={`mt-2 text-sm font-semibold ${i === 0 ? "text-white/80" : "text-navy"}`}>{f.l}</p>
                <p className={`mt-1 text-sm ${i === 0 ? "text-white/60" : "text-muted"}`}>{f.sub}</p>
              </Reveal>
            ))}
          </ul>
        </div>

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p, i) => (
            <Reveal as="li" key={p.id} delay={i * 70} className="group rounded-[1.25rem] border border-navy/10 bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">{p.type} · {p.period}</p>
              <h3 className="mt-2 text-lg font-bold">{p.genericTitle}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-ink">{p.summary}</p>
            </Reveal>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">Project categories are described generically. Client and partner names are shown only with written permission.</p>
      </div>

      {/* Industries ribbon */}
      <div className="relative mt-16 overflow-hidden border-y border-navy/10 bg-white py-5" aria-label="Industries we serve">
        <div className="flex w-max gap-10 [animation:eb-marquee_42s_linear_infinite] motion-reduce:[animation:none] hover:[animation-play-state:paused]">
          {[...industries, ...industries].map((it, i) => (
            <span key={`${it.name}-${i}`} aria-hidden={i >= industries.length} className="flex items-center gap-3 whitespace-nowrap font-display text-lg font-bold text-navy">
              <span className="h-2 w-2 rounded-full bg-orange" /> {it.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Compact market grid (the hero already carries the animated map). */
export function MarketsGrid() {
  const tierLabel = { top: "Top priority", next: "Next priority", additional: "Additional focus" } as const;
  return (
    <section className="bg-white py-20 md:py-28" aria-labelledby="markets-title">
      <div className="container-eb">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <header className="max-w-2xl">
            <p className="eyebrow">Where we operate</p>
            <h2 id="markets-title" className="mt-3 text-3xl font-bold md:text-5xl">Miami headquarters. Eight Florida markets.</h2>
            <p className="mt-4 text-lg text-slate-ink">Local and intercity routes between hotels, airports, cruise ports, venues and businesses. Other Florida routes by special quotation.</p>
          </header>
          <Link href="/service-areas" className="btn-ghost shrink-0">All service areas <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {markets.map((m, i) => {
            const mA = airports.filter((a) => m.airports.includes(a.code));
            const mP = ports.filter((p) => m.ports.includes(p.slug));
            return (
              <Reveal as="li" key={m.slug} delay={(i % 4) * 70}>
                <Link
                  href={`/service-areas/${m.slug}`}
                  className={`group flex h-full flex-col rounded-[1.5rem] border p-6 transition hover:-translate-y-1 hover:shadow-[var(--shadow-lift)] ${m.hq ? "border-navy bg-navy text-white" : "border-line bg-white"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${m.hq ? "text-orange-100" : "text-orange-700"}`}>{m.hq ? "Headquarters" : tierLabel[m.tier]}</p>
                    <ArrowUpRight className={`h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${m.hq ? "text-white/70" : "text-muted"}`} aria-hidden />
                  </div>
                  <h3 className={`mt-3 text-xl font-bold ${m.hq ? "text-white" : ""}`}>{m.name}</h3>
                  <p className={`mt-2 line-clamp-2 text-sm ${m.hq ? "text-white/70" : "text-slate-ink"}`}>{m.areas.slice(0, 4).join(", ")}</p>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-5">
                    {mA.map((a) => (<span key={a.code} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold ${m.hq ? "bg-white/10 text-white" : "bg-navy-50 text-navy"}`}><Plane className="h-3 w-3" aria-hidden />{a.code}</span>))}
                    {mP.map((p) => (<span key={p.slug} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${m.hq ? "bg-white/10 text-white" : "bg-orange-50 text-orange-700"}`}><Ship className="h-3 w-3" aria-hidden />{p.name}</span>))}
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
