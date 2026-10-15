import Link from "next/link";
import { ArrowRight, ArrowUpRight, Building2, Plane, ShieldCheck, Ship, Truck, UserRound } from "lucide-react";
import {
  airports,
  careStandard,
  company,
  faqs,
  historyEras,
  howItWorks,
  industries,
  markets,
  ports,
  services,
  winReasons,
} from "@/content/site";
import { serviceIcon } from "./service-icon";
import { FloridaMap } from "./florida-map";

/* ---------------------------------------------------------------- */
/* Trust strip: verifiable facts only (no staff or fleet counts)    */
/* ---------------------------------------------------------------- */
export function TrustStrip() {
  const facts = [
    { value: String(company.founded), label: "Operating in Florida since" },
    { value: String(markets.length), label: "Priority Florida markets" },
    { value: String(airports.length), label: "Major airports served" },
    { value: String(ports.length), label: "Cruise ports served" },
    { value: "Van to 26 ft", label: "Cargo vans to box trucks" },
  ];
  return (
    <section aria-label="Express Bags at a glance" className="relative z-10 -mt-10">
      <div className="container-eb">
        <dl className="grid grid-cols-2 overflow-hidden rounded-[1.5rem] border border-line bg-white shadow-[var(--shadow-lift)] sm:grid-cols-3 lg:grid-cols-5">
          {facts.map((f, i) => (
            <div key={f.label} className={`p-5 md:p-6 ${i > 0 ? "border-line lg:border-l" : ""} ${i % 2 === 1 ? "border-l sm:border-l-0" : ""} ${i >= 2 ? "border-t sm:border-t-0" : ""} ${i >= 3 ? "sm:border-t lg:border-t-0" : ""} ${i === 4 ? "col-span-2 sm:col-span-1" : ""}`}>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">{f.label}</dt>
              <dd className="mt-1 font-display text-2xl font-extrabold text-navy md:text-3xl">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Services: one featured + 7 compact, in an editorial layout        */
/* ---------------------------------------------------------------- */
export function ServicesShowcase() {
  const [featured, ...rest] = services;
  const FeaturedIcon = serviceIcon(featured.icon);
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="container-eb">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="eyebrow">What we move</p>
            <h2 className="mt-3 text-3xl font-bold md:text-5xl">Eight services. One accountable logistics partner.</h2>
          </div>
          <Link href="/services" className="btn-ghost self-start md:self-auto">
            All services <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-12">
          <Link
            href={`/services/${featured.slug}`}
            className="group relative flex flex-col overflow-hidden rounded-[1.75rem] bg-navy p-8 text-white lg:col-span-5 md:p-10"
          >
            <div aria-hidden className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full border-[3px] border-orange/60 transition group-hover:scale-105" />
            <FeaturedIcon className="h-10 w-10 text-orange" strokeWidth={1.6} aria-hidden />
            <h3 className="mt-8 text-3xl font-bold text-white">{featured.name}</h3>
            <p className="mt-4 max-w-md text-white/75">{featured.short}</p>
            <ul className="mt-6 space-y-2 text-sm text-white/80">
              {featured.bullets.map((b) => (
                <li key={b} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />{b}</li>
              ))}
            </ul>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Built for</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {featured.audiences.map((a) => (
                <li key={a} className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/80">{a}</li>
              ))}
            </ul>
            <span className="relative mt-auto inline-flex items-center gap-2 pt-10 text-sm font-semibold text-orange-100">
              Explore the service <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>

          <ul className="grid gap-5 sm:grid-cols-2 lg:col-span-7 lg:grid-cols-2">
            {rest.map((s) => {
              const Icon = serviceIcon(s.icon);
              return (
                <li key={s.slug}>
                  <Link href={`/services/${s.slug}`} className="group flex h-full flex-col rounded-[1.25rem] border border-line bg-white p-6 transition hover:-translate-y-0.5 hover:border-orange/40 hover:shadow-[var(--shadow-card)]">
                    <div className="flex items-start justify-between">
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <ArrowUpRight className="h-4 w-4 text-muted transition group-hover:text-orange" aria-hidden />
                    </div>
                    <h3 className="mt-5 text-lg font-bold">{s.name}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-ink">{s.short}</p>
                  </Link>
                </li>
              );
            })}
            <li>
              <Link href="/request-a-quote" className="group flex h-full flex-col justify-between rounded-[1.25rem] bg-orange-600 p-6 text-white transition hover:-translate-y-0.5 hover:bg-orange-600">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white">Not sure which fits?</span>
                <span className="mt-5 block font-display text-lg font-bold">Describe the job and our dispatch team will match the service.</span>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">
                  Request a Quote <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* How it works: horizontal flight path with 5 stops                 */
/* ---------------------------------------------------------------- */
export function HowItWorks() {
  return (
    <section className="relative overflow-hidden bg-sand py-20 md:py-28">
      <div className="container-eb">
        <div className="max-w-2xl">
          <p className="eyebrow">How a job runs</p>
          <h2 className="mt-3 text-3xl font-bold md:text-5xl">From first request to documented handoff.</h2>
          <p className="mt-4 text-lg text-slate-ink">No delivery promise is changed silently. One dispatcher owns your job from start to finish.</p>
        </div>
        <ol className="relative mt-14 grid gap-8 md:grid-cols-5 md:gap-4">
          <div aria-hidden className="flight-line absolute left-0 right-0 top-6 hidden md:block" />
          {howItWorks.map((s, i) => (
            <li key={s.step} className="relative">
              <span className="relative z-10 inline-flex h-12 w-12 items-center justify-center rounded-full border-4 border-sand bg-navy font-display text-lg font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-5 text-xl font-bold">{s.step}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-ink">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Express Care Standard                                             */
/* ---------------------------------------------------------------- */
export function CareStandard() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="container-eb grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-32">
            <p className="eyebrow">Our standard</p>
            <h2 className="mt-3 text-3xl font-bold md:text-5xl">{careStandard.title}</h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-ink">{careStandard.lead}</p>
            <div className="mt-8 flex items-center gap-4 rounded-2xl bg-navy-50 p-5">
              <ShieldCheck className="h-9 w-9 shrink-0 text-navy" aria-hidden />
              <p className="text-sm text-navy">{careStandard.closing}</p>
            </div>
          </div>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-[1.5rem] border border-line bg-line sm:grid-cols-2 lg:col-span-7">
          {careStandard.points.map((p, i) => (
            <li key={p} className="flex gap-4 bg-white p-6">
              <span className="font-display text-sm font-bold text-orange-700">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[15px] leading-snug text-charcoal">{p}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Markets: stylized map + tiered list                               */
/* ---------------------------------------------------------------- */
const TIER_LABEL = { top: "Top-priority markets", next: "Next priority", additional: "Additional focus markets" } as const;

export function MarketsSection() {
  const tiers = (["top", "next", "additional"] as const).map((t) => ({ tier: t, items: markets.filter((m) => m.tier === t) }));
  return (
    <section className="relative overflow-hidden bg-navy py-20 text-white md:py-28">
      <div aria-hidden className="absolute -left-40 bottom-0 h-[30rem] w-[30rem] rounded-full border-[30px] border-white/[0.04]" />
      <div className="container-eb grid items-center gap-12 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <p className="eyebrow !text-orange-100">Where we operate</p>
          <h2 className="mt-3 text-3xl font-bold text-white md:text-5xl">Miami headquarters. Florida&apos;s key travel markets.</h2>
          <p className="mt-5 max-w-xl text-lg text-white/75">
            Local and intercity routes connecting hotels, airports, cruise ports, venues and businesses. Other Florida routes may be
            considered by special quotation.
          </p>
          <div className="mt-10 space-y-8">
            {tiers.map(({ tier, items }) => (
              <div key={tier}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">{TIER_LABEL[tier]}</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {items.map((m) => (
                    <li key={m.slug}>
                      <Link href={`/service-areas/${m.slug}`} className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium transition hover:border-orange hover:bg-white/5">
                        {m.hq && <span className="h-2 w-2 rounded-full bg-orange" aria-hidden />}
                        {m.name}
                        {m.hq && <span className="text-xs text-white/60">HQ</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="flex gap-3 rounded-2xl bg-white/5 p-4">
              <Plane className="h-5 w-5 shrink-0 text-orange" aria-hidden />
              <p className="text-sm text-white/80">{airports.map((a) => a.code).join(" · ")}</p>
            </div>
            <div className="flex gap-3 rounded-2xl bg-white/5 p-4">
              <Ship className="h-5 w-5 shrink-0 text-orange" aria-hidden />
              <p className="text-sm text-white/80">{ports.map((p) => p.name).join(" · ")}</p>
            </div>
          </div>
        </div>
        <div className="lg:col-span-6">
          <FloridaMap className="mx-auto max-w-md" />
          <p className="mt-2 text-center text-xs text-white/45">Stylized map, not to scale. Service subject to route and dispatch confirmation.</p>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Industries marquee-style list                                     */
/* ---------------------------------------------------------------- */
export function IndustriesSection() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="container-eb">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="eyebrow">Who we serve</p>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">Built for hospitality, travel and commercial teams.</h2>
            <Link href="/industries" className="btn-ghost mt-8">Industries we serve <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </div>
          <ul className="grid gap-x-10 sm:grid-cols-2 lg:col-span-8">
            {industries.map((ind) => (
              <li key={ind.name} className="border-t border-line py-5">
                <h3 className="text-lg font-bold">{ind.name}</h3>
                <p className="mt-1 text-sm text-slate-ink">{ind.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Why Express Bags (win reasons)                                    */
/* ---------------------------------------------------------------- */
export function WhyUs() {
  return (
    <section className="bg-cloud py-20 md:py-24">
      <div className="container-eb">
        <div className="max-w-2xl">
          <p className="eyebrow">Why clients choose us</p>
          <h2 className="mt-3 text-3xl font-bold md:text-4xl">Disciplined execution, one assignment at a time.</h2>
        </div>
        <ul className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {winReasons.map((w, i) => (
            <li key={w.title} className="card relative overflow-hidden p-7">
              <span aria-hidden className="absolute right-4 top-2 font-display text-7xl font-extrabold text-navy/[0.06]">{i + 1}</span>
              <h3 className="text-lg font-bold">{w.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-ink">{w.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* History teaser                                                    */
/* ---------------------------------------------------------------- */
export function HistoryTeaser() {
  const picks = [historyEras[0], historyEras[1], historyEras[3], historyEras[6], historyEras[9]];
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="container-eb grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="eyebrow">Since {company.founded}</p>
          <h2 className="mt-3 text-3xl font-bold md:text-5xl">An established operator, not a new startup.</h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-ink">
            Since 2010, Express Bags has moved luggage, gear and cargo between Florida&apos;s airports, hotels,
            cruise ports, private aviation terminals, arenas and warehouses. Our new platform digitizes capability already proven in
            the field.
          </p>
          <Link href="/our-history" className="btn-navy mt-8">Read our history <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
        <ol className="relative border-l-2 border-dashed border-orange/50 pl-8 lg:col-span-7">
          {picks.map((e) => (
            <li key={e.years + e.title} className="relative pb-9 last:pb-0">
              <span aria-hidden className="absolute -left-[2.6rem] top-1 h-4 w-4 rounded-full border-4 border-white bg-orange shadow" />
              <p className="font-display text-sm font-bold text-orange-700">{e.years}</p>
              <h3 className="mt-1 text-xl font-bold">{e.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-ink">{e.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Audience split: Business accounts (primary) / Travelers           */
/* ---------------------------------------------------------------- */
export function AudienceSplit() {
  return (
    <section className="bg-white pb-20 md:pb-28">
      <div className="container-eb grid gap-5 lg:grid-cols-5">
        <div className="relative overflow-hidden rounded-[1.75rem] bg-navy p-8 text-white md:p-12 lg:col-span-3">
          <div aria-hidden className="absolute -right-20 -top-20 h-72 w-72 rounded-full border-[3px] border-orange/60" />
          <Building2 className="h-9 w-9 text-orange" aria-hidden />
          <h2 className="mt-6 text-3xl font-bold text-white">For hotels, DMCs, event teams and businesses</h2>
          <p className="mt-4 max-w-lg text-white/75">
            Account onboarding, approved terms, centralized invoicing, purchase-order support, recurring schedules, manifests,
            multi-vehicle planning, a dedicated dispatch contact and proof of delivery on every job.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/business-accounts" className="btn-primary">Business accounts</Link>
            <Link href="/request-a-quote?type=business" className="btn-ghost-light">Start an account inquiry</Link>
          </div>
        </div>
        <div className="flex flex-col justify-between rounded-[1.75rem] border border-line bg-sand p-8 md:p-10 lg:col-span-2">
          <div>
            <UserRound className="h-9 w-9 text-orange-700" aria-hidden />
            <h2 className="mt-6 text-2xl font-bold">Traveling with luggage?</h2>
            <p className="mt-3 text-slate-ink">
              Hotel to airport, cruise port or residence, with optional short-term storage when check-in and departure times
              don&apos;t line up. Booked when your itinerary, item count and route can be confirmed.
            </p>
          </div>
          <Link href="/request-a-quote" className="btn-navy mt-8 self-start">Request a Quote</Link>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* FAQ teaser                                                        */
/* ---------------------------------------------------------------- */
export function FaqTeaser() {
  const picks = faqs.slice(0, 5);
  return (
    <section className="bg-cloud py-20 md:py-28">
      <div className="container-eb grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="eyebrow">Questions</p>
          <h2 className="mt-3 text-3xl font-bold md:text-4xl">Straight answers before you book.</h2>
          <Link href="/faq" className="btn-ghost mt-8">All questions <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
        <div className="space-y-3 lg:col-span-8">
          {picks.map((f) => (
            <details key={f.q} className="group card p-0 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 p-6 font-display text-lg font-semibold text-navy">
                {f.q}
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy transition group-open:rotate-45">+</span>
              </summary>
              <p className="px-6 pb-6 leading-relaxed text-slate-ink">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Fleet ribbon                                                      */
/* ---------------------------------------------------------------- */
export function FleetRibbon() {
  return (
    <section className="border-y border-line bg-white py-10">
      <div className="container-eb flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Truck className="h-10 w-10 text-orange" strokeWidth={1.5} aria-hidden />
          <p className="max-w-xl font-display text-xl font-bold text-navy">
            Capacity matched to the job, from a cargo van to a 26-foot box truck.
          </p>
        </div>
        <Link href="/fleet" className="btn-ghost">Fleet & capabilities <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </div>
    </section>
  );
}
