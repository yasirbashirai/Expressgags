// Builds logo variants from the client-supplied PNG (white background, no alpha):
//  - express-bags-logo-transparent.png : white -> transparent (for light/colored backgrounds)
//  - express-bags-logo-reversed.png    : navy -> white, transparent bg (for navy/dark backgrounds)
//  - icon-512.png / icon-192.png / apple-touch-icon.png : orbit mark on navy tile
import sharp from "sharp";

const SRC = "public/brand/express-bags-logo.png";
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

function variant(transform) {
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const [r, g, b] = [out[i], out[i + 1], out[i + 2]];
    // distance from white -> alpha (soft edges)
    const whiteness = Math.min(r, g, b);
    const alpha = Math.max(0, Math.min(255, Math.round((255 - whiteness) * 1.6)));
    out[i + 3] = alpha;
    transform(out, i, r, g, b);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });
}

await variant(() => {}).png().toFile("public/brand/express-bags-logo-transparent.png");
await variant((o, i, r, g, b) => {
  // navy-ish pixels (blue dominant, dark) become white; orange stays
  const isNavy = b > r && r < 120;
  if (isNavy) { o[i] = 255; o[i + 1] = 255; o[i + 2] = 255; }
}).png().toFile("public/brand/express-bags-logo-reversed.png");

// Square app icon: crop the orbit mark (left ~40% of the logo) onto a white tile
const mark = await sharp(SRC).extract({ left: 0, top: 0, width: 248, height: 170 }).toBuffer();
for (const [name, size] of [["icon-512.png", 512], ["icon-192.png", 192], ["apple-touch-icon.png", 180]]) {
  const inner = Math.round(size * 0.82);
  const m = await sharp(mark).resize(inner, inner, { fit: "contain", background: "#ffffff" }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } })
    .composite([{ input: m, gravity: "center" }]).png().toFile(`public/brand/${name}`);
}
console.log("logo variants written");
