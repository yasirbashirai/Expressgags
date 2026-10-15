"use client";

/**
 * Interactive Route Planner: From / To / what is moving → the matching Express Bags service,
 * what to prepare, the facilities involved and a Request a Quote link prefilled with
 * ?type=<serviceType>&market=<market> (params the quote wizard already reads).
 * Pure client logic over site content; no prices are shown (quote-based pricing).
 */
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { ArrowRight, Info, Plane, Ship } from "lucide-react";
import { airports, markets, otherFloridaRoute, ports, services, type QuoteServiceType } from "@/content/site";
import { serviceCopy } from "@/content/seo-copy";
import { serviceIcon } from "@/components/services/service-icon";

type Place = { id: string; label: string; kind: "airport" | "port" | "local" | "other" | "outside"; market: string; href?: string };

export const PLACES: Place[] = [
  ...markets.map((m) => ({ id: `local:${m.slug}`, label: `Hotel, home or business · ${m.name}`, kind: "local" as const, market: m.slug })),
  ...airports.map((a) => ({ id: `airport:${a.code}`, label: `${a.code} · ${a.name}`, kind: "airport" as const, market: a.market, href: `/airports/${a.slug}` })),
  ...ports.map((p) => ({ id: `port:${p.slug}`, label: `${p.name} (cruise port)`, kind: "port" as const, market: p.market, href: `/ports/${p.slug}` })),
  { id: "other", label: "Other Florida location", kind: "other", market: "other-florida" },
  { id: "outside", label: "Outside Florida (ship luggage across the U.S.)", kind: "outside", market: "outside-florida" },
];

export const ITEMS = [
  { id: "suitcases", label: "A few suitcases (1 to 10)" },
  { id: "group", label: "A group or many bags" },
  { id: "gear", label: "Sports, event or performance gear" },
  { id: "parcel", label: "Business documents or parcels" },
  { id: "cargo", label: "Pallets, equipment or cargo" },
] as const;
export type ItemId = (typeof ITEMS)[number]["id"];

/** Decide the service type for a planned route (exported for tests). */
export function planRoute(fromId: string, toId: string, item: ItemId, storage: boolean): { type: QuoteServiceType; market: string; special: boolean; reason: string } {
  const from = PLACES.find((p) => p.id === fromId)!;
  const to = PLACES.find((p) => p.id === toId)!;
  const special = from.kind === "other" || to.kind === "other";
  const market = from.kind === "outside" || from.kind === "other" ? to.market : from.market;
  let type: QuoteServiceType;
  let reason: string;
  if (item === "cargo") { type = "truck"; reason = "Pallets, equipment and cargo move on cargo vans or box trucks matched to the load."; }
  else if (item === "parcel") { type = "courier"; reason = "Business items and documents go by scheduled or time-sensitive courier with proof of delivery."; }
  else if (to.kind === "outside" || from.kind === "outside") { type = "nationwide-shipping"; reason = "Long-distance luggage is shipped through national carriers behind Express Bags service levels, with our pickup first."; }
  else if (item === "group" || item === "gear") { type = "group-event"; reason = "Groups, teams and event gear are planned manually with manifests, vehicles and helpers, by custom quotation."; }
  else if (storage) { type = "storage"; reason = "Short-term storage bridges the gap between check-out, flights and sailings, with optional pickup and delivery."; }
  else if (from.kind === "port" || to.kind === "port") { type = "cruise"; reason = "Cruise moves are timed to the ship schedule with buffer time and a documented port handoff."; }
  else if (from.kind === "airport" || to.kind === "airport") { type = "airport"; reason = "Airport moves are planned around arrival windows and an authorized handoff point."; }
  else { type = "luggage-local"; reason = "Local pickup and delivery between hotels, homes, businesses and venues."; }
  return { type, market, special, reason };
}

export function RoutePlanner() {
  const uid = useId();
  const [from, setFrom] = useState("local:miami");
  const [to, setTo] = useState("port:portmiami");
  const [item, setItem] = useState<ItemId>("suitcases");
  const [storage, setStorage] = useState(false);

  const plan = useMemo(() => planRoute(from, to, item, storage), [from, to, item, storage]);
  // Service card: gear maps to the events service; nationwide shipping has its own card (no service page yet)
  const matched = item === "gear" && plan.type === "group-event" ? services.find((s) => s.slug === "sports-entertainment-events") : services.find((s) => s.quoteType === plan.type);
  const service = matched ?? { ...services[0], slug: "", name: "Nationwide luggage shipping", icon: "Plane" };
  const copy = matched ? serviceCopy[matched.slug] : undefined;
  const prepare = copy?.prepare ?? ["Origin and destination addresses", "Weight and dimensions of every bag (carriers bill by size)", "Pickup date and desired delivery speed", "Contact at both ends"];
  const facilities = [from, to].map((id) => PLACES.find((p) => p.id === id)!).filter((p) => p.href);
  const Icon = serviceIcon(service.icon);
  const href = `/request-a-quote?type=${plan.type}&market=${plan.market}`;

  const select = "w-full appearance-none rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-sm font-medium text-white outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/40 [&>optgroup]:bg-navy [&>option]:bg-navy";
  const group = (kind: Place["kind"]) => PLACES.filter((p) => p.kind === kind);

  const options = (
    <>
      <optgroup label="Hotels, homes and businesses">{group("local").map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>
      <optgroup label="Airports">{group("airport").map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>
      <optgroup label="Cruise ports">{group("port").map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>
      <optgroup label="Other">{PLACES.filter((p) => p.kind === "other" || p.kind === "outside").map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>
    </>
  );

  return (
    <section className="relative overflow-hidden bg-navy py-20 text-white md:py-28" aria-labelledby={`${uid}-title`}>
      <div aria-hidden className="stage-grid absolute inset-0 opacity-40" />
      <div aria-hidden className="absolute -left-32 bottom-[-10rem] h-[30rem] w-[30rem] rounded-full border-[3px] border-orange/40" />
      <div className="container-eb relative grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="eyebrow !text-orange-100">Route planner</p>
          <h2 id={`${uid}-title`} className="mt-3 text-3xl font-bold text-white md:text-5xl">Where is it going?</h2>
          <p className="mt-4 max-w-md text-lg text-white/75">Pick the start, the destination and what is moving. We will show you the right service and what to have ready, then prefill your quote request.</p>

          <form className="mt-8 grid gap-4" onSubmit={(e) => e.preventDefault()} aria-describedby={`${uid}-result`}>
            <div>
              <label htmlFor={`${uid}-from`} className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-white/60">From</label>
              <select id={`${uid}-from`} value={from} onChange={(e) => setFrom(e.target.value)} className={select}>{options}</select>
            </div>
            <div>
              <label htmlFor={`${uid}-to`} className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-white/60">To</label>
              <select id={`${uid}-to`} value={to} onChange={(e) => setTo(e.target.value)} className={select}>{options}</select>
            </div>
            <fieldset>
              <legend className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-white/60">What is moving?</legend>
              <div className="flex flex-wrap gap-2">
                {ITEMS.map((it) => (
                  <label key={it.id} className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange ${item === it.id ? "border-orange bg-orange-600 text-white" : "border-white/20 text-white/85 hover:border-white/50"}`}>
                    <input type="radio" name={`${uid}-item`} value={it.id} checked={item === it.id} onChange={() => setItem(it.id)} className="sr-only" />
                    {it.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-3 text-sm text-white/85">
              <input type="checkbox" checked={storage} onChange={(e) => setStorage(e.target.checked)} className="h-4 w-4 accent-[#E06010]" />
              I need to store the bags for a while first
            </label>
          </form>
        </div>

        <div className="lg:col-span-7" id={`${uid}-result`} aria-live="polite">
          <div className="rounded-[2rem] bg-white p-6 text-charcoal shadow-[var(--shadow-lift)] md:p-9">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-700"><Icon className="h-6 w-6" aria-hidden /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">Recommended service</p>
                <h3 className="mt-1 text-2xl font-bold" data-testid="planner-service">{service.name}</h3>
                <p className="mt-2 text-slate-ink">{plan.reason}</p>
              </div>
            </div>

            {plan.special && (
              <p className="mt-6 flex gap-3 rounded-2xl bg-orange-50 p-4 text-sm text-charcoal" data-testid="planner-special">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-orange-700" aria-hidden />
                <span><strong className="font-semibold">{otherFloridaRoute.label}.</strong> {otherFloridaRoute.note}</span>
              </p>
            )}

            <div className="mt-7 grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-navy">Have this ready</h4>
                <ul className="mt-3 space-y-2 text-sm text-slate-ink">
                  {prepare.slice(0, 5).map((p) => (<li key={p} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />{p}</li>))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-navy">Facilities on this route</h4>
                {facilities.length ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {facilities.map((f) => (
                      <li key={f.id}>
                        <Link href={f.href!} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 hover:border-orange">
                          {f.kind === "airport" ? <Plane className="h-4 w-4 text-orange" aria-hidden /> : <Ship className="h-4 w-4 text-orange" aria-hidden />}
                          <span className="truncate">{f.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-slate-ink">No airport or cruise terminal on this route.</p>
                )}
                <p className="mt-3 text-xs text-muted">Airport and port work is subject to terminal rules, timing and confirmed access.</p>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-ink">Pricing is quote-based, confirmed by dispatch for route, vehicle, labor and timing.</p>
              <Link href={href} className="btn-primary shrink-0" data-testid="planner-cta">
                Request a Quote <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
