import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { esCommon, esHome } from "@/content/es";
import { EsCheckList, EsClosing, EsHero, EsMarketsGrid, EsServicesGrid } from "@/components/es/es-blocks";
import { Section } from "@/components/ui/section";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMeta({
    title: "Entrega de equipaje en Miami y Florida | Express Bags, Inc.",
    description: "Entrega de equipaje en Miami, traslados al aeropuerto y al puerto de cruceros, mensajería, última milla, almacenamiento de maletas y camiones de caja en Florida desde 2010. Solicite su cotización.",
    path: "/es",
  }),
  alternates: { canonical: "/es", languages: { "en-US": "/", "es-US": "/es" } },
  openGraph: { locale: "es_US" },
};

/** Spanish home page (es-US). */
export default function EsHomePage() {
  return (
    <>
      <EsHero eyebrow={esHome.eyebrow} title={esHome.title} accent={esHome.titleAccent} lead={esHome.lead} crumbs={[{ name: "Inicio", path: "/es" }]} />
      <Section eyebrow="Servicios" title={esHome.servicesTitle} intro={esHome.servicesLead}>
        <EsServicesGrid />
        <Link href="/es/servicios" className="btn-ghost mt-8">Ver todos los servicios <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </Section>
      <Section tone="sand" eyebrow="Cómo trabajamos" title={esHome.stepsTitle}>
        <ol className="grid gap-6 md:grid-cols-5">
          {esHome.steps.map((s, i) => (
            <li key={s.t} className="rounded-[1.25rem] bg-white p-6 shadow-[var(--shadow-card)]">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-navy font-display font-bold text-white">{i + 1}</span>
              <h3 className="mt-4 text-lg font-bold">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-ink">{s.d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-muted">{esCommon.sameDay}</p>
      </Section>
      <Section eyebrow="Nuestro estándar" title={esHome.careTitle}>
        <EsCheckList items={esHome.care} />
      </Section>
      <Section tone="cloud" eyebrow="Dónde operamos" title={esHome.marketsTitle} intro={esCommon.otherRoute}>
        <EsMarketsGrid />
      </Section>
      <Section>
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-[1.75rem] bg-navy p-8 text-white md:p-10">
            <h2 className="text-2xl font-bold text-white md:text-3xl">{esHome.b2bTitle}</h2>
            <p className="mt-4 text-white/75">{esHome.b2bText}</p>
            <Link href="/es/solicitar-cotizacion?type=business" className="btn-primary mt-8">Solicitar cuenta empresarial</Link>
          </div>
          <div className="rounded-[1.75rem] border border-line bg-sand p-8 md:p-10">
            <h2 className="text-2xl font-bold">{esHome.travelerTitle}</h2>
            <p className="mt-4 text-slate-ink">{esHome.travelerText}</p>
            <Link href={esCommon.ctaHref} className="btn-navy mt-8">{esCommon.cta}</Link>
          </div>
        </div>
      </Section>
      <EsClosing />
    </>
  );
}
