import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lightbulb, MapPin, Plane, Route, Ship } from "lucide-react";
import { airports, markets, ports } from "@/content/site";
import { esCommon, esMarkets } from "@/content/es";
import { EsClosing, EsHero, EsServicesGrid } from "@/components/es/es-blocks";
import { JsonLd } from "@/components/ui/json-ld";
import { Section } from "@/components/ui/section";
import { pageMeta, serviceSchema } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return markets.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const es = esMarkets[slug];
  if (!es) return {};
  return {
    ...pageMeta({ title: `${es.headline} | Express Bags`, description: es.intro.slice(0, 158), path: `/es/areas/${slug}` }),
    alternates: { canonical: `/es/areas/${slug}`, languages: { "en-US": `/service-areas/${slug}`, "es-US": `/es/areas/${slug}` } },
    openGraph: { locale: "es_US" },
  };
}

/** Spanish market page (one per priority market). */
export default async function EsMarketPage({ params }: Props) {
  const { slug } = await params;
  const m = markets.find((x) => x.slug === slug);
  const es = esMarkets[slug];
  if (!m || !es) notFound();
  const mA = airports.filter((a) => m.airports.includes(a.code));
  const mP = ports.filter((p) => m.ports.includes(p.slug));
  return (
    <>
      <EsHero
        eyebrow={m.hq ? "Mercado sede" : "Mercado prioritario"}
        title={es.headline}
        lead={es.intro}
        crumbs={[{ name: "Inicio", path: "/es" }, { name: es.name, path: `/es/areas/${slug}` }]}
      />
      <Section eyebrow={es.name} title="Lo que hace distinto a este mercado">
        <div className="grid gap-5 md:grid-cols-3">
          {es.points.map((p, i) => (
            <article key={p.t} className={`rounded-[var(--radius-card)] p-6 ${i === 0 ? "bg-navy text-white" : "border border-line bg-white"}`}>
              <h3 className={`text-lg font-bold ${i === 0 ? "text-white" : ""}`}>{p.t}</h3>
              <p className={`mt-2 leading-relaxed ${i === 0 ? "text-white/80" : "text-slate-ink"}`}>{p.d}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section tone="cloud">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold"><Route className="h-6 w-6 text-orange" aria-hidden /> Rutas frecuentes</h2>
            <ul className="mt-5 space-y-2.5">
              {es.routes.map((r) => (<li key={r} className="flex items-center gap-3 rounded-xl bg-white p-3.5 shadow-[var(--shadow-card)]"><span className="h-2 w-2 rounded-full bg-orange" />{r}</li>))}
            </ul>
            <h2 className="mt-10 flex items-center gap-2 text-2xl font-bold"><MapPin className="h-6 w-6 text-orange" aria-hidden /> Zonas que cubrimos</h2>
            <ul className="mt-5 flex flex-wrap gap-2">
              {m.areas.map((a) => (<li key={a} className="rounded-full border border-navy/15 bg-white px-3.5 py-1.5 text-sm text-navy">{a}</li>))}
            </ul>
            <p className="mt-4 text-sm text-muted">Solo rutas aprobadas. {esCommon.otherRoute}</p>
          </div>
          <div className="space-y-6">
            {(mA.length > 0 || mP.length > 0) && (
              <div className="rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-card)]">
                <h2 className="text-xl font-bold">Aeropuertos y puertos de cruceros</h2>
                <ul className="mt-4 space-y-2">
                  {mA.map((a) => (<li key={a.code}><Link href={`/airports/${a.slug}`} hrefLang="en" className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 hover:border-orange"><span className="flex items-center gap-3"><Plane className="h-4 w-4 text-orange" aria-hidden />{a.officialName ?? a.name}</span><span className="font-mono text-xs font-bold text-navy">{a.code}</span></Link></li>))}
                  {mP.map((p) => (<li key={p.slug}><Link href={`/ports/${p.slug}`} hrefLang="en" className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-orange"><Ship className="h-4 w-4 text-orange" aria-hidden />{p.name}</Link></li>))}
                </ul>
                <p className="mt-3 text-xs text-muted">Sujeto a las reglas de cada terminal, horarios y acceso confirmado.</p>
              </div>
            )}
            <div className="rounded-[var(--radius-card)] bg-orange-50 p-6">
              <h2 className="flex items-center gap-2 text-xl font-bold"><Lightbulb className="h-5 w-5 text-orange-700" aria-hidden /> Consejos para planificar</h2>
              <ul className="mt-4 space-y-2 text-charcoal">{es.tips.map((t) => (<li key={t} className="flex gap-2"><span className="text-orange-700">→</span>{t}</li>))}</ul>
            </div>
          </div>
        </div>
      </Section>
      <Section eyebrow="Servicios" title={`Servicios disponibles en ${es.name}`} intro={esCommon.pricing}>
        <EsServicesGrid />
      </Section>
      <EsClosing />
      <JsonLd data={{ ...serviceSchema({ name: es.headline, description: es.intro, path: `/es/areas/${slug}`, areas: [`${m.name}, Florida`, ...m.areas.map((a) => `${a}, Florida`)] }), inLanguage: "es-US" }} />
    </>
  );
}
