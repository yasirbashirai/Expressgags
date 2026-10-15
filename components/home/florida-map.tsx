import Link from "next/link";
import { markets } from "@/content/site";

import { FLORIDA_PATH, FLORIDA_VIEWBOX, KEYS_CHAIN, MARKET_COORDS, project } from "@/components/ui/florida-geo";

/**
 * Florida (geographically faithful, simplified outline) with the 8 priority markets at their real
 * positions, connected to the Miami headquarters by the dashed "flight line" motif from the logo.
 */
const LABELS: Record<string, { label: string; dx: number; dy: number; anchor: "start" | "end" }> = {
  miami: { label: "Miami (HQ)", dx: 24, dy: 10, anchor: "start" },
  "fort-lauderdale-broward": { label: "Fort Lauderdale", dx: 14, dy: 2, anchor: "start" },
  "west-palm-beach": { label: "West Palm Beach", dx: 14, dy: 0, anchor: "start" },
  "cape-canaveral-port-canaveral": { label: "Cape Canaveral", dx: 14, dy: 0, anchor: "start" },
  orlando: { label: "Orlando", dx: -14, dy: -6, anchor: "end" },
  tampa: { label: "Tampa", dx: -14, dy: 4, anchor: "end" },
  "fort-myers": { label: "Fort Myers", dx: -14, dy: 4, anchor: "end" },
  "florida-keys-key-west": { label: "Key West", dx: -14, dy: 6, anchor: "end" },
};
const NODES = Object.fromEntries(
  Object.entries(MARKET_COORDS).map(([slug, c]) => [slug, { ...project(c), ...LABELS[slug] }]),
) as Record<string, { x: number; y: number; label: string; dx: number; dy: number; anchor: "start" | "end" }>;

export function FloridaMap({ className = "" }: { className?: string }) {
  const hub = NODES.miami;
  return (
    <figure className={className}>
      <svg viewBox={`-10 -20 ${FLORIDA_VIEWBOX.width + 150} ${FLORIDA_VIEWBOX.height + 40}`} role="img" aria-labelledby="fl-map-title fl-map-desc" className="h-auto w-full">
        <title id="fl-map-title">Express Bags priority Florida markets</title>
        <desc id="fl-map-desc">
          A stylized map of Florida, not to scale, showing the eight priority markets connected to the Miami headquarters.
        </desc>
        <defs>
          <linearGradient id="fl-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a3a73" />
            <stop offset="100%" stopColor="#001d40" />
          </linearGradient>
        </defs>
        <path d={FLORIDA_PATH} fill="url(#fl-fill)" stroke="rgb(255 255 255 / 0.22)" strokeWidth="1.5" strokeLinejoin="round" />
        {/* Florida Keys island chain */}
        {KEYS_CHAIN.map((c) => {
          const k = project(c);
          return <ellipse key={c[0]} cx={k.x} cy={k.y} rx="6" ry="2.6" fill="#0a3a73" stroke="rgb(255 255 255 / 0.3)" />;
        })}

        {/* Routes from the Miami hub */}
        {Object.entries(NODES)
          .filter(([slug]) => slug !== "miami")
          .map(([slug, n]) => (
            <path
              key={slug}
              d={`M${hub.x} ${hub.y} Q ${(hub.x + n.x) / 2 - 40} ${(hub.y + n.y) / 2 - 30} ${n.x} ${n.y}`}
              fill="none"
              stroke="#E06010"
              strokeOpacity="0.75"
              strokeWidth="1.6"
              strokeDasharray="6 6"
            />
          ))}

        {markets.map((m) => {
          const n = NODES[m.slug];
          if (!n) return null;
          const isHq = m.slug === "miami";
                    return (
            <g key={m.slug}>
              <circle cx={n.x} cy={n.y} r={isHq ? 11 : 6.5} fill={isHq ? "#E06010" : "#ffffff"} stroke="#E06010" strokeWidth={isHq ? 0 : 3} />
              {isHq && <circle cx={n.x} cy={n.y} r="20" fill="none" stroke="#E06010" strokeOpacity="0.5" strokeWidth="1.5" />}
              <text x={n.x + n.dx} y={n.y + n.dy + 4} textAnchor={n.anchor} className="fill-white font-sans text-[15px] font-semibold">
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">
        Markets:{" "}
        {markets.map((m) => (
          <Link key={m.slug} href={`/service-areas/${m.slug}`}>
            {m.name}{" "}
          </Link>
        ))}
      </figcaption>
    </figure>
  );
}
