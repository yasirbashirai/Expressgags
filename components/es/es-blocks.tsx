import Link from "next/link";
import { ArrowRight, CheckCircle2, Phone, Plane, Ship } from "lucide-react";
import { airports, contact, markets, ports, services } from "@/content/site";
import { esCommon, esHome, esMarkets, esServices } from "@/content/es";
import { serviceIcon } from "@/components/services/service-icon";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

/** Shared building blocks for the Spanish (/es) pages. */

export function EsHero({ eyebrow, title, accent, lead, crumbs }: { eyebrow: string; title: string; accent?: string; lead: string; crumbs: { name: string; path: string }[] }) {
  return (
    <section className="relative isolate overflow-hidden bg-navy-950 text-white">
      <div aria-hidden className="stage-grid absolute inset-0 -z-10 opacity-50 [mask-image:radial-gradient(ellipse_at_70%_30%,black,transparent_70%)]" />
      <div aria-hidden className="absolute right-[-10rem] top-[-12rem] -z-10 h-[36rem] w-[36rem] rounded-full border-[3px] border-orange/50" />
      <div className="container-eb py-14 md:py-20">
        <Breadcrumbs items={crumbs} light />
        <p className="eyebrow mt-8 !text-orange-100">{eyebrow}</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-extrabold leading-[1.02] text-white md:text-6xl">
          {title}
          {accent && <span className="mt-1 block bg-gradient-to-r from-orange to-[#ff9a4d] bg-clip-text text-transparent">{accent}</span>}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/80">{lead}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={esCommon.ctaHref} className="btn-primary">{esCommon.cta} <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          <a href={contact.phoneHref} className="btn-ghost-light"><Phone className="h-4 w-4" aria-hidden /> {contact.phoneDisplay}</a>
        </div>
        <p className="mt-5 text-sm text-white/60">{esCommon.dispatchNote}</p>
      </div>
      <div className="flight-line opacity-70" aria-hidden />
    </section>
  );
}

export function EsServicesGrid() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {services.map((s) => {
        const Icon = serviceIcon(s.icon);
        const es = esServices[s.slug];
        return (
          <li key={s.slug}>
            <Link href={`/services/${s.slug}`} hrefLang="en" className="group flex h-full flex-col rounded-[1.25rem] border border-line bg-white p-6 transition hover:-translate-y-0.5 hover:border-orange/40 hover:shadow-[var(--shadow-card)]">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-700"><Icon className="h-5 w-5" aria-hidden /></span>
              <h3 className="mt-5 text-lg font-bold">{es.name}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-ink">{es.short}</p>
              <span className="mt-4 text-xs font-semibold text-orange-700">Detalles (en inglés) →</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function EsMarketsGrid() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {markets.map((m) => {
        const mA = airports.filter((a) => m.airports.includes(a.code));
        const mP = ports.filter((p) => m.ports.includes(p.slug));
        return (
          <li key={m.slug}>
            <Link href={`/es/areas/${m.slug}`} className={`flex h-full flex-col rounded-[1.5rem] border p-6 transition hover:-translate-y-1 hover:shadow-[var(--shadow-lift)] ${m.hq ? "border-navy bg-navy text-white" : "border-line bg-white"}`}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${m.hq ? "text-orange-100" : "text-orange-700"}`}>{m.hq ? "Sede" : m.tier === "top" ? "Prioridad principal" : m.tier === "next" ? "Siguiente prioridad" : "Mercado adicional"}</p>
              <h3 className={`mt-3 text-xl font-bold ${m.hq ? "text-white" : ""}`}>{esMarkets[m.slug].name}</h3>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-5">
                {mA.map((a) => (<span key={a.code} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold ${m.hq ? "bg-white/10" : "bg-navy-50 text-navy"}`}><Plane className="h-3 w-3" aria-hidden />{a.code}</span>))}
                {mP.map((p) => (<span key={p.slug} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${m.hq ? "bg-white/10" : "bg-orange-50 text-orange-700"}`}><Ship className="h-3 w-3" aria-hidden />{p.name}</span>))}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function EsClosing() {
  return (
    <section className="bg-white py-16">
      <div className="container-eb">
        <div className="relative overflow-hidden rounded-[2rem] bg-orange-600 px-6 py-12 text-white md:px-14">
          <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[18px] border-white/15" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold text-white">{esHome.closingTitle}</h2>
              <p className="mt-3 text-white">{esHome.closingText}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={esCommon.ctaHref} className="btn bg-white text-navy hover:bg-navy-50">{esCommon.cta}</Link>
              <a href={contact.phoneHref} className="btn-ghost-light"><Phone className="h-4 w-4" aria-hidden /> {contact.phoneDisplay}</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function EsCheckList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((c) => (
        <li key={c} className="flex gap-3 rounded-2xl border border-line bg-white p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orange" aria-hidden /><span className="text-slate-ink">{c}</span></li>
      ))}
    </ul>
  );
}
