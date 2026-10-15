import Link from "next/link";
import { markets } from "@/content/site";

/**
 * Stylized Florida map with the 8 priority markets at their real relative positions
 * (simple equirectangular projection). Intentionally shows market areas only, never an office pin.
 */
const LON0 = -87.7;
const LAT0 = 31.1;
const KX = 60;
const KY = 68;
const p = (lon: number, lat: number) => [Math.round((lon - LON0) * KX * 10) / 10, Math.round((LAT0 - lat) * KY * 10) / 10] as const;

const OUTLINE: [number, number][] = [
  [-87.6, 30.99], [-85.0, 31.0], [-84.86, 30.71], [-82.2, 30.57], [-81.5, 30.72], [-81.4, 30.4], [-81.25, 29.7],
  [-80.95, 29.1], [-80.6, 28.45], [-80.45, 27.7], [-80.1, 26.95], [-80.03, 26.1], [-80.14, 25.6], [-80.45, 25.2],
  [-81.05, 25.13], [-81.25, 25.45], [-81.7, 25.9], [-81.85, 26.45], [-82.2, 26.9], [-82.6, 27.45], [-82.8, 27.95],
  [-82.72, 28.6], [-82.68, 29.0], [-83.1, 29.3], [-83.6, 29.9], [-84.05, 30.1], [-84.4, 29.92], [-85.0, 29.65],
  [-85.4, 29.75], [-85.85, 30.2], [-86.5, 30.4], [-87.3, 30.3], [-87.6, 30.32],
];
const KEYS: [number, number][] = [[-80.42, 25.12], [-80.6, 24.95], [-80.8, 24.83], [-81.05, 24.73], [-81.3, 24.66], [-81.55, 24.6], [-81.78, 24.56]];

const COORDS: Record<string, [number, number]> = {
  miami: [-80.19, 25.76],
  "fort-lauderdale-broward": [-80.14, 26.12],
  "florida-keys-key-west": [-81.78, 24.56],
  "west-palm-beach": [-80.05, 26.71],
  orlando: [-81.38, 28.54],
  tampa: [-82.46, 27.95],
  "fort-myers": [-81.87, 26.64],
  "cape-canaveral-port-canaveral": [-80.6, 28.39],
};
// label offsets so labels do not collide on the crowded southeast coast
const LABEL: Record<string, [number, number, "start" | "end"]> = {
  miami: [12, 14, "start"],
  "fort-lauderdale-broward": [12, 2, "start"],
  "florida-keys-key-west": [-10, 18, "end"],
  "west-palm-beach": [12, -6, "start"],
  orlando: [-12, -8, "end"],
  tampa: [-12, 4, "end"],
  "fort-myers": [-12, 4, "end"],
  "cape-canaveral-port-canaveral": [12, -4, "start"],
};
const SHORT: Record<string, string> = {
  miami: "Miami (HQ)",
  "fort-lauderdale-broward": "Fort Lauderdale",
  "florida-keys-key-west": "Key West & the Keys",
  "west-palm-beach": "West Palm Beach",
  orlando: "Orlando",
  tampa: "Tampa",
  "fort-myers": "Fort Myers",
  "cape-canaveral-port-canaveral": "Cape Canaveral",
};

export function FloridaMap({ highlight }: { highlight?: string }) {
  const d = OUTLINE.map(([lon, lat], i) => `${i ? "L" : "M"}${p(lon, lat).join(" ")}`).join(" ") + " Z";
  const tierColor = { top: "#E06010", next: "#F59A5B", additional: "#5B8FD1" } as const;
  return (
    <figure className="relative">
      <svg viewBox="-10 -10 640 480" className="h-auto w-full" role="group" aria-labelledby="fl-map-title">
        <title id="fl-map-title">Map of Express Bags priority service markets in Florida</title>
        <defs>
          <pattern id="fl-grid" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#ffffff" opacity="0.12" />
          </pattern>
        </defs>
        <rect x="-10" y="-10" width="640" height="480" fill="url(#fl-grid)" />
        <path d={d} fill="#0a3a73" stroke="#5B8FD1" strokeOpacity="0.5" strokeWidth="1.5" />
        {KEYS.map(([lon, lat]) => {
          const [x, y] = p(lon, lat);
          return <ellipse key={lon} cx={x} cy={y} rx="5" ry="2.5" fill="#0a3a73" stroke="#5B8FD1" strokeOpacity="0.5" />;
        })}
        {/* Corridor lines from the Miami headquarters */}
        {markets.filter((m) => m.slug !== "miami").map((m) => {
          const [x1, y1] = p(...COORDS.miami);
          const [x2, y2] = p(...COORDS[m.slug]);
          return <line key={m.slug} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#E06010" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="5 5" />;
        })}
        {markets.map((m) => {
          const [x, y] = p(...COORDS[m.slug]);
          const [dx, dy, anchor] = LABEL[m.slug];
          const active = highlight === m.slug;
          return (
            <Link key={m.slug} href={`/service-areas/${m.slug}`} aria-label={m.name}>
              <g className="cursor-pointer">
                {(active || m.hq) && <circle cx={x} cy={y} r="16" fill="#E06010" opacity="0.25" />}
                <circle cx={x} cy={y} r={m.hq ? 8 : 6.5} fill={tierColor[m.tier]} stroke="#fff" strokeWidth="2.5" />
                <text x={x + dx} y={y + dy} textAnchor={anchor} fontSize="14" fontWeight={active || m.hq ? 700 : 600} fill="#fff" fontFamily="var(--font-archivo), sans-serif">
                  {SHORT[m.slug]}
                </text>
              </g>
            </Link>
          );
        })}
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-4 text-xs text-white/75">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#E06010]" /> Top priority</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#F59A5B]" /> Next priority</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#5B8FD1]" /> Additional focus</span>
        <span>Market areas shown, not office locations</span>
      </figcaption>
    </figure>
  );
}
