import { CheckCircle2, Clock, MapPin, Package, Plane, Ship, Truck } from "lucide-react";
import type { ServiceCopy } from "@/content/seo-copy";
import { airports, ports } from "@/content/site";

/**
 * Distinct illustrative "product" visual per service (pure HTML/SVG, no stock photos).
 * Values shown are illustrative examples, labelled as such.
 */
export function ServiceVisual({ kind }: { kind: ServiceCopy["visual"] }) {
  switch (kind) {
    case "manifest":
      return <Manifest />;
    case "concierge":
      return <Concierge />;
    case "arrivals":
      return <Arrivals />;
    case "sailing":
      return <Sailing />;
    case "storage":
      return <Storage />;
    case "runofshow":
      return <RunOfShow />;
    case "route":
      return <Route />;
    case "fleet":
      return <Fleet />;
  }
}

function Frame({ title, children, tag = "Example" }: { title: string; children: React.ReactNode; tag?: string }) {
  return (
    <div className="relative rounded-[1.5rem] border border-white/15 bg-white p-5 text-charcoal shadow-[var(--shadow-lift)] md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-display text-sm font-semibold text-navy">{title}</p>
        <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-orange-700">{tag}</span>
      </div>
      {children}
    </div>
  );
}

function Manifest() {
  const rows = [
    ["Group A · arrival wave 1", 42, "Counted"],
    ["Group A · arrival wave 2", 37, "Counted"],
    ["Oversized & special items", 6, "Reviewed"],
    ["Hotel handoff", 85, "Re-counted"],
  ] as const;
  return (
    <Frame title="Group manifest">
      <ul className="space-y-2.5">
        {rows.map(([label, n, status]) => (
          <li key={label} className="flex items-center justify-between gap-3 rounded-xl bg-cloud px-3.5 py-3 text-sm">
            <span className="font-medium">{label}</span>
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-display font-bold text-navy">{n}</span>
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />{status}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-navy-100"><div className="h-full w-full rounded-full bg-orange" /></div>
      <p className="mt-2 text-xs text-muted">Every bag counted at pickup and at handoff</p>
    </Frame>
  );
}

function Concierge() {
  const items = [
    ["10:00", "Guest check-out", "Bags tagged at bell desk"],
    ["10:20", "Pickup confirmed", "Count matches request"],
    ["12:30", "Delivered", "Released to authorized contact"],
  ];
  return (
    <Frame title="Concierge request">
      <ol className="relative space-y-5 border-l-2 border-dashed border-orange/50 pl-5">
        {items.map(([t, h, s]) => (
          <li key={t} className="relative">
            <span aria-hidden className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-orange ring-2 ring-orange/30" />
            <p className="text-xs font-semibold text-orange-700">{t}</p>
            <p className="font-display font-semibold text-navy">{h}</p>
            <p className="text-sm text-muted">{s}</p>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

function Arrivals() {
  return (
    <div className="rounded-[1.5rem] bg-navy-950 p-5 font-mono text-sm text-white shadow-[var(--shadow-lift)] md:p-6">
      <div className="mb-4 flex items-center justify-between font-sans">
        <p className="flex items-center gap-2 text-sm font-semibold"><Plane className="h-4 w-4 text-orange" aria-hidden /> Florida airports we plan around</p>
        <span className="text-[10px] uppercase tracking-wider text-white/50">Arrivals</span>
      </div>
      <ul className="divide-y divide-white/10">
        {airports.map((a) => (
          <li key={a.code} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 py-2.5">
            <span className="rounded bg-white/10 px-2 py-1 text-center font-bold tracking-widest text-orange-100">{a.code}</span>
            <span className="truncate font-sans text-white/80">{a.name}</span>
            <span className="text-[11px] uppercase text-emerald-300">Plan</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Sailing() {
  return (
    <Frame title="Embarkation day plan" tag="Example">
      <div className="space-y-3">
        {[
          { icon: MapPin, t: "Hotel pickup", s: "Bags counted and loaded" },
          { icon: Clock, t: "Buffer built in", s: "For terminal traffic" },
          { icon: Ship, t: "Port handoff", s: "Per terminal rules" },
        ].map(({ icon: Icon, t, s }, i) => (
          <div key={t} className="flex items-center gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-navy text-white"><Icon className="h-5 w-5" aria-hidden /></span>
            <div className="flex-1 border-b border-line pb-3">
              <p className="font-display font-semibold text-navy">{i + 1}. {t}</p>
              <p className="text-sm text-muted">{s}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {ports.map((p) => (<span key={p.slug} className="rounded-full bg-cloud px-2.5 py-1 text-[11px] font-medium text-navy">{p.name}</span>))}
      </div>
    </Frame>
  );
}

function Storage() {
  const combos = [
    ["Storage only", false, true, false],
    ["Pickup + storage", true, true, false],
    ["Storage + delivery", false, true, true],
    ["Pickup + storage + delivery", true, true, true],
  ] as const;
  return (
    <Frame title="Storage combinations">
      <div className="grid grid-cols-[1fr_repeat(3,2.5rem)] items-center gap-y-2 text-sm">
        <span />
        {["Pickup", "Hold", "Deliver"].map((h) => (<span key={h} className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted">{h}</span>))}
        {combos.map(([label, a, b, c]) => (
          <div key={label} className="contents">
            <span className="py-2 font-medium">{label}</span>
            {[a, b, c].map((on, i) => (
              <span key={i} className="flex justify-center"><span className={`h-4 w-4 rounded-full ${on ? "bg-orange" : "border-2 border-line"}`} /></span>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-xl bg-navy-50 px-3 py-2 text-xs text-navy">Availability, duration and fees confirmed by quotation</p>
    </Frame>
  );
}

function RunOfShow() {
  const blocks = [
    ["Arrival", "w-[22%]", "bg-navy"],
    ["Hotel", "w-[18%]", "bg-navy-600"],
    ["Load-in", "w-[24%]", "bg-orange"],
    ["Show / game", "w-[20%]", "bg-orange-700"],
    ["Load-out", "w-[16%]", "bg-navy-700"],
  ];
  return (
    <Frame title="Run of show">
      <div className="flex h-12 overflow-hidden rounded-xl">
        {blocks.map(([l, w, c]) => (<div key={l} className={`${w} ${c} grid place-items-center px-1 text-center text-[10px] font-semibold text-white`}>{l}</div>))}
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {["Team and crew luggage", "Equipment cases and gear", "Golf clubs and oversized items", "Venue dock handoffs"].map((x) => (
          <li key={x} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-orange" aria-hidden />{x}</li>
        ))}
      </ul>
    </Frame>
  );
}

function Route() {
  return (
    <Frame title="Multi-stop route">
      <svg viewBox="0 0 320 170" className="h-auto w-full" role="img" aria-label="Illustration of a delivery route with four stops">
        <path d="M20 140 C 80 140, 70 40, 140 50 S 220 150, 300 30" fill="none" stroke="#002858" strokeWidth="3" strokeDasharray="8 7" />
        {[[20, 140, "Pickup"], [140, 50, "Stop 2"], [215, 118, "Stop 3"], [300, 30, "Delivered"]].map(([x, y, l], i) => (
          <g key={String(l)}>
            <circle cx={Number(x)} cy={Number(y)} r="10" fill={i === 3 ? "#E06010" : "#fff"} stroke="#E06010" strokeWidth="3" />
            <text x={Number(x)} y={Number(y) + (i % 2 ? -18 : 26)} textAnchor="middle" fontSize="11" fill="#1F2933" fontFamily="sans-serif">{l}</text>
          </g>
        ))}
      </svg>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
        {["Status updates", "Recipient verified", "Proof of delivery"].map((x) => (<span key={x} className="rounded-lg bg-cloud px-2 py-2 font-medium text-navy">{x}</span>))}
      </div>
    </Frame>
  );
}

function Fleet() {
  const v = [
    ["Cargo van", "w-[30%]"],
    ["15-ft box truck", "w-[55%]"],
    ["20-ft box truck", "w-[75%]"],
    ["26-ft box truck", "w-full"],
  ];
  return (
    <Frame title="Capacity, matched to the load" tag="Fleet classes">
      <ul className="space-y-3">
        {v.map(([n, w]) => (
          <li key={n}>
            <div className="mb-1 flex items-center justify-between text-sm"><span className="font-medium">{n}</span><Truck className="h-4 w-4 text-navy" aria-hidden /></div>
            <div className="h-3 rounded-full bg-navy-100"><div className={`h-full rounded-full bg-gradient-to-r from-navy to-orange ${w}`} /></div>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted"><Package className="h-4 w-4" aria-hidden /> Pallets, equipment, event materials and bulk luggage</p>
    </Frame>
  );
}
