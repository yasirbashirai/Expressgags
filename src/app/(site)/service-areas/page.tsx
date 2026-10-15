import Link from "next/link";
import { ArrowRight, MapPin, Plane, Route, Ship } from "lucide-react";
import { FloridaMap } from "@/components/areas/florida-map";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { CtaBand } from "@/components/ui/cta-band";
import { Section } from "@/components/ui/section";
import { airports, markets, otherFloridaRoute, ports } from "@/content/site";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Florida Service Areas: Miami, Fort Lauderdale, Keys, Palm Beach, Orlando, Tampa",
  description:
    "Headquartered in Miami, Express Bags serves eight priority Florida markets: Miami-Dade, Broward, the Florida Keys, Palm Beach, Orlando, Tampa, Fort Myers and Cape Canaveral. Other routes by special quote.",
  path: "/service-areas",
});

const TIERS = [
  { tier: "top", title: "Top-priority markets", text: "Our core South Florida operating area, built around the headquarters in Miami." },
  { tier: "next", title: "Next priority", text: "Resort, club and event logistics along the Palm Beach coast." },
  { tier: "additional", title: "Additional focus markets", text: "Central and Gulf Coast travel markets connected by planned intercity routes." },
] as const;

export default function ServiceAreasPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="container-eb relative grid items-center gap-10 py-14 md:py-20 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Service Areas", path: "/service-areas" }]} light />
            <p className="eyebrow mt-8 !text-orange-100">Florida service areas</p>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] text-white md:text-5xl">Miami headquarters. Eight Florida markets.</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
              Express Bags is headquartered in Miami and focuses on eight priority market areas connected by planned local and intercity routes. Every route is confirmed for vehicle, labor, timing, distance, access and dispatch availability.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/request-a-quote" className="btn-primary">Request a Quote</Link>
              <Link href="#markets" className="btn-ghost-light">Browse markets</Link>
            </div>
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-navy-950/60 p-5 md:p-8"><FloridaMap /></div>
        </div>
        <div className="flight-line opacity-70" aria-hidden />
      </section>

      <Section id="markets" eyebrow="Priority markets" title="Where we focus" intro="Market pages explain local routes, airports, cruise ports and timing for each area.">
        <div className="space-y-12">
          {TIERS.map((t) => (
            <div key={t.tier}>
              <div className="mb-5 flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
                <h3 className="text-xl font-bold">{t.title}</h3>
                <p className="text-sm text-muted">{t.text}</p>
              </div>
              <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {markets.filter((m) => m.tier === t.tier).map((m) => (
                  <li key={m.slug}>
                    <Link href={`/service-areas/${m.slug}`} className="card group flex h-full flex-col p-5 transition hover:-translate-y-0.5">
                      <div className="flex items-center justify-between">
                        <MapPin className="h-5 w-5 text-orange" aria-hidden />
                        {m.hq && <span className="rounded-full bg-orange-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">HQ</span>}
                      </div>
                      <h4 className="mt-3 font-display text-lg font-bold text-navy">{m.name}</h4>
                      <p className="mt-1.5 line-clamp-3 flex-1 text-sm text-slate-ink">{m.summary}</p>
                      <div className="mt-4 flex flex-wrap gap-1.5 text-[11px]">
                        {m.airports.map((a) => (<span key={a} className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2 py-0.5 text-navy"><Plane className="h-3 w-3" aria-hidden />{a}</span>))}
                        {m.ports.map((p) => (<span key={p} className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-orange-700"><Ship className="h-3 w-3" aria-hidden />{ports.find((x) => x.slug === p)?.name}</span>))}
                      </div>
                      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-orange-700">View market <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="cloud">
        <div className="grid gap-8 rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-card)] md:grid-cols-[auto_1fr] md:p-10">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-orange-600 text-white"><Route className="h-7 w-7" aria-hidden /></span>
          <div>
            <h2 className="text-2xl font-bold">{otherFloridaRoute.label}</h2>
            <p className="mt-3 max-w-3xl text-slate-ink">{otherFloridaRoute.note} Requests outside the eight focus markets are reviewed individually and are never a promise of immediate local availability.</p>
            <Link href="/request-a-quote?market=other-florida" className="btn-navy mt-6">Request a special-route quote</Link>
          </div>
        </div>
      </Section>

      <Section eyebrow="Airports & cruise ports" title="Facilities across our markets">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold"><Plane className="h-5 w-5 text-orange" aria-hidden /> <Link href="/airports" className="hover:underline">Airports</Link></h3>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {airports.map((a) => (<li key={a.code}><Link href={`/airports/${a.slug}`} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm hover:border-orange"><span className="rounded bg-navy px-2 py-0.5 font-mono text-xs font-bold text-white">{a.code}</span>{a.name}</Link></li>))}
            </ul>
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold"><Ship className="h-5 w-5 text-orange" aria-hidden /> <Link href="/ports" className="hover:underline">Cruise ports</Link></h3>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {ports.map((p) => (<li key={p.slug}><Link href={`/ports/${p.slug}`} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm hover:border-orange"><Ship className="h-4 w-4 text-navy" aria-hidden />{p.name}</Link></li>))}
            </ul>
          </div>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
