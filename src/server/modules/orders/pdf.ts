/**
 * Printable documents for operations:
 *  - Bag tags (4x6 thermal label, or letter sheet with 2 tags) with a QR code that encodes the piece ID.
 *    The driver app scans these at pickup, storage intake, carrier handoff and delivery.
 *  - Group manifest (letter) listing every piece with a check-off column for pickup and delivery counts.
 * Built with pdf-lib (no headless browser needed on the server).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { company, contact } from "@/content/site";
import { STATUS_LABEL } from "../../services/orders";

const NAVY = rgb(0, 40 / 255, 88 / 255);
const ORANGE = rgb(224 / 255, 96 / 255, 16 / 255);
const INK = rgb(31 / 255, 41 / 255, 51 / 255);
const MUTED = rgb(97 / 255, 110 / 255, 124 / 255);

type Stop = { type?: string; address?: string; facility?: string; market?: string };
export type TagOrder = {
  reference: string;
  serviceDate: Date;
  timeWindow: string | null;
  pickup: unknown;
  delivery: unknown;
  guestName: string | null;
  guestRoom: string | null;
  status: keyof typeof STATUS_LABEL;
  specialHandling: string | null;
  customer: { name: string };
  pieces: { pieceId: string; category: string; description: string | null; weightLbs: number | null; lengthIn: number | null; widthIn: number | null; heightIn: number | null; status: string }[];
};

/** pdf-lib standard fonts only support WinAnsi; replace anything else so rendering never throws. */
const safe = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

function fit(font: PDFFont, text: string, size: number, maxWidth: number) {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1);
  return `${t}...`;
}

const shortStop = (s: unknown) => {
  const st = (s ?? {}) as Stop;
  return [st.facility, st.address].filter(Boolean).join(" - ") || "See job ticket";
};

const category = (c: string) =>
  ({ "carry-on": "Carry-on", "standard-checked": "Checked", large: "Large", oversized: "Oversized", special: "Special item", cargo: "Cargo" })[c] ?? c;

let logoBytes: Uint8Array | null = null;
async function logo(doc: PDFDocument): Promise<PDFImage | null> {
  try {
    logoBytes ??= new Uint8Array(await readFile(join(process.cwd(), "public/brand/express-bags-logo.png")));
    return await doc.embedPng(logoBytes);
  } catch {
    return null;
  }
}

async function qrImage(doc: PDFDocument, text: string) {
  const png = await QRCode.toBuffer(text, { errorCorrectionLevel: "M", margin: 1, width: 360, color: { dark: "#001d40", light: "#ffffff" } });
  return doc.embedPng(png);
}

/** Draws one tag inside the box (x, y = bottom-left; w x h in points). */
async function drawTag(doc: PDFDocument, page: PDFPage, o: TagOrder, idx: number, box: { x: number; y: number; w: number; h: number }, fonts: { bold: PDFFont; reg: PDFFont }, img: PDFImage | null) {
  const { x, y, w, h } = box;
  const piece = o.pieces[idx];
  const pad = 14;
  page.drawRectangle({ x, y, width: w, height: h, borderColor: NAVY, borderWidth: 1.2 });
  // Header band
  page.drawRectangle({ x, y: y + h - 46, width: w, height: 46, color: NAVY });
  if (img) {
    const scale = 34 / img.height;
    page.drawRectangle({ x: x + pad - 4, y: y + h - 42, width: img.width * scale + 8, height: 38, color: rgb(1, 1, 1) });
    page.drawImage(img, { x: x + pad, y: y + h - 40, width: img.width * scale, height: 34 });
  }
  page.drawText(safe(`${idx + 1} of ${o.pieces.length}`), { x: x + w - pad - fonts.bold.widthOfTextAtSize(`${idx + 1} of ${o.pieces.length}`, 15), y: y + h - 30, size: 15, font: fonts.bold, color: rgb(1, 1, 1) });

  // QR (encodes the piece ID — the driver app resolves it via the API)
  const qrSize = Math.min(w * 0.46, h * 0.42);
  const qr = await qrImage(doc, piece.pieceId);
  page.drawImage(qr, { x: x + pad, y: y + h - 58 - qrSize, width: qrSize, height: qrSize });

  // Piece identity next to the QR
  const tx = x + pad * 2 + qrSize;
  const tw = w - (tx - x) - pad;
  let ty = y + h - 72;
  page.drawText("PIECE ID", { x: tx, y: ty, size: 7, font: fonts.bold, color: MUTED });
  ty -= 15;
  page.drawText(fit(fonts.bold, piece.pieceId, 12, tw), { x: tx, y: ty, size: 12, font: fonts.bold, color: NAVY });
  ty -= 20;
  page.drawText("ORDER", { x: tx, y: ty, size: 7, font: fonts.bold, color: MUTED });
  ty -= 12;
  page.drawText(fit(fonts.reg, o.reference, 10, tw), { x: tx, y: ty, size: 10, font: fonts.reg, color: INK });
  ty -= 18;
  page.drawText("ITEM", { x: tx, y: ty, size: 7, font: fonts.bold, color: MUTED });
  ty -= 12;
  page.drawText(fit(fonts.reg, category(piece.category), 10, tw), { x: tx, y: ty, size: 10, font: fonts.reg, color: INK });

  // Route & guest details
  let by = y + h - 70 - qrSize;
  const line = (label: string, value: string, size = 10) => {
    page.drawText(label, { x: x + pad, y: by, size: 7, font: fonts.bold, color: MUTED });
    by -= size + 3;
    page.drawText(fit(fonts.bold, value, size, w - pad * 2), { x: x + pad, y: by, size, font: fonts.bold, color: INK });
    by -= 13;
  };
  if (o.guestName) line("GUEST", `${o.guestName}${o.guestRoom ? `  ·  Room ${o.guestRoom}` : ""}`, 12);
  else line("CLIENT", o.customer.name);
  line("DELIVER TO", shortStop(o.delivery), 12);
  line("FROM", shortStop(o.pickup), 9);
  const date = o.serviceDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  line("SERVICE DATE", `${date}${o.timeWindow ? ` · ${o.timeWindow.replace("-", " ")}` : ""}`, 9);
  if (piece.description) line("NOTE", piece.description, 8);

  // Footer: orange flight line + office phone
  page.drawRectangle({ x: x + pad, y: y + 26, width: w - pad * 2, height: 1.5, color: ORANGE });
  page.drawText(safe(`${company.name}  ·  ${contact.phoneDisplay}`), { x: x + pad, y: y + 12, size: 8, font: fonts.reg, color: MUTED });
}

/** Bag tags: layout "4x6" = one tag per 4x6 in page; "letter" = two tags per US-letter page. */
export async function bagTagsPdf(o: TagOrder, layout: "4x6" | "letter" = "4x6") {
  const doc = await PDFDocument.create();
  doc.setTitle(`Bag tags ${o.reference}`);
  doc.setAuthor(company.name);
  const fonts = { bold: await doc.embedFont(StandardFonts.HelveticaBold), reg: await doc.embedFont(StandardFonts.Helvetica) };
  const img = await logo(doc);
  if (layout === "4x6") {
    for (let i = 0; i < o.pieces.length; i++) {
      const page = doc.addPage([288, 432]);
      await drawTag(doc, page, o, i, { x: 8, y: 8, w: 272, h: 416 }, fonts, img);
    }
  } else {
    for (let i = 0; i < o.pieces.length; i += 2) {
      const page = doc.addPage([612, 792]);
      await drawTag(doc, page, o, i, { x: 36, y: 396, w: 540, h: 360 }, fonts, img);
      if (i + 1 < o.pieces.length) await drawTag(doc, page, o, i + 1, { x: 36, y: 24, w: 540, h: 360 }, fonts, img);
      page.drawLine({ start: { x: 18, y: 390 }, end: { x: 594, y: 390 }, thickness: 0.5, color: MUTED, dashArray: [4, 4] });
    }
  }
  return doc.save();
}

/** Letter-size manifest with pickup/delivery check-off columns (chain-of-custody paper backup). */
export async function manifestPdf(o: TagOrder) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Manifest ${o.reference}`);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const img = await logo(doc);
  const W = 612, H = 792, M = 40;
  let page = doc.addPage([W, H]);
  let y = H - M;

  const header = (first: boolean) => {
    if (img) {
      const s = 40 / img.height;
      page.drawImage(img, { x: M, y: y - 40, width: img.width * s, height: 40 });
    }
    page.drawText(first ? "Group manifest" : "Group manifest (continued)", { x: W - M - bold.widthOfTextAtSize(first ? "Group manifest" : "Group manifest (continued)", 16), y: y - 18, size: 16, font: bold, color: NAVY });
    page.drawText(safe(o.reference), { x: W - M - reg.widthOfTextAtSize(safe(o.reference), 10), y: y - 34, size: 10, font: reg, color: MUTED });
    y -= 60;
  };
  header(true);

  const meta: [string, string][] = [
    ["Client", o.customer.name],
    ["Service date", `${o.serviceDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${o.timeWindow ? ` · ${o.timeWindow}` : ""}`],
    ["Pickup", shortStop(o.pickup)],
    ["Delivery", shortStop(o.delivery)],
    ["Total pieces", String(o.pieces.length)],
    ["Status", STATUS_LABEL[o.status]],
  ];
  if (o.specialHandling) meta.push(["Special handling", o.specialHandling]);
  for (const [k, v] of meta) {
    page.drawText(k.toUpperCase(), { x: M, y, size: 7, font: bold, color: MUTED });
    page.drawText(fit(reg, v, 10, W - M * 2 - 110), { x: M + 110, y, size: 10, font: reg, color: INK });
    y -= 15;
  }
  y -= 8;

  const cols = [
    { label: "#", x: M, w: 26 },
    { label: "PIECE ID", x: M + 26, w: 150 },
    { label: "ITEM", x: M + 176, w: 80 },
    { label: "DESCRIPTION / GUEST", x: M + 256, w: 196 },
    { label: "PICKUP", x: M + 452, w: 40 },
    { label: "DELIVERED", x: M + 492, w: 40 },
  ];
  const tableHeader = () => {
    page.drawRectangle({ x: M, y: y - 4, width: W - M * 2, height: 18, color: rgb(0.95, 0.96, 0.98) });
    for (const c of cols) page.drawText(c.label, { x: c.x + 3, y: y + 1, size: 7, font: bold, color: NAVY });
    y -= 20;
  };
  tableHeader();
  o.pieces.forEach((p, i) => {
    if (y < M + 60) {
      page = doc.addPage([W, H]);
      y = H - M;
      header(false);
      tableHeader();
    }
    const vals = [String(i + 1), p.pieceId, category(p.category), p.description ?? "", "", ""];
    cols.forEach((c, ci) => {
      if (ci >= 4) page.drawRectangle({ x: c.x + 12, y: y - 2, width: 11, height: 11, borderColor: MUTED, borderWidth: 0.8 });
      else page.drawText(fit(ci === 1 ? bold : reg, vals[ci], 8.5, c.w - 6), { x: c.x + 3, y, size: 8.5, font: ci === 1 ? bold : reg, color: INK });
    });
    page.drawLine({ start: { x: M, y: y - 5 }, end: { x: W - M, y: y - 5 }, thickness: 0.3, color: rgb(0.89, 0.9, 0.92) });
    y -= 16;
  });

  y -= 20;
  if (y < M + 70) {
    page = doc.addPage([W, H]);
    y = H - M - 20;
  }
  for (const label of ["Picked up by / count / time", "Received by (print name) / count / time"]) {
    page.drawLine({ start: { x: M, y }, end: { x: M + 300, y }, thickness: 0.6, color: INK });
    page.drawText(label, { x: M, y: y - 11, size: 7.5, font: reg, color: MUTED });
    y -= 40;
  }
  doc.getPages().forEach((pg, i, all) =>
    pg.drawText(safe(`${company.name} · ${contact.phoneDisplay} · Page ${i + 1} of ${all.length}`), { x: M, y: 20, size: 7.5, font: reg, color: MUTED }),
  );
  return doc.save();
}
