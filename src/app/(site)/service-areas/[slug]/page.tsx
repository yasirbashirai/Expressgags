import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, Lightbulb, MapPin, Plane, Route, Ship } from "lucide-react";
import { FloridaMap } from "@/components/areas/florida-map";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { CtaBand } from "@/components/ui/cta-band";
import { JsonLd } from "@/components/ui/json-ld";
import { Section } from "@/components/ui/section";
import { serviceIcon } from "@/components/services/service-icon";
import { marketCopy } from "@/content/seo-copy";
import { airports, markets, ports, services } from "@/content/site";
import { pageMeta, serviceSchema } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return markets.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const m = markets.find((x) => x.slug === slug);
  if (!m) return {};
  const c = marketCopy[m.slug];
  return {
    ...pageMeta({
      title: `${m.name} Luggage Delivery, Courier & Logistics`,
      description: `${c.intro}`.slice(0, 158),
      path: `/service-areas/${m.slug}`,
    }),
    alternates: { canonical: `/service-areas/${m.slug}`, languages: { "en-US": `/service-areas/${m.slug}`, "es-US": `/es/areas/${m.slug}` } },
  };
}

const TIER_LABEL = { top: "Top-priority market", next: "Next-priority market", additional: "Additional focus market" } as const;

export default async function MarketPage({ params }: Props) {
  const { slug } = await params;
  const m = markets.find((x) => x.slug === slug);
  if (!m) notFound();
  const c = marketCopy[m.slug];
  const mAirports = airports.filter((a) => m.airports.includes(a.code));
  const mPorts = ports.filter((p) => m.ports.includes(p.slug));
  const crumbs = [{ name: "Home", path: "/" }, { name: "Service Areas", path: "/service-areas" }, { name: m.name, path: `/service-areas/${m.slug}` }];
  const nearby = markets.filter((x) => x.slug !== m.slug && x.tier === m.tier).concat(markets.filter((x) => x.slug !== m.slug && x.tier !== m.tier)).slice(0, 3);

  return (
    <>
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="container-eb relative grid items-center gap-10 py-14 md:py-20 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <Breadcrumbs items={crumbs} light />
            <p className="eyebrow mt-8 !text-orange-100">{m.hq ? "Headquarters market" : TIER_LABEL[m.tier]}</p>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.08] text-white md:text-5xl">{c.headline}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">{c.intro}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/request-a-quote?market=${m.slug}`} className="btn-primary">Request a Quote</Link>
              <Link href="/services" className="btn-ghost-light">All services</Link>
            </div>
          </div>
          <div className="hidden rounded-[1.75rem] border border-white/10 bg-navy-950/60 p-6 md:block"><FloridaMap highlight={m.slug} /></div>
        </div>
        <div className="flight-line opacity-70" aria-hidden />
      </section>

      <Section eyebrow={`Working in ${m.name}`} title="What makes this market different">
        <div className="grid gap-5 md:grid-cols-3">
          {c.local.map((l, i) => (
            <article key={l.title} className={`rounded-[var(--radius-card)] p-6 ${i === 0 ? "bg-navy text-white" : "border border-line bg-white"}`}>
              <h3 className={`text-lg font-bold ${i === 0 ? "text-white" : ""}`}>{l.title}</h3>
              <p className={`mt-2 leading-relaxed ${i === 0 ? "text-white/80" : "text-slate-ink"}`}>{l.text}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section tone="cloud">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold"><Route className="h-6 w-6 text-orange" aria-hidden /> Common routes</h2>
            <ul className="mt-5 space-y-2.5">
              {c.routes.map((r) => (<li key={r} className="flex items-center gap-3 rounded-xl bg-white p-3.5 shadow-[var(--shadow-card)]"><span className="h-2 w-2 rounded-full bg-orange" />{r}</li>))}
            </ul>
            <h2 className="mt-10 flex items-center gap-2 text-2xl font-bold"><MapPin className="h-6 w-6 text-orange" aria-hidden /> Areas we cover</h2>
            <ul className="mt-5 flex flex-wrap gap-2">
              {m.areas.map((a) => (<li key={a} className="rounded-full border border-navy/15 bg-white px-3.5 py-1.5 text-sm text-navy">{a}</li>))}
            </ul>
            <p className="mt-4 text-sm text-muted">Approved routes only. Other locations may be possible by quotation.</p>
          </div>
          <div className="space-y-6">
            {(mAirports.length > 0 || mPorts.length > 0) && (
              <div className="rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-card)]">
                <h2 className="text-xl font-bold">Airports & cruise ports</h2>
                <ul className="mt-4 space-y-2">
                  {mAirports.map((a) => (
                    <li key={a.code}><Link href={`/airports/${a.slug}`} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 hover:border-orange"><span className="flex items-center gap-3"><Plane className="h-4 w-4 text-orange" aria-hidden />{a.officialName ?? a.name}</span><span className="font-mono text-xs font-bold text-navy">{a.code}</span></Link></li>
                  ))}
                  {mPorts.map((p) => (
                    <li key={p.slug}><Link href={`/ports/${p.slug}`} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-orange"><Ship className="h-4 w-4 text-orange" aria-hidden />{p.name}</Link></li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted">Subject to terminal rules, timing and confirmed access.</p>
              </div>
            )}
            <div className="rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-card)]">
              <h2 className="flex items-center gap-2 text-xl font-bold"><CalendarDays className="h-5 w-5 text-orange" aria-hidden /> Seasonal demand</h2>
              <ul className="mt-4 space-y-2 text-slate-ink">{m.seasonal.map((s) => (<li key={s} className="flex gap-2"><span className="text-orange-700">•</span>{s}</li>))}</ul>
              <p className="mt-3 text-xs text-muted">Event names are used to describe busy periods only and imply no affiliation.</p>
            </div>
            <div className="rounded-[var(--radius-card)] bg-orange-50 p-6">
              <h2 className="flex items-center gap-2 text-xl font-bold"><Lightbulb className="h-5 w-5 text-orange-700" aria-hidden /> Planning tips</h2>
              <ul className="mt-4 space-y-2 text-charcoal">{c.tips.map((t) => (<li key={t} className="flex gap-2"><span className="text-orange-700">→</span>{t}</li>))}</ul>
            </div>
          </div>
        </div>
      </Section>

      <Section eyebrow="Services" title={`Services available in ${m.name}`} intro="All services are subject to route, vehicle, labor, access and dispatch confirmation.">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s) => {
            const Icon = serviceIcon(s.icon);
            return (
              <li key={s.slug}><Link href={`/services/${s.slug}`} className="flex h-full items-start gap-3 rounded-2xl border border-line p-4 transition hover:border-orange hover:shadow-[var(--shadow-card)]"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-orange" aria-hidden /><span className="text-sm font-semibold text-navy">{s.name}</span></Link></li>
            );
          })}
        </ul>
      </Section>

      <section className="bg-sand py-10" lang="es">
        <div className="container-eb flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-display text-lg font-bold text-navy">¿Habla español?</p>
            <p className="mt-1 max-w-3xl text-slate-ink">{c.spanishLine}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2"><Link href={`/es/areas/${m.slug}`} hrefLang="es" className="btn-ghost">Ver en español</Link><Link href={`/request-a-quote?market=${m.slug}&lang=es`} className="btn-primary">Solicitar cotización</Link></div>
        </div>
      </section>

      <Section tone="cloud" title="Other priority markets">
        <div className="grid gap-4 md:grid-cols-3">
          {nearby.map((n) => (
            <Link key={n.slug} href={`/service-areas/${n.slug}`} className="card group p-5">
              <h3 className="font-bold">{n.name}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-slate-ink">{n.summary}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-orange-700">View market <ArrowRight className="h-4 w-4" aria-hidden /></span>
            </Link>
          ))}
        </div>
      </Section>

      <CtaBand title={`Need something moved in ${m.name}?`} />
      <JsonLd
        data={serviceSchema({
          name: `Luggage logistics, courier and truck logistics in ${m.name}`,
          description: c.intro,
          path: `/service-areas/${m.slug}`,
          areas: [`${m.name}, Florida`, ...m.areas.map((a) => `${a}, Florida`)],
        })}
      />
    </>
  );
}
