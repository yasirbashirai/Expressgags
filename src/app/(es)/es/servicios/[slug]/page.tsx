import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, ClipboardList, Info } from "lucide-react";
import { EsClosing, EsHero } from "@/components/es/es-blocks";
import { serviceIcon } from "@/components/services/service-icon";
import { JsonLd } from "@/components/ui/json-ld";
import { Section } from "@/components/ui/section";
import { esCommon, esServiceDetails, esServices } from "@/content/es";
import { services } from "@/content/site";
import { pageMeta, serviceSchema } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const es = esServices[slug];
  const d = esServiceDetails[slug];
  if (!es || !d) return {};
  const path = `/es/servicios/${slug}`;
  return {
    ...pageMeta({ title: `${es.name} en Florida`, description: d.seoDescription, path }),
    alternates: { canonical: path, languages: { "en-US": `/services/${slug}`, "es-US": path } },
    openGraph: { locale: "es_US" },
  };
}

/** Spanish service detail page (same facts and rules as /services/[slug]). */
export default async function EsServicePage({ params }: Props) {
  const { slug } = await params;
  const s = services.find((x) => x.slug === slug);
  const es = esServices[slug];
  const d = esServiceDetails[slug];
  if (!s || !es || !d) notFound();
  const Icon = serviceIcon(s.icon);
  const path = `/es/servicios/${slug}`;
  const quoteHref = `/es/solicitar-cotizacion?type=${s.quoteType}`;
  const others = services.filter((x) => x.slug !== slug).slice(0, 3);

  return (
    <>
      <EsHero
        eyebrow={es.name}
        title={d.headline}
        lead={d.intro}
        crumbs={[{ name: "Inicio", path: "/es" }, { name: "Servicios", path: "/es/servicios" }, { name: es.name, path }]}
        ctaHref={quoteHref}
      />

      <Section eyebrow="Qué incluye" title="El servicio, en palabras simples">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <ul className="grid gap-4 sm:grid-cols-2">
            {d.bullets.map((b) => (
              <li key={b} className="flex gap-3 rounded-2xl border border-line bg-white p-5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orange" aria-hidden />
                <span className="text-slate-ink">{b}</span>
              </li>
            ))}
          </ul>
          <aside className="rounded-[1.5rem] bg-cloud p-6">
            <h3 className="flex items-center gap-2 text-lg font-bold"><Icon className="h-5 w-5 text-orange" aria-hidden /> Para quién es</h3>
            <ul className="mt-3 space-y-2 text-slate-ink">
              {d.audiences.map((a) => (<li key={a} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />{a}</li>))}
            </ul>
            <h3 className="mt-6 flex items-center gap-2 text-lg font-bold"><ClipboardList className="h-5 w-5 text-orange" aria-hidden /> Tenga esto a mano</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-ink">
              {d.prepare.map((p) => (<li key={p} className="flex gap-2"><ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-orange" aria-hidden />{p}</li>))}
            </ul>
            <Link href={quoteHref} className="btn-navy mt-6 w-full">{esCommon.cta}</Link>
          </aside>
        </div>
        {d.note && (
          <p className="mt-8 flex gap-2 rounded-2xl bg-orange-50 p-4 text-sm text-charcoal"><Info className="mt-0.5 h-4 w-4 shrink-0 text-orange-700" aria-hidden />{d.note}</p>
        )}
      </Section>

      <Section tone="sand" eyebrow="Cómo funciona" title="Paso a paso">
        <ol className="grid gap-6 md:grid-cols-4">
          {d.steps.map((st, i) => (
            <li key={st.t} className="rounded-2xl bg-white p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-600 font-display font-bold text-white">{i + 1}</span>
              <h3 className="mt-4 text-lg font-bold">{st.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-ink">{st.d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-muted">{esCommon.sameDay}</p>
        <p className="mt-2 text-sm text-muted">{esCommon.pricing}</p>
      </Section>

      <Section eyebrow="Otros servicios" title="También le puede interesar">
        <ul className="grid gap-4 md:grid-cols-3">
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={`/es/servicios/${o.slug}`} className="flex h-full flex-col rounded-2xl border border-line bg-white p-6 transition hover:-translate-y-0.5 hover:border-orange/40">
                <span className="text-lg font-bold text-navy">{esServices[o.slug].name}</span>
                <span className="mt-2 text-sm text-slate-ink">{esServices[o.slug].short}</span>
                <span className="mt-4 text-xs font-semibold text-orange-700">Ver servicio →</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted">
          <Link href={`/services/${slug}`} hrefLang="en" className="underline">Read this page in English</Link>
        </p>
      </Section>

      <EsClosing />
      <JsonLd data={serviceSchema({ name: es.name, description: d.intro, path })} />
    </>
  );
}
