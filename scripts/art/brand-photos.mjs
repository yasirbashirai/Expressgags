/**
 * Brand the client's AI-generated photos and export web-ready JPEGs:
 *  - perspective-warps the REAL Express Bags logo onto blank truck panels (homography + bilinear sampling)
 *  - blends with "multiply" so the panel's own light and shadow stay visible (looks printed, not pasted)
 *  - writes optimized JPEGs to public/images/site/
 * Source folder: ../express-bags-client/images (originals untouched).
 */
import sharp from "sharp";

const SRC = "../express-bags-client/images";
const OUT = "public/images/site";
const LOGO = "public/brand/express-bags-logo-transparent.png";

/** Solve the 3×3 homography mapping 4 src points → 4 dst points. */
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Gaussian elimination
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < 8; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = new Array(8);
  for (let r = 7; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < 8; k++) s -= A[r][k] * h[k];
    h[r] = s / A[r][r];
  }
  return [...h, 1];
}

/** Render the logo warped into dst quad [TL, TR, BR, BL]; returns {buffer, left, top, width, height} RGBA overlay. */
async function warpedLogo(dstQuad, opacity = 0.96) {
  const { data: L, info } = await sharp(LOGO).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const lw = info.width, lh = info.height;
  // inverse mapping: dst → src
  const H = homography(dstQuad, [[0, 0], [lw, 0], [lw, lh], [0, lh]]);
  const xs = dstQuad.map((p) => p[0]), ys = dstQuad.map((p) => p[1]);
  const left = Math.floor(Math.min(...xs)), top = Math.floor(Math.min(...ys));
  const width = Math.ceil(Math.max(...xs)) - left, height = Math.ceil(Math.max(...ys)) - top;
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const X = x + left + 0.5, Y = y + top + 0.5;
      const w = H[6] * X + H[7] * Y + H[8];
      const u = (H[0] * X + H[1] * Y + H[2]) / w, v = (H[3] * X + H[4] * Y + H[5]) / w;
      if (u < 0 || v < 0 || u >= lw - 1 || v >= lh - 1) continue;
      const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const p = (yy, xx) => L[(yy * lw + xx) * 4 + c];
        const val = p(y0, x0) * (1 - fx) * (1 - fy) + p(y0, x0 + 1) * fx * (1 - fy) + p(y0 + 1, x0) * (1 - fx) * fy + p(y0 + 1, x0 + 1) * fx * fy;
        out[o + c] = c === 3 ? Math.round(val * opacity) : Math.round(val);
      }
    }
  return { buffer: out, left, top, width, height };
}

async function brand(file, outName, quads, { width } = {}) {
  let img = sharp(`${SRC}/${file}`);
  if (quads.length) {
    const layers = [];
    for (const q of quads) {
      const w = await warpedLogo(q);
      layers.push({ input: w.buffer, raw: { width: w.width, height: w.height, channels: 4 }, left: w.left, top: w.top, blend: "multiply" });
    }
    img = sharp(await img.composite(layers).png().toBuffer());
  }
  if (width) img = img.resize({ width, withoutEnlargement: true });
  await img.jpeg({ quality: 84, mozjpeg: true, progressive: true }).toFile(`${OUT}/${outName}.jpg`);
  const m = await sharp(`${OUT}/${outName}.jpg`).metadata();
  console.log(`${outName}.jpg ${m.width}×${m.height}`);
}

// Quads are [TL, TR, BR, BL] in source-pixel coordinates, measured on each truck's blank side panel.
await brand("Sunrise Logistics on the Waterfront.png", "hero-sunrise-waterfront", [[[1280, 410], [1535, 356], [1535, 468], [1280, 502]]]);
await brand("Sunset Bridge Drive with Delivery Truck.png", "keys-bridge-sunset", [[[772, 560], [970, 566], [970, 648], [772, 642]]]);
await brand("Luxury Resort Valet at Night.png", "hero-resort-valet-night", []);
await brand("Cruise Port Logistics by the Skyline.png", "cruise-port-terminal", []);
await brand("Luggage QR Scan Confirmed.png", "qr-scan-chain-of-custody", []);
