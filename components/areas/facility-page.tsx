import Link from "next/link";
import { ArrowRight, ClipboardList, Info, Plane, Route, Ship } from "lucide-react";
import { CtaBand } from "@/components/ui/cta-band";
import { JsonLd } from "@/components/ui/json-ld";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import type { FacilityCopy } from "@/content/seo-copy";
import { markets, services } from "@/content/site";
import { serviceSchema } from "@/lib/seo";

/** Shared layout for airport and cruise-port pages. */
export function FacilityPage({
  kind,
  name,
  code,
  path,
  marketSlug,
  copy,
  altNames,
}: {
  kind: "airport" | "port";
  name: string;
  code?: string;
  path: string;
  marketSlug: string;
  copy: FacilityCopy;
  altNames?: string;
}) {
  const market = markets.find((m) => m.slug === marketSlug);
  const isAirport = kind === "airport";
  const Icon = isAirport ? Plane : Ship;
  const indexPath = isAirport ? "/airports" : "/ports";
  const svc = services.filter((s) => (isAirport ? ["airport-luggage", "vip-group-luggage", "hotel-hospitality-logistics", "sports-entertainment-events", "luggage-storage"] : ["cruise-port-luggage", "vip-group-luggage", "hotel-hospitality-logistics", "luggage-storage"]).includes(s.slug));
  const prepare = isAirport
    ? ["Airline and flight numbers", "Arrival or departure windows", "Bag count per traveler and any oversized items", "Authorized handoff contact", "Destination hotel, port, residence or venue"]
    : ["Sailing date and terminal", "Embarkation or debarkation time", "Bag count per passenger or group", "Pickup or delivery hotel or airport", "Group coordinator contact"];
  const quoteType = isAirport ? "airport" : "cruise";

  return (
    <>
      <PageHero
        eyebrow={isAirport ? `Airport luggage · ${code}` : "Cruise-port luggage"}
        title={isAirport ? `${name} (${code}) luggage service` : `${name} cruise luggage service`}
        lead={copy.intro}
        crumbs={[{ name: "Home", path: "/" }, { name: isAirport ? "Airports" : "Cruise Ports", path: indexPath }, { name: isAirport ? `${code}` : name, path }]}
        primaryCta={{ label: "Request a Quote", href: `/request-a-quote?type=${quoteType}&market=${marketSlug}` }}
        secondaryCta={market ? { label: `${market.name} service area`, href: `/service-areas/${market.slug}` } : undefined}
      >
        {altNames && <p className="mt-6 text-sm text-white/70">{altNames}</p>}
      </PageHero>

      <Section>
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold"><Route className="h-6 w-6 text-orange" aria-hidden /> Routes we plan</h2>
            <ul className="mt-5 space-y-2.5">
              {copy.routes.map((r) => (<li key={r} className="flex items-center gap-3 rounded-xl border border-line p-3.5"><Icon className="h-4 w-4 shrink-0 text-orange" aria-hidden />{r}</li>))}
            </ul>
            <div className="mt-6 space-y-3">
              {copy.notes.map((n) => (<p key={n} className="flex gap-3 text-slate-ink"><span className="text-orange-700">→</span>{n}</p>))}
            </div>
          </div>
          <aside className="rounded-[var(--radius-card)] bg-cloud p-6 md:p-8">
            <h2 className="flex items-center gap-2 text-xl font-bold"><ClipboardList className="h-5 w-5 text-orange" aria-hidden /> What to provide</h2>
            <ul className="mt-4 space-y-2 text-slate-ink">{prepare.map((p) => (<li key={p} className="flex gap-2"><span className="text-orange-700">•</span>{p}</li>))}</ul>
            <p className="mt-6 flex gap-3 rounded-2xl bg-white p-4 text-sm text-charcoal"><Info className="mt-0.5 h-4 w-4 shrink-0 text-orange-700" aria-hidden />
              Service is subject to {isAirport ? "airport and terminal" : "port and terminal"} rules, timing and confirmed access. {isAirport ? "We do not promise unrestricted airside access." : "Ship schedules can change, and we adjust plans with you."}
            </p>
            <Link href={`/request-a-quote?type=${quoteType}&market=${marketSlug}`} className="btn-navy mt-6 w-full">Start your request</Link>
          </aside>
        </div>
      </Section>

      <Section tone="cloud" title="Related services">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {svc.map((s) => (
            <li key={s.slug}><Link href={`/services/${s.slug}`} className="card flex h-full flex-col p-5"><span className="font-semibold text-navy">{s.name}</span><span className="mt-1 flex-1 text-sm text-slate-ink">{s.short}</span><span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-orange-700">Learn more <ArrowRight className="h-4 w-4" aria-hidden /></span></Link></li>
          ))}
        </ul>
      </Section>

      <CtaBand title={isAirport ? `Luggage at ${code}? Let's plan it.` : `Sailing from ${name}? Let's plan the bags.`} />
      <JsonLd data={serviceSchema({ name: isAirport ? `${code} airport luggage service` : `${name} cruise luggage service`, description: copy.intro, path, areas: market ? [`${market.name}, Florida`] : undefined })} />
    </>
  );
}

/** Index grid used by /airports and /ports. */
export function FacilityIndex({ items }: { items: { href: string; title: string; badge?: string; sub: string }[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <li key={it.href}>
          <Link href={it.href} className="card group flex h-full flex-col p-6 transition hover:-translate-y-0.5">
            {it.badge && <span className="w-fit rounded-lg bg-navy px-2.5 py-1 font-mono text-sm font-bold tracking-widest text-white">{it.badge}</span>}
            <h2 className="mt-4 text-lg font-bold">{it.title}</h2>
            <p className="mt-1 flex-1 text-sm text-slate-ink">{it.sub}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-orange-700">View details <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
