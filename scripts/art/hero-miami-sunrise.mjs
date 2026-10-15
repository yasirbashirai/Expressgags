/** Hero 1 — Miami sunrise run: branded box truck on the causeway toward PortMiami, skyline + cruise ships. 2560×1100 */
import { C, DEFS, boxTruck, cruiseShip, palm, render, rng, skyline } from "./lib.mjs";

const W = 2560, H = 1100, road = 905;
const r = rng(11);

let trails = "";
for (let i = 0; i < 6; i++) {
  const y = road - 150 + i * 22;
  trails += `<rect x="${380 + i * 40}" y="${y}" width="${880 - i * 60}" height="${3 + (i % 2) * 2}" rx="3" fill="url(#trail)" opacity="${0.55 - i * 0.06}"/>`;
}
let sparkles = "";
for (let i = 0; i < 70; i++) sparkles += `<rect x="${(r() * W).toFixed(0)}" y="${(road + 75 + r() * 120).toFixed(0)}" width="${(20 + r() * 90).toFixed(0)}" height="2" fill="#ffc48a" opacity="${(0.15 + r() * 0.4).toFixed(2)}"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>${DEFS}
  <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="790">
    <stop offset="0" stop-color="${C.navy4}"/><stop offset="0.35" stop-color="${C.navy}"/><stop offset="0.6" stop-color="#4b3d75"/><stop offset="0.78" stop-color="#c8603a"/><stop offset="0.92" stop-color="#ff9a4d"/><stop offset="1" stop-color="#ffc77a"/>
  </linearGradient>
  <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff2c7"/><stop offset="0.25" stop-color="#ffc36b"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient>
  <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3f63"/><stop offset="0.4" stop-color="${C.navy2}"/><stop offset="1" stop-color="${C.navy4}"/></linearGradient>
  <linearGradient id="trail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.orange}" stop-opacity="0"/><stop offset="1" stop-color="#ffb066"/></linearGradient>
  <linearGradient id="leftShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.navy4}" stop-opacity="0.9"/><stop offset="0.36" stop-color="${C.navy4}" stop-opacity="0.45"/><stop offset="0.5" stop-color="${C.navy4}" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<circle cx="2080" cy="740" r="520" fill="url(#sun)" opacity="0.9"/>
<circle cx="2080" cy="760" r="78" fill="#fff4d6"/>
<!-- far skyline -->
<g opacity="0.55">${skyline({ x0: 1150, x1: 2560, base: 770, rand: rng(3), color: "#3a2f5e", maxH: 200, lit: 0.06 })}</g>
<g>${skyline({ x0: 1250, x1: 2560, base: 790, rand: rng(5), color: "#24254f", maxH: 290, lit: 0.12, litColor: "#ffcf8a" })}</g>
<!-- sea -->
<rect y="780" width="${W}" height="${H - 780}" fill="url(#sea)"/>
<rect x="1990" y="790" width="180" height="300" fill="#ffc36b" opacity="0.45" filter="url(#blur20)"/>
${sparkles}
<!-- cruise ships at the port -->
${cruiseShip({ x: 1900, y: 655, w: 680, tone: "#efe6ea", windows: "#ffcf8a" })}
${cruiseShip({ x: 960, y: 712, w: 460, tone: "#cfc6d8", windows: "#ffcf8a" })}
<!-- causeway -->
<rect y="${road + 48}" width="${W}" height="20" fill="#0b1a33"/>
<rect y="${road + 36}" width="${W}" height="14" fill="#25324a"/>
${Array.from({ length: 26 }, (_, i) => `<rect x="${i * 104}" y="${road + 66}" width="34" height="140" fill="#0b1a33"/>`).join("")}
<rect y="${road - 6}" width="${W}" height="44" fill="#1b2840"/>
${Array.from({ length: 40 }, (_, i) => `<rect x="${i * 68}" y="${road + 12}" width="34" height="4" fill="#f5d68b" opacity="0.6"/>`).join("")}
<rect y="${road - 40}" width="${W}" height="6" fill="#33435f"/>
${Array.from({ length: 86 }, (_, i) => `<rect x="${i * 30}" y="${road - 40}" width="4" height="36" fill="#33435f"/>`).join("")}
<!-- palms on the causeway edge -->
${palm({ x: 2380, y: road - 40, h: 300, color: "#140f2b", lean: 5 })}${palm({ x: 2470, y: road - 40, h: 240, color: "#140f2b", lean: -4 })}
<!-- light trails + truck -->
${trails}
${boxTruck({ x: 1080, y: road - 278, s: 1.45, len: 320, glow: true })}
<!-- readable headline zone -->
<rect width="${W}" height="${H}" fill="url(#leftShade)"/>
</svg>`;

await render(svg, "public/images/marketing/hero-miami-sunrise.png", { w: W, h: H });
