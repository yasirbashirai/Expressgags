/**
 * Express Bags brand illustration kit (pure SVG → PNG via sharp).
 * Reusable pieces: trucks/van in brand livery carrying the REAL logo, skyline, palms, cruise ship, luggage.
 * Brand: navy #002858 · orange #E06010 · white · charcoal #1F2933.
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";

export const C = {
  navy: "#002858", navy2: "#0a3a73", navy3: "#001d40", navy4: "#00142d",
  orange: "#E06010", orange2: "#c4520b", orangeLight: "#ff8a3d", sand: "#faf7f2",
  white: "#ffffff", charcoal: "#1F2933", steel: "#cfd8e3", tire: "#151b23",
};

const b64 = (p) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
export const LOGO = b64("public/brand/express-bags-logo-transparent.png"); // 600×244
export const LOGO_REV = b64("public/brand/express-bags-logo-reversed.png");

/** Seeded random so renders are repeatable. */
export function rng(seed = 7) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Logo image that stays readable even when the parent vehicle is mirrored (flip=true). */
function logoImg(href, x, y, w, h, flip) {
  const img = `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  return flip ? `<g transform="translate(${2 * x + w} 0) scale(-1 1)">${img}</g>` : img;
}

function wheel(cx, cy, r) {
  return `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.tire}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="#8a96a6"/><circle cx="${cx}" cy="${cy}" r="${r * 0.22}" fill="#2a3340"/></g>`;
}

/**
 * Box truck, side view, facing right. Base size ≈ 430 × 205 units at scale 1 (box length set by `len`).
 * Logo sits on the white cargo box. Orange + navy livery stripes.
 */
export function boxTruck({ x = 0, y = 0, s = 1, len = 300, flip = false, glow = false } = {}) {
  const boxH = 150, cabW = 105;
  const W = len + cabW;
  const logoW = Math.min(len * 0.72, 230), logoH = logoW * (244 / 600);
  const t = `translate(${x} ${y}) scale(${flip ? -s : s} ${s})${flip ? ` translate(${-W} 0)` : ""}`;
  return `<g transform="${t}">
    <ellipse cx="${W / 2}" cy="${boxH + 50}" rx="${W * 0.55}" ry="9" fill="#000" opacity="0.28"/>
    <!-- cargo box -->
    <rect x="0" y="0" width="${len}" height="${boxH}" rx="7" fill="${C.white}"/>
    <rect x="0" y="0" width="${len}" height="${boxH}" rx="7" fill="url(#boxShade)"/>
    <rect x="0" y="${boxH - 30}" width="${len}" height="30" fill="${C.navy}"/>
    <rect x="0" y="${boxH - 36}" width="${len}" height="6" fill="${C.orange}"/>
    ${logoImg(LOGO, (len - logoW) / 2, (boxH - 36 - logoH) / 2, logoW, logoH, flip)}
    <rect x="6" y="${boxH}" width="${len - 12}" height="16" fill="${C.charcoal}"/>
    <!-- cab -->
    <path d="M${len + 4} 38 h${cabW - 38} q22 0 30 26 l8 40 v${boxH + 16 - 104} h-${cabW} z" fill="${C.navy}"/>
    <path d="M${len + 18} 50 h${cabW - 58} q14 0 19 18 l5 26 h-${cabW - 34} z" fill="#9fc3e8" opacity="0.9"/>
    <path d="M${len + 18} 50 h${cabW - 58} q14 0 19 18 l5 26 h-${cabW - 34} z" fill="url(#glass)"/>
    <rect x="${len + 4}" y="${boxH - 6}" width="${cabW}" height="6" fill="${C.orange}"/>
    <rect x="${W - 8}" y="${boxH - 26}" width="10" height="14" rx="2" fill="${glow ? "#fff6c9" : "#ffe9a8"}"/>
    ${glow ? `<path d="M${W + 2} ${boxH - 19} l260 -40 v90 z" fill="url(#beam)" opacity="0.55"/>` : ""}
    <rect x="${len + 2}" y="${boxH + 2}" width="${cabW + 2}" height="16" rx="3" fill="${C.charcoal}"/>
    ${wheel(62, boxH + 22, 24)}${wheel(len - 52, boxH + 22, 24)}${wheel(len + cabW - 30, boxH + 22, 24)}
  </g>`;
}

/** Cargo van (Sprinter-like), side view facing right, ≈ 360 × 170 units. */
export function van({ x = 0, y = 0, s = 1, flip = false } = {}) {
  const W = 360;
  const t = `translate(${x} ${y}) scale(${flip ? -s : s} ${s})${flip ? ` translate(${-W} 0)` : ""}`;
  return `<g transform="${t}">
    <ellipse cx="180" cy="168" rx="190" ry="8" fill="#000" opacity="0.3"/>
    <path d="M10 20 q0 -16 16 -16 h214 q26 0 44 20 l52 56 q14 6 14 24 v42 q0 10 -10 10 h-320 q-10 0 -10 -10 z" fill="${C.navy}"/>
    <path d="M250 18 h-10 v66 h92 l-42 -50 q-16 -16 -40 -16z" fill="#9fc3e8" opacity="0.85"/>
    <path d="M250 18 h-10 v66 h92 l-42 -50 q-16 -16 -40 -16z" fill="url(#glass)"/>
    <rect x="10" y="104" width="326" height="8" fill="${C.orange}"/>
    ${logoImg(LOGO_REV, 24, 24, 190, 190 * (244 / 600), flip)}
    <rect x="330" y="96" width="14" height="10" rx="2" fill="#ffe9a8"/>
    ${wheel(70, 146, 23)}${wheel(286, 146, 23)}
  </g>`;
}

/** Hard-shell suitcase with orange tag. */
export function suitcase({ x, y, w = 60, h = 90, color = C.charcoal, tag = true }) {
  return `<g transform="translate(${x} ${y})">
    <rect x="${w * 0.3}" y="-14" width="${w * 0.4}" height="16" rx="5" fill="none" stroke="#3b4652" stroke-width="5"/>
    <rect width="${w}" height="${h}" rx="9" fill="${color}"/>
    <rect width="${w}" height="${h}" rx="9" fill="url(#caseShine)"/>
    ${[0.25, 0.5, 0.75].map((f) => `<rect x="${w * f - 1.5}" y="6" width="3" height="${h - 12}" fill="#000" opacity="0.18"/>`).join("")}
    ${tag ? `<rect x="${w - 6}" y="${h * 0.2}" width="18" height="26" rx="3" fill="${C.orange}" transform="rotate(12 ${w} ${h * 0.2})"/>` : ""}
    <circle cx="${w * 0.2}" cy="${h + 4}" r="4" fill="#222"/><circle cx="${w * 0.8}" cy="${h + 4}" r="4" fill="#222"/>
  </g>`;
}

/** Palm tree silhouette. */
export function palm({ x, y, h = 260, color = "#00142d", lean = 6 }) {
  const top = { x: x + lean * 4, y: y - h };
  const fronds = [-150, -115, -80, -45, -10, 25]
    .map((a) => {
      const r = (a * Math.PI) / 180, L = h * 0.42;
      const ex = top.x + Math.cos(r) * L, ey = top.y + Math.sin(r) * L * 0.55 + L * 0.35;
      const cx = top.x + Math.cos(r) * L * 0.5, cy = top.y - L * 0.25;
      return `<path d="M${top.x} ${top.y} Q${cx} ${cy} ${ex} ${ey}" stroke="${color}" stroke-width="${h * 0.03}" fill="none" stroke-linecap="round"/>`;
    })
    .join("");
  return `<g><path d="M${x} ${y} Q${x + lean * 2} ${y - h * 0.5} ${top.x} ${top.y}" stroke="${color}" stroke-width="${h * 0.045}" fill="none" stroke-linecap="round"/>${fronds}</g>`;
}

/** Cruise ship, side view, facing left. Width ≈ w. */
export function cruiseShip({ x, y, w = 900, tone = "#e9eef5", windows = "#f9c784", dark = false }) {
  const h = w * 0.2;
  const rows = 6, cols = Math.round(w / 16);
  let win = "";
  for (let r = 0; r < rows; r++) {
    const yy = h * 0.18 + r * h * 0.085;
    const start = w * (0.12 + r * 0.025), end = w * (0.86 - r * 0.02);
    for (let c = 0; c < cols; c++) {
      const xx = start + ((end - start) * c) / cols;
      win += `<rect x="${xx.toFixed(1)}" y="${yy.toFixed(1)}" width="${(w / cols) * 0.55}" height="${h * 0.035}" fill="${windows}" opacity="${dark ? 0.9 : 0.55}"/>`;
    }
  }
  return `<g transform="translate(${x} ${y})">
    <path d="M${w * 0.1} ${h * 0.1} h${w * 0.78} l${w * 0.04} ${h * 0.55} h-${w * 0.86} z" fill="${tone}"/>
    <path d="M0 ${h * 0.62} h${w} l-${w * 0.06} ${h * 0.38} h-${w * 0.86} z" fill="${dark ? "#0a1f3a" : C.navy}"/>
    <rect x="0" y="${h * 0.6}" width="${w}" height="${h * 0.04}" fill="${C.orange}" opacity="0.9"/>
    <rect x="${w * 0.66}" y="-${h * 0.18}" width="${w * 0.07}" height="${h * 0.3}" rx="6" fill="${dark ? "#13294a" : C.navy}"/>
    <rect x="${w * 0.66}" y="-${h * 0.12}" width="${w * 0.07}" height="${h * 0.05}" fill="${C.orange}"/>
    ${win}
  </g>`;
}

/** City skyline silhouette band. */
export function skyline({ x0, x1, base, rand, color = "#0a2a52", maxH = 260, lit = 0.25, litColor = "#ffd28a" }) {
  let out = "", x = x0;
  while (x < x1) {
    const w = 30 + rand() * 70, h = 60 + rand() * maxH;
    out += `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}"/>`;
    if (rand() < 0.35) out += `<rect x="${(x + w * 0.4).toFixed(1)}" y="${(base - h - 24).toFixed(1)}" width="3" height="24" fill="${color}"/>`;
    for (let wy = base - h + 10; wy < base - 10; wy += 14)
      for (let wx = x + 6; wx < x + w - 8; wx += 11)
        if (rand() < lit) out += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="5" height="6" fill="${litColor}" opacity="${(0.4 + rand() * 0.6).toFixed(2)}"/>`;
    x += w + 4 + rand() * 10;
  }
  return out;
}

/** Shared gradient/filter defs used by the kit. */
export const DEFS = `
  <linearGradient id="boxShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#9fb2c8" stop-opacity="0.35"/></linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.75"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="caseShine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="0.4" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff3c4" stop-opacity="0.9"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></linearGradient>
  <filter id="blur6"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="blur20"><feGaussianBlur stdDeviation="20"/></filter>
  <filter id="blur60"><feGaussianBlur stdDeviation="60"/></filter>`;

export async function render(svg, out, { w, h }) {
  await sharp(Buffer.from(svg), { density: 96 }).resize(w, h).png({ compressionLevel: 9 }).toFile(out);
  console.log("wrote", out);
}
