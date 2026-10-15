import Link from "next/link";
import { ArrowRight, Phone, ShieldCheck } from "lucide-react";
import { airports, company, contact, markets, ports } from "@/content/site";
import { FLORIDA_PATH, FLORIDA_VIEWBOX, KEYS_CHAIN, MARKET_COORDS, project } from "@/components/ui/florida-geo";
import { HeroTicket } from "./hero-ticket";

/**
 * Home hero: a cinematic navy stage. Routes draw out of the Miami headquarters to every priority
 * market (pure CSS stroke animation, no JS), while an illustrative job ticket floats over the map.
 * The H1 and lead text render immediately (LCP), animation is decorative and reduced-motion safe.
 */
const LABELS: Record<string, { text: string; dx: number; dy: number; anchor: "start" | "end" }> = {
  miami: { text: "Miami HQ", dx: 18, dy: 18, anchor: "start" },
  "fort-lauderdale-broward": { text: "Fort Lauderdale", dx: 14, dy: 4, anchor: "start" },
  "west-palm-beach": { text: "West Palm Beach", dx: 14, dy: 4, anchor: "start" },
  "cape-canaveral-port-canaveral": { text: "Port Canaveral", dx: 14, dy: 4, anchor: "start" },
  orlando: { text: "Orlando", dx: -14, dy: -4, anchor: "end" },
  tampa: { text: "Tampa", dx: 14, dy: 5, anchor: "start" },
  "fort-myers": { text: "Fort Myers", dx: 14, dy: 5, anchor: "start" },
  "florida-keys-key-west": { text: "Key West", dx: -14, dy: 6, anchor: "end" },
};

export function HomeHero() {
  const hub = project(MARKET_COORDS.miami);
  const routes = markets.filter((m) => m.slug !== "miami");
  return (
    <section className="relative isolate overflow-hidden bg-navy-950 text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="stage-grid absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]" />
        <div className="absolute -left-40 top-1/3 h-[38rem] w-[38rem] rounded-full bg-navy-700/40 blur-3xl" />
        <div className="absolute right-[-12rem] top-[-14rem] h-[40rem] w-[40rem] rounded-full bg-orange/15 blur-3xl" />
      </div>

      <div className="container-eb grid items-center gap-10 pb-16 pt-12 md:pb-24 md:pt-16 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-6 xl:col-span-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-orange-100">
            <span className="h-1.5 w-1.5 rounded-full bg-orange" /> Miami headquartered · since {company.founded}
          </p>
          <h1 className="mt-6 text-[2.75rem] font-extrabold leading-[0.98] tracking-tight text-white sm:text-6xl xl:text-[5.25rem]">
            Handled with Care.
            <span className="mt-1 block bg-gradient-to-r from-orange to-[#ff9a4d] bg-clip-text text-transparent">Delivered with Confidence.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/80">
            Florida luggage logistics, hospitality transfers, courier, last-mile and box-truck logistics, connecting Miami with
            the state&apos;s key travel markets. {company.promise}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/request-a-quote" className="btn-primary !px-7 !py-3.5 text-base">
              Request a Quote <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a href={contact.phoneHref} className="btn-ghost-light !py-3.5">
              <Phone className="h-4 w-4" aria-hidden /> {contact.phoneDisplay}
            </a>
          </div>
          <p className="mt-6 flex items-center gap-2 text-sm text-white/65">
            <ShieldCheck className="h-4 w-4 text-orange" aria-hidden /> Every route, window and vehicle confirmed by dispatch before we commit.
          </p>
          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-3 border-t border-white/10 pt-6">
            {[
              [String(markets.length), "Florida markets"],
              [String(airports.length), "Airports"],
              [String(ports.length), "Cruise ports"],
            ].map(([n, l]) => (
              <div key={l} className="flex flex-col-reverse">
                <dt className="text-xs uppercase tracking-[0.14em] text-white/55">{l}</dt>
                <dd className="font-display text-3xl font-extrabold text-white">{n}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Map stage */}
        <div className="relative lg:col-span-6 xl:col-span-6">
          <div className="relative mx-auto w-full max-w-[600px]">
            <div className="relative aspect-[805/690] w-full">
            <svg
              viewBox={`-110 -30 ${FLORIDA_VIEWBOX.width + 250} ${FLORIDA_VIEWBOX.height + 60}`}
              className="absolute inset-0 h-full w-full"
              role="img"
              aria-label="Map of Florida showing routes from the Miami headquarters to eight priority markets"
            >
              <defs>
                <linearGradient id="hero-fl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1d4f8c" />
                  <stop offset="100%" stopColor="#0a3a73" />
                </linearGradient>
                <radialGradient id="hero-glow">
                  <stop offset="0%" stopColor="#E06010" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#E06010" stopOpacity="0" />
                </radialGradient>
              </defs>
              <path d={FLORIDA_PATH} fill="url(#hero-fl)" stroke="rgb(255 255 255 / 0.45)" strokeWidth="1.5" strokeLinejoin="round" />
              {KEYS_CHAIN.map((c) => {
                const k = project(c);
                return <ellipse key={c[0]} cx={k.x} cy={k.y} rx="6" ry="2.6" fill="#0a3a73" stroke="rgb(255 255 255 / 0.3)" />;
              })}
              <circle cx={hub.x} cy={hub.y} r="90" fill="url(#hero-glow)" />
              {routes.map((m, i) => {
                const n = project(MARKET_COORDS[m.slug]);
                const bend = m.slug === "florida-keys-key-west" ? 40 : -50;
                const d = `M${hub.x} ${hub.y} Q ${(hub.x + n.x) / 2 + bend} ${(hub.y + n.y) / 2 - 30} ${n.x} ${n.y}`;
                return (
                  <g key={m.slug}>
                    <path d={d} pathLength={1} fill="none" stroke="#E06010" strokeWidth="2.4" strokeLinecap="round" className="anim-draw" style={{ animationDelay: `${400 + i * 180}ms` }} />
                    <path d={d} fill="none" stroke="rgb(255 255 255 / 0.5)" strokeWidth="1.2" strokeDasharray="2 18" className="anim-dash-run" />
                  </g>
                );
              })}
              {markets.map((m, i) => {
                const n = project(MARKET_COORDS[m.slug]);
                const l = LABELS[m.slug];
                const hq = m.slug === "miami";
                return (
                  <g key={m.slug} className="anim-pop" style={{ animationDelay: `${hq ? 200 : 900 + i * 180}ms` }}>
                    {hq && <circle cx={n.x} cy={n.y} r="10" fill="none" stroke="#E06010" strokeWidth="2" className="anim-pulse" />}
                    <circle cx={n.x} cy={n.y} r={hq ? 9 : 6} fill={hq ? "#E06010" : "#fff"} stroke="#E06010" strokeWidth={hq ? 0 : 3} />
                    <text x={n.x + l.dx} y={n.y + l.dy} textAnchor={l.anchor} className="fill-white font-sans text-[15px] font-semibold" style={{ paintOrder: "stroke" }} stroke="#00142d" strokeWidth="4">
                      {l.text}
                    </text>
                  </g>
                );
              })}
            </svg>
            </div>
            <HeroTicket />
          </div>
        </div>
      </div>
      <div className="flight-line opacity-80" aria-hidden />
    </section>
  );
}
