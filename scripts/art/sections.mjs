/** Section images (1600×1200): cruise terminal aerial, QR chain-of-custody close-up, Florida Keys bridge at sunset. */
import QRCode from "qrcode";
import { C, DEFS, LOGO, boxTruck, palm, render, rng } from "./lib.mjs";

const W = 1600, H = 1200;

/* ------------------------------------------------------------------ */
/* 3. Cruise terminal, top-down: ship, dock, three branded trucks, luggage rows */
/* ------------------------------------------------------------------ */
function topTruck(x, y, rot = 0) {
  // Roof view: white box roof with the logo, navy cab, orange stripe
  return `<g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-8" y="10" width="300" height="118" rx="10" fill="#000" opacity="0.25" filter="url(#blur6)"/>
    <rect width="230" height="110" rx="8" fill="#fff"/>
    <rect width="230" height="10" fill="${C.orange}"/><rect y="100" width="230" height="10" fill="${C.orange}"/>
    <image href="${LOGO}" x="18" y="26" width="194" height="${194 * (244 / 600)}"/>
    <rect x="236" y="8" width="58" height="94" rx="14" fill="${C.navy}"/>
    <rect x="262" y="18" width="24" height="74" rx="8" fill="#9fc3e8" opacity="0.85"/>
  </g>`;
}
function shipTop(x, y, len) {
  let decks = "";
  for (let i = 0; i < 9; i++) decks += `<rect x="${x + 120 + i * (len - 300) / 9}" y="${y + 40}" width="${(len - 300) / 9 - 14}" height="120" rx="10" fill="${i % 3 === 1 ? "#3cc6e0" : "#eef3f8"}"/>`;
  return `<g>
    <path d="M${x} ${y + 100} Q${x + 30} ${y} ${x + 180} ${y} H${x + len - 60} Q${x + len} ${y + 10} ${x + len} ${y + 100} Q${x + len} ${y + 190} ${x + len - 60} ${y + 200} H${x + 180} Q${x + 30} ${y + 200} ${x} ${y + 100}z" fill="#f4f7fa"/>
    <path d="M${x} ${y + 100} Q${x + 30} ${y} ${x + 180} ${y} H${x + len - 60} Q${x + len} ${y + 10} ${x + len} ${y + 100}" fill="none" stroke="${C.navy}" stroke-width="8"/>
    ${decks}
    <rect x="${x + len * 0.62}" y="${y + 70}" width="70" height="60" rx="12" fill="${C.navy}"/><rect x="${x + len * 0.62}" y="${y + 92}" width="70" height="14" fill="${C.orange}"/>
  </g>`;
}
async function cruiseAerial() {
  const r = rng(31);
  let bags = "";
  for (let row = 0; row < 4; row++)
    for (let i = 0; i < 16; i++) {
      const x = 180 + i * 62 + (row % 2) * 18, y = 980 + row * 46;
      const col = ["#1f2933", "#0a3a73", "#3a4553", "#5b6573", "#7a2e10"][Math.floor(r() * 5)];
      bags += `<rect x="${x}" y="${y}" width="44" height="30" rx="6" fill="${col}"/><rect x="${x + 34}" y="${y + 4}" width="8" height="10" rx="2" fill="${C.orange}"/>`;
    }
  let waves = "";
  for (let i = 0; i < 90; i++) waves += `<path d="M${(r() * W).toFixed(0)} ${(r() * 470).toFixed(0)} q14 -6 28 0" stroke="#fff" stroke-width="2" fill="none" opacity="${(0.15 + r() * 0.3).toFixed(2)}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${DEFS}<linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b7f9e"/><stop offset="1" stop-color="#2bb7c9"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="#c9d3de"/>
  <rect width="${W}" height="520" fill="url(#water)"/>${waves}
  ${shipTop(60, 230, 1480)}
  <rect y="510" width="${W}" height="30" fill="#8a97a8"/>
  <rect y="540" width="${W}" height="${H - 540}" fill="#d5dde6"/>
  ${Array.from({ length: 14 }, (_, i) => `<rect x="${i * 120 + 40}" y="700" width="70" height="8" fill="#fff" opacity="0.8"/>`).join("")}
  <rect y="880" width="${W}" height="10" fill="${C.orange}" opacity="0.8"/>
  ${topTruck(140, 590)}${topTruck(560, 590)}${topTruck(980, 590)}
  <rect x="160" y="960" width="1060" height="210" rx="16" fill="#bfc9d4"/>
  ${bags}
  <rect x="1260" y="930" width="300" height="240" rx="18" fill="${C.navy}"/>
  <text x="1410" y="1030" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#fff">BAGS STAGED</text>
  <text x="1410" y="1085" text-anchor="middle" font-family="Arial, sans-serif" font-size="56" font-weight="800" fill="${C.orange}">64 / 64</text>
  </svg>`;
  await render(svg, "public/images/marketing/section-cruise-terminal.png", { w: W, h: H });
}

/* ------------------------------------------------------------------ */
/* 4. Chain of custody close-up: gloved hand scanning a QR luggage tag */
/* ------------------------------------------------------------------ */
async function qrScan() {
  const qr = await QRCode.toString("EB-261015-7K3P-01", { type: "svg", margin: 0, color: { dark: "#0b1f3a", light: "#ffffff" } });
  const qrInner = qr.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const vb = qr.match(/viewBox="0 0 (\d+) (\d+)"/);
  const n = vb ? Number(vb[1]) : 33;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${DEFS}
    <radialGradient id="bg" cx="0.35" cy="0.4" r="0.9"><stop offset="0" stop-color="#173c6e"/><stop offset="1" stop-color="${C.navy4}"/></radialGradient>
    <linearGradient id="caseFace" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b3644"/><stop offset="1" stop-color="#151c25"/></linearGradient>
    <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b2b57"/><stop offset="1" stop-color="${C.navy4}"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- blurred truck interior: shelves of bags -->
  <g opacity="0.45" filter="url(#blur20)">
    ${Array.from({ length: 6 }, (_, i) => `<rect x="${60 + i * 250}" y="120" width="200" height="260" rx="20" fill="#2a3f60"/>`).join("")}
    <rect y="420" width="${W}" height="16" fill="${C.orange}"/>
  </g>
  <!-- suitcase -->
  <rect x="180" y="380" width="760" height="860" rx="60" fill="url(#caseFace)"/>
  ${[0.28, 0.5, 0.72].map((f) => `<rect x="${180 + 760 * f - 6}" y="420" width="12" height="780" rx="6" fill="#0d131a" opacity="0.6"/>`).join("")}
  <rect x="440" y="300" width="240" height="70" rx="26" fill="none" stroke="#3b4652" stroke-width="22"/>
  <!-- strap + tag -->
  <path d="M760 340 q60 40 60 140" stroke="#9aa7b6" stroke-width="10" fill="none"/>
  <g transform="rotate(-8 830 640)">
    <rect x="680" y="470" width="320" height="400" rx="26" fill="${C.orange}"/>
    <circle cx="840" cy="505" r="16" fill="${C.navy4}"/>
    <rect x="710" y="540" width="260" height="260" rx="14" fill="#fff"/>
    <g transform="translate(726 556) scale(${228 / n})">${qrInner}</g>
    <text x="840" y="845" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="30" fill="#fff">EB-…-01</text>
  </g>
  <!-- scan beam -->
  <path d="M1130 620 L860 560 L860 760 L1130 700 z" fill="${C.orange}" opacity="0.18"/>
  <line x1="700" y1="660" x2="1000" y2="660" stroke="#ffb066" stroke-width="5" opacity="0.9"/>
  <!-- phone in gloved hand -->
  <g transform="rotate(-14 1250 700)">
    <rect x="1090" y="430" width="300" height="580" rx="44" fill="#0b0f15"/>
    <rect x="1106" y="452" width="268" height="536" rx="32" fill="url(#screen)"/>
    <circle cx="1240" cy="640" r="82" fill="${C.orange}"/>
    <path d="M1200 640 l28 30 l54 -62" stroke="#fff" stroke-width="18" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="1240" y="790" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="34" fill="#fff">Scanned</text>
    <text x="1240" y="836" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#9fc3e8">Piece 1 of 8</text>
    <rect x="1150" y="880" width="180" height="12" rx="6" fill="#26456f"/><rect x="1150" y="880" width="28" height="12" rx="6" fill="${C.orange}"/>
  </g>
  <g transform="translate(40 110)">
  <path d="M1120 1200 q-30 -230 60 -330 q90 -60 200 -10 q120 70 220 40 l0 300z" fill="${C.navy}"/>
  <path d="M1170 900 q40 -60 110 -50" stroke="#13325e" stroke-width="40" fill="none" stroke-linecap="round"/>
  <path d="M1170 960 q50 -50 120 -40" stroke="#13325e" stroke-width="40" fill="none" stroke-linecap="round"/>
  </g>
  <rect x="1130" y="1150" width="470" height="20" fill="${C.orange}"/>
  </svg>`;
  await render(svg, "public/images/marketing/section-qr-custody.png", { w: W, h: H });
}

/* ------------------------------------------------------------------ */
/* 5. Florida Keys: 26-ft truck on the Overseas Highway at sunset */
/* ------------------------------------------------------------------ */
async function keysBridge() {
  const r = rng(51), deck = 700;
  let glints = "";
  for (let i = 0; i < 110; i++) glints += `<rect x="${(r() * W).toFixed(0)}" y="${(deck + 120 + r() * 360).toFixed(0)}" width="${(16 + r() * 70).toFixed(0)}" height="3" fill="#ffd0a0" opacity="${(0.1 + r() * 0.45).toFixed(2)}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${DEFS}
    <linearGradient id="sunset" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="640"><stop offset="0" stop-color="#1b2a63"/><stop offset="0.45" stop-color="#8a3f7c"/><stop offset="0.75" stop-color="#e2683a"/><stop offset="1" stop-color="#ffc173"/></linearGradient>
    <linearGradient id="sea2" gradientUnits="userSpaceOnUse" x1="0" y1="620" x2="0" y2="1200"><stop offset="0" stop-color="#f08a52"/><stop offset="0.25" stop-color="#1f8fa6"/><stop offset="1" stop-color="#063b55"/></linearGradient>
    <radialGradient id="sun2" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff3cf"/><stop offset="0.3" stop-color="#ffc173"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sunset)"/>
  <circle cx="1180" cy="600" r="300" fill="url(#sun2)"/><circle cx="1180" cy="610" r="64" fill="#fff4d6"/>
  <path d="M0 640 q200 -40 420 -6 t460 4 v20 h-880z" fill="#3b2a52" opacity="0.7"/>
  ${palm({ x: 160, y: 640, h: 150, color: "#2a1c3d" })}${palm({ x: 230, y: 640, h: 120, color: "#2a1c3d", lean: -3 })}
  <rect y="620" width="${W}" height="${H - 620}" fill="url(#sea2)"/>
  <rect x="1120" y="640" width="120" height="420" fill="#ffd9a0" opacity="0.35" filter="url(#blur20)"/>
  ${glints}
  <!-- long bridge -->
  ${Array.from({ length: 22 }, (_, i) => `<rect x="${i * 76}" y="${deck + 40}" width="22" height="220" fill="#0e2a44"/>`).join("")}
  <rect y="${deck + 30}" width="${W}" height="18" fill="#0e2a44"/>
  <rect y="${deck}" width="${W}" height="32" fill="#2c3b52"/>
  <rect y="${deck - 18}" width="${W}" height="5" fill="#5a6b85"/>
  ${Array.from({ length: 80 }, (_, i) => `<rect x="${i * 20}" y="${deck - 18}" width="3" height="20" fill="#5a6b85"/>`).join("")}
  ${boxTruck({ x: 430, y: deck - 300, s: 1.45, len: 380, glow: true })}
  </svg>`;
  await render(svg, "public/images/marketing/section-keys-bridge.png", { w: W, h: H });
}

await cruiseAerial();
await qrScan();
await keysBridge();
