/** Hero 2 — White-glove hotel handoff at night: Miami Beach hotel entrance, branded van, luggage cart. 2560×1100 */
import { C, DEFS, palm, render, rng, suitcase, van } from "./lib.mjs";

const W = 2560, H = 1100, street = 930;
const r = rng(21);

// Hotel facade: art-deco tower with lit windows (no name/sign)
let windows = "";
for (let y = 150; y < 700; y += 46)
  for (let x = 1420; x < 2440; x += 58)
    if (r() < 0.55) windows += `<rect x="${x}" y="${y}" width="34" height="26" rx="3" fill="#ffd28a" opacity="${(0.35 + r() * 0.6).toFixed(2)}"/>`;
let stars = "";
for (let i = 0; i < 120; i++) stars += `<circle cx="${(r() * 1300).toFixed(0)}" cy="${(r() * 520).toFixed(0)}" r="${(0.8 + r() * 1.6).toFixed(1)}" fill="#fff" opacity="${(0.2 + r() * 0.6).toFixed(2)}"/>`;

const cases = [
  [1650, 0, 64, 104, "#1f2933"], [1722, 14, 58, 90, "#0a3a73"], [1786, -6, 70, 110, "#3a4553"],
  [1666, -90, 60, 84, "#5b6573"], [1734, -82, 64, 76, "#1f2933"],
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>${DEFS}
  <linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000c1f"/><stop offset="0.65" stop-color="${C.navy3}"/><stop offset="1" stop-color="#0b2b57"/></linearGradient>
  <linearGradient id="facade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#16345f"/><stop offset="1" stop-color="#0e2547"/></linearGradient>
  <linearGradient id="wet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d2140"/><stop offset="1" stop-color="#030a16"/></linearGradient>
  <radialGradient id="warm" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffcf8a" stop-opacity="0.7"/><stop offset="1" stop-color="#ffcf8a" stop-opacity="0"/></radialGradient>
  <linearGradient id="leftShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000814" stop-opacity="0.88"/><stop offset="0.38" stop-color="#000814" stop-opacity="0.4"/><stop offset="0.52" stop-color="#000814" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#night)"/>
${stars}
<circle cx="380" cy="190" r="56" fill="#f5f0e1" opacity="0.9"/><circle cx="402" cy="176" r="52" fill="#000c1f"/>
<!-- hotel tower -->
<rect x="1380" y="110" width="1100" height="660" fill="url(#facade)"/>
<rect x="1380" y="110" width="1100" height="18" fill="${C.orange}" opacity="0.9"/>
<rect x="1860" y="40" width="140" height="80" fill="#16345f"/><rect x="1900" y="0" width="60" height="50" fill="#16345f"/>
${windows}
<!-- entrance canopy with warm light -->
<rect x="1500" y="700" width="860" height="230" fill="#0a1c38"/>
<rect x="1560" y="730" width="740" height="200" fill="#ffd9a0" opacity="0.18"/>
<ellipse cx="1930" cy="780" rx="560" ry="260" fill="url(#warm)"/>
<path d="M1460 690 h940 l-40 46 h-860 z" fill="${C.navy}"/><rect x="1500" y="736" width="860" height="8" fill="${C.orange}"/>
${[1520, 1700, 1880, 2060, 2240].map((x) => `<circle cx="${x + 40}" cy="760" r="6" fill="#fff1c8"/>`).join("")}
<!-- palms -->
${palm({ x: 1330, y: street, h: 480, color: "#020b18", lean: 7 })}${palm({ x: 2500, y: street, h: 430, color: "#020b18", lean: -6 })}
<!-- sidewalk + street -->
<rect y="${street - 20}" width="${W}" height="24" fill="#1b2d4a"/>
<rect y="${street + 4}" width="${W}" height="${H - street}" fill="url(#wet)"/>
<!-- luggage cart -->
<g transform="translate(0 88)">
  <rect x="1630" y="${street - 130}" width="270" height="10" rx="4" fill="#d6b56a"/>
  <rect x="1630" y="${street - 300}" width="8" height="180" fill="#d6b56a"/><rect x="1892" y="${street - 300}" width="8" height="180" fill="#d6b56a"/>
  <path d="M1634 ${street - 300} q133 -70 262 0" stroke="#d6b56a" stroke-width="8" fill="none"/>
  <circle cx="1660" cy="${street - 104}" r="16" fill="#111"/><circle cx="1870" cy="${street - 104}" r="16" fill="#111"/>
  ${cases.map(([x, dy, w, h, col]) => suitcase({ x, y: street - 130 - h + dy, w, h, color: col })).join("")}
</g>
<!-- branded van at the curb -->
${van({ x: 2010, y: street - 196, s: 1.25, flip: true })}
<!-- wet reflections -->
<g opacity="0.35" transform="translate(0 ${street * 2 + 10}) scale(1 -1)">
  <rect x="1500" y="700" width="860" height="230" fill="#ffd9a0" opacity="0.25"/>
  ${van({ x: 2010, y: street - 196, s: 1.25, flip: true })}
</g>
<rect y="${street + 4}" width="${W}" height="${H - street}" fill="url(#wet)" opacity="0.55"/>
<rect width="${W}" height="${H}" fill="url(#leftShade)"/>
</svg>`;

await render(svg, "public/images/marketing/hero-hotel-night.png", { w: W, h: H });
