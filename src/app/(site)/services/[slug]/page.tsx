import Image from "next/image";
import Link from "next/link";
import { sitePhotos, type SitePhoto } from "@/components/ui/site-photos";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, ClipboardList, Info, MapPin, Plane, Ship } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { CtaBand } from "@/components/ui/cta-band";
import { JsonLd } from "@/components/ui/json-ld";
import { Section } from "@/components/ui/section";
import { FaqList } from "@/components/services/faq-list";
import { serviceIcon } from "@/components/services/service-icon";
import { ServiceVisual } from "@/components/services/service-visual";
import { serviceCopy } from "@/content/seo-copy";
import { airports, faqs, markets, ports, services } from "@/content/site";
import { pageMeta, serviceSchema } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

/** Brand photos used in the hero for services that have one (others keep their illustration). */
const SERVICE_PHOTO: Record<string, SitePhoto> = {
  "hotel-hospitality-logistics": sitePhotos.valet,
  "vip-group-luggage": sitePhotos.sunrise,
  "cruise-port-luggage": sitePhotos.cruise,
  "luggage-storage": sitePhotos.qrScan,
  "cargo-van-box-truck": sitePhotos.keysBridge,
};

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const s = services.find((x) => x.slug === slug);
  if (!s) return {};
  const path = `/services/${s.slug}`;
  return {
    ...pageMeta({ title: `${s.name} in Florida`, description: `${s.short} ${s.intro}`.slice(0, 158), path }),
    alternates: { canonical: path, languages: { "en-US": path, "es-US": `/es/servicios/${s.slug}` } },
  };
}

export default async function ServicePage({ params }: Props) {
  const { slug } = await params;
  const s = services.find((x) => x.slug === slug);
  if (!s) notFound();
  const c = serviceCopy[s.slug];
  const idx = services.indexOf(s);
  const Icon = serviceIcon(s.icon);
  const quoteHref = `/request-a-quote?type=${s.quoteType}`;
  const crumbs = [{ name: "Home", path: "/" }, { name: "Services", path: "/services" }, { name: s.name, path: `/services/${s.slug}` }];
  const relMarkets = markets.filter((m) => c.relatedMarkets.includes(m.slug));
  const serviceFaqs = c.faqIndexes.map((i) => faqs[i]).filter(Boolean);
  const others = services.filter((x) => x.slug !== s.slug).slice(0, 3);
  const stepLayout = idx % 3; // 0 = horizontal timeline, 1 = numbered cards, 2 = vertical list

  return (
    <>
      {/* Hero with service-specific visual */}
      <section className={`relative overflow-hidden text-white ${idx % 2 ? "bg-navy-950" : "bg-navy"}`}>
        <div aria-hidden className="pointer-events-none absolute -left-32 -bottom-40 h-[28rem] w-[28rem] rounded-full border-[24px] border-orange/20" />
        <div className="container-eb relative grid items-center gap-10 py-14 md:py-20 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Breadcrumbs items={crumbs} light />
            <p className="eyebrow mt-8 !text-orange-100"><Icon className="h-4 w-4" aria-hidden /> {s.name}</p>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] text-white md:text-5xl">{c.headline}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">{s.intro}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={quoteHref} className="btn-primary">Request a Quote</Link>
              <Link href="/service-areas" className="btn-ghost-light">Where we operate</Link>
            </div>
          </div>
          <div className="lg:pl-6">
            {SERVICE_PHOTO[s.slug] ? (
              <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)] ring-1 ring-white/15">
                <Image src={SERVICE_PHOTO[s.slug].src} alt={SERVICE_PHOTO[s.slug].alt} fill priority sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" style={{ objectPosition: SERVICE_PHOTO[s.slug].position }} />
                <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-navy-950/50 to-transparent" />
              </div>
            ) : (
              <ServiceVisual kind={c.visual} />
            )}
          </div>
        </div>
        <div className="flight-line opacity-70" aria-hidden />
      </section>

      {/* What's included + who it's for */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="eyebrow">{"What's included"}</p>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">The service, in plain terms</h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {s.bullets.map((b) => (
                <li key={b} className="flex gap-3 rounded-2xl border border-line p-5"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orange" aria-hidden /><span className="text-slate-ink">{b}</span></li>
              ))}
            </ul>
            {s.notes?.map((n) => (
              <p key={n} className="mt-5 flex gap-3 rounded-2xl bg-orange-50 p-4 text-sm text-charcoal"><Info className="mt-0.5 h-4 w-4 shrink-0 text-orange-700" aria-hidden />{n}</p>
            ))}
          </div>
          <aside className="rounded-[var(--radius-card)] bg-cloud p-6 md:p-8">
            <h2 className="text-xl font-bold">{"Who it's for"}</h2>
            <ul className="mt-4 space-y-2.5">
              {s.audiences.map((a) => (<li key={a} className="flex items-center gap-2.5 text-slate-ink"><span className="h-1.5 w-1.5 rounded-full bg-orange" />{a}</li>))}
            </ul>
            <h2 className="mt-8 flex items-center gap-2 text-xl font-bold"><ClipboardList className="h-5 w-5 text-orange" aria-hidden /> Have this ready</h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-ink">
              {c.prepare.map((p) => (<li key={p} className="flex gap-2"><span className="text-orange-700">→</span>{p}</li>))}
            </ul>
            <Link href={quoteHref} className="btn-navy mt-7 w-full">Start your request</Link>
          </aside>
        </div>
      </Section>

      {/* How it works — layout varies per service */}
      <Section tone={idx % 2 ? "sand" : "cloud"} eyebrow="How it works" title={`${s.name}, step by step`}>
        {stepLayout === 0 && (
          <ol className="relative grid gap-6 md:grid-cols-4">
            <div aria-hidden className="absolute left-0 right-0 top-6 hidden h-0.5 bg-orange/40 md:block" />
            {c.steps.map((st, i) => (
              <li key={st.title} className="relative">
                <span className="relative grid h-12 w-12 place-items-center rounded-full bg-orange-600 font-display text-lg font-bold text-white ring-8 ring-cloud">{i + 1}</span>
                <h3 className="mt-4 text-lg font-bold">{st.title}</h3>
                <p className="mt-1.5 text-slate-ink">{st.text}</p>
              </li>
            ))}
          </ol>
        )}
        {stepLayout === 1 && (
          <ol className="grid gap-5 md:grid-cols-2">
            {c.steps.map((st, i) => (
              <li key={st.title} className="card flex gap-5 p-6">
                <span className="font-display text-5xl font-extrabold leading-none text-navy-100">{String(i + 1).padStart(2, "0")}</span>
                <div><h3 className="text-lg font-bold">{st.title}</h3><p className="mt-1.5 text-slate-ink">{st.text}</p></div>
              </li>
            ))}
          </ol>
        )}
        {stepLayout === 2 && (
          <ol className="mx-auto max-w-3xl space-y-4">
            {c.steps.map((st, i) => (
              <li key={st.title} className="flex gap-5 rounded-2xl bg-white p-5 shadow-[var(--shadow-card)]">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy font-bold text-white">{i + 1}</span>
                <div><h3 className="text-lg font-bold">{st.title}</h3><p className="mt-1 text-slate-ink">{st.text}</p></div>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-8 text-sm text-muted">Same-day, urgent and intercity work may be available subject to capacity, distance, access and dispatch confirmation.</p>
      </Section>

      {/* Facilities */}
      {(c.showAirports || c.showPorts) && (
        <Section eyebrow="Airports & ports" title="Florida facilities we plan around" intro="Service at every airport and cruise port is subject to terminal rules, timing and confirmed access.">
          <div className="grid gap-8 lg:grid-cols-2">
            {c.showAirports && (
              <div>
                <h3 className="flex items-center gap-2 text-lg font-bold"><Plane className="h-5 w-5 text-orange" aria-hidden /> Airports</h3>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {airports.map((a) => (
                    <li key={a.code}><Link href={`/airports/${a.slug}`} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm hover:border-orange"><span className="rounded bg-navy px-2 py-0.5 font-mono text-xs font-bold text-white">{a.code}</span>{a.name}</Link></li>
                  ))}
                </ul>
              </div>
            )}
            {c.showPorts && (
              <div>
                <h3 className="flex items-center gap-2 text-lg font-bold"><Ship className="h-5 w-5 text-orange" aria-hidden /> Cruise ports</h3>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {ports.map((p) => (
                    <li key={p.slug}><Link href={`/ports/${p.slug}`} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm hover:border-orange"><Ship className="h-4 w-4 text-navy" aria-hidden />{p.name}</Link></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Markets */}
      <Section tone="navy" eyebrow="Where" title={`${s.name} across Florida`} intro="Headquartered in Miami, with priority service markets across the state. Every route is confirmed for vehicle, labor, timing and access.">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {relMarkets.map((m) => (
            <li key={m.slug}>
              <Link href={`/service-areas/${m.slug}`} className="flex h-full items-start gap-3 rounded-2xl border border-white/15 bg-white/5 p-4 transition hover:border-orange hover:bg-white/10">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-orange" aria-hidden />
                <span><span className="block font-semibold text-white">{m.name}</span>{m.hq && <span className="text-xs text-orange-100">Headquarters</span>}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* FAQ */}
      <Section eyebrow="Questions" title="Common questions">
        <div className="max-w-3xl"><FaqList items={serviceFaqs} /></div>
      </Section>

      {/* Related services */}
      <Section tone="cloud" title="Related services">
        <div className="grid gap-4 md:grid-cols-3">
          {others.map((o) => {
            const OIcon = serviceIcon(o.icon);
            return (
              <Link key={o.slug} href={`/services/${o.slug}`} className="card group p-5">
                <OIcon className="h-6 w-6 text-orange" aria-hidden />
                <h3 className="mt-3 font-bold">{o.name}</h3>
                <p className="mt-1 text-sm text-slate-ink">{o.short}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-orange-700">Learn more <ArrowRight className="h-4 w-4" aria-hidden /></span>
              </Link>
            );
          })}
        </div>
      </Section>

      <CtaBand title={`Get a quote for ${s.name}`} />
      <JsonLd data={serviceSchema({ name: s.name, description: s.intro, path: `/services/${s.slug}`, areas: relMarkets.map((m) => `${m.name}, Florida`) })} />
    </>
  );
}
