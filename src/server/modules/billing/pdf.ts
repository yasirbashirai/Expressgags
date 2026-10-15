/**
 * Branded PDF documents (pdf-lib): invoices and quotations.
 * Public contact on documents = P.O. Box + office phone ONLY (never the street address or a mobile).
 * Quotation PDFs never include internal cost or margin.
 *
 * Exports used by other modules: renderInvoicePdf(invoiceId), renderQuotationPdf(quotationId).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { company, contact } from "@/content/site";
import { prisma } from "../../db";
import { HttpError } from "../../lib/errors";
import { fmtUsd } from "./money";

const NAVY = rgb(0, 40 / 255, 88 / 255);
const ORANGE = rgb(224 / 255, 96 / 255, 16 / 255);
const INK = rgb(31 / 255, 41 / 255, 51 / 255);
const MUTED = rgb(97 / 255, 110 / 255, 124 / 255);
const LINE = rgb(228 / 255, 231 / 255, 235 / 255);
const CLOUD = rgb(245 / 255, 247 / 255, 250 / 255);

const W = 612; // US Letter
const H = 792;
const M = 48;

/** Standard PDF fonts only support WinAnsi; normalize smart punctuation and drop anything else. */
function safe(s: string | null | undefined) {
  return (s ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/…/g, "...")
    .replace(/[•·]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const para of safe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > width && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

type Ctx = { doc: PDFDocument; page: PDFPage; y: number; regular: PDFFont; bold: PDFFont; logo?: Awaited<ReturnType<PDFDocument["embedPng"]>> };

async function start(title: string, docNumber: string): Promise<Ctx> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${title} ${docNumber}`);
  doc.setAuthor(company.name);
  doc.setCreator(company.name);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo;
  try {
    logo = await doc.embedPng(await readFile(join(process.cwd(), "public/brand/express-bags-logo.png")));
  } catch {
    /* logo optional (e.g. tests running elsewhere) */
  }
  const ctx: Ctx = { doc, page: doc.addPage([W, H]), y: H, regular, bold, logo };
  header(ctx, title, docNumber);
  return ctx;
}

function header(ctx: Ctx, title: string, docNumber: string) {
  const { page, bold, regular, logo } = ctx;
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: ORANGE });
  if (logo) {
    const lw = 150;
    page.drawImage(logo, { x: M, y: H - 30 - (lw * logo.height) / logo.width, width: lw, height: (lw * logo.height) / logo.width });
  } else {
    page.drawText(company.name, { x: M, y: H - 60, size: 18, font: bold, color: NAVY });
  }
  page.drawText(safe(title.toUpperCase()), { x: W - M - bold.widthOfTextAtSize(title.toUpperCase(), 20), y: H - 52, size: 20, font: bold, color: NAVY });
  page.drawText(safe(docNumber), { x: W - M - regular.widthOfTextAtSize(docNumber, 10), y: H - 68, size: 10, font: regular, color: MUTED });
  const contactLine = `${contact.addressLine}  |  ${contact.phoneDisplay}  |  ${company.url.replace("https://", "")}`;
  page.drawText(safe(contactLine), { x: M, y: H - 106, size: 8.5, font: regular, color: MUTED });
  page.drawLine({ start: { x: M, y: H - 116 }, end: { x: W - M, y: H - 116 }, thickness: 0.8, color: LINE });
  ctx.y = H - 140;
}

function ensure(ctx: Ctx, needed: number, title: string, docNumber: string) {
  if (ctx.y - needed < 90) {
    footer(ctx);
    ctx.page = ctx.doc.addPage([W, H]);
    header(ctx, title, docNumber);
  }
}

function footer(ctx: Ctx) {
  const { page, regular } = ctx;
  const text = `${company.name}  -  ${company.tagline}`;
  page.drawLine({ start: { x: M, y: 58 }, end: { x: W - M, y: 58 }, thickness: 0.6, color: LINE });
  page.drawText(safe(text), { x: M, y: 42, size: 8, font: regular, color: MUTED });
  page.drawText(safe(contact.visits), { x: W - M - regular.widthOfTextAtSize(contact.visits, 8), y: 42, size: 8, font: regular, color: MUTED });
}

function labelValue(ctx: Ctx, x: number, label: string, lines: string[], width = 230) {
  const { page, bold, regular } = ctx;
  page.drawText(safe(label.toUpperCase()), { x, y: ctx.y, size: 7.5, font: bold, color: ORANGE });
  let y = ctx.y - 14;
  for (const l of lines.flatMap((t) => wrap(t, regular, 10, width))) {
    page.drawText(l, { x, y, size: 10, font: regular, color: INK });
    y -= 13;
  }
  return y;
}

type Row = { description: string; qty: string; unit: string; amount: string };

function table(ctx: Ctx, rows: Row[], title: string, docNumber: string) {
  const cols = { desc: M, qty: 360, unit: 420, amount: W - M };
  const drawHead = () => {
    ctx.page.drawRectangle({ x: M, y: ctx.y - 6, width: W - 2 * M, height: 22, color: NAVY });
    const t = (s: string, x: number, right = false) =>
      ctx.page.drawText(s, { x: right ? x - ctx.bold.widthOfTextAtSize(s, 8.5) - 8 : x + 8, y: ctx.y + 1, size: 8.5, font: ctx.bold, color: rgb(1, 1, 1) });
    t("DESCRIPTION", cols.desc);
    t("QTY", cols.qty);
    t("RATE", cols.unit);
    t("AMOUNT", cols.amount, true);
    ctx.y -= 26;
  };
  drawHead();
  rows.forEach((r, i) => {
    const desc = wrap(r.description, ctx.regular, 9.5, 300);
    const h = desc.length * 12 + 8;
    if (ctx.y - h < 110) {
      footer(ctx);
      ctx.page = ctx.doc.addPage([W, H]);
      header(ctx, title, docNumber);
      drawHead();
    }
    if (i % 2 === 1) ctx.page.drawRectangle({ x: M, y: ctx.y - h + 10, width: W - 2 * M, height: h, color: CLOUD });
    desc.forEach((d, j) => ctx.page.drawText(d, { x: cols.desc + 8, y: ctx.y - j * 12, size: 9.5, font: ctx.regular, color: INK }));
    ctx.page.drawText(safe(r.qty), { x: cols.qty + 8, y: ctx.y, size: 9.5, font: ctx.regular, color: INK });
    ctx.page.drawText(safe(r.unit), { x: cols.unit + 8, y: ctx.y, size: 9.5, font: ctx.regular, color: INK });
    ctx.page.drawText(safe(r.amount), { x: cols.amount - 8 - ctx.regular.widthOfTextAtSize(safe(r.amount), 9.5), y: ctx.y, size: 9.5, font: ctx.regular, color: INK });
    ctx.y -= h;
  });
  ctx.page.drawLine({ start: { x: M, y: ctx.y + 4 }, end: { x: W - M, y: ctx.y + 4 }, thickness: 0.8, color: LINE });
  ctx.y -= 10;
}

function totals(ctx: Ctx, rows: [string, string, boolean?][]) {
  for (const [label, value, strong] of rows) {
    const font = strong ? ctx.bold : ctx.regular;
    const size = strong ? 12 : 10;
    if (strong) ctx.page.drawRectangle({ x: 340, y: ctx.y - 7, width: W - M - 340, height: 22, color: CLOUD });
    ctx.page.drawText(safe(label), { x: 350, y: ctx.y, size, font, color: strong ? NAVY : MUTED });
    ctx.page.drawText(safe(value), { x: W - M - 8 - font.widthOfTextAtSize(safe(value), size), y: ctx.y, size, font, color: strong ? NAVY : INK });
    ctx.y -= strong ? 26 : 16;
  }
}

function paragraph(ctx: Ctx, heading: string, text: string, title: string, docNumber: string) {
  const lines = wrap(text, ctx.regular, 9.5, W - 2 * M);
  ensure(ctx, 30 + lines.length * 12, title, docNumber);
  ctx.page.drawText(safe(heading.toUpperCase()), { x: M, y: ctx.y, size: 7.5, font: ctx.bold, color: ORANGE });
  ctx.y -= 14;
  for (const l of lines) {
    ensure(ctx, 14, title, docNumber);
    ctx.page.drawText(l, { x: M, y: ctx.y, size: 9.5, font: ctx.regular, color: INK });
    ctx.y -= 12;
  }
  ctx.y -= 10;
}

const dateStr = (d: Date | null | undefined) => (d ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "-");
const qtyStr = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(2));

export async function renderInvoicePdf(invoiceId: string): Promise<Uint8Array> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lines: { orderBy: { sortOrder: "asc" } }, customer: true, company: true },
  });
  if (!inv) throw new HttpError(404, "Invoice not found.");
  const title = "Invoice";
  const ctx = await start(title, inv.number);

  const billTo = [inv.company?.name ?? inv.customer.name, inv.company ? `Attn: ${inv.customer.name}` : "", inv.company?.billingEmail ?? inv.customer.email].filter(Boolean);
  const yEnd1 = labelValue(ctx, M, "Bill to", billTo);
  const meta = [`Issued: ${dateStr(inv.issuedAt ?? inv.createdAt)}`, `Due: ${dateStr(inv.dueAt)}`, inv.poNumber ? `PO: ${inv.poNumber}` : "", inv.costCenter ? `Cost center: ${inv.costCenter}` : ""].filter(Boolean);
  const yEnd2 = labelValue(ctx, 330, "Details", meta);
  ctx.y = Math.min(yEnd1, yEnd2) - 16;

  table(
    ctx,
    inv.lines.map((l) => ({ description: l.description, qty: qtyStr(l.quantity), unit: fmtUsd(l.unitCents), amount: fmtUsd(l.totalCents) })),
    title,
    inv.number,
  );
  ensure(ctx, 110, title, inv.number);
  const balance = inv.totalCents - inv.paidCents;
  totals(ctx, [
    ["Subtotal", fmtUsd(inv.subtotalCents)],
    ...(inv.taxCents ? ([["Tax", fmtUsd(inv.taxCents)]] as [string, string][]) : []),
    ["Total", fmtUsd(inv.totalCents)],
    ["Paid", fmtUsd(inv.paidCents)],
    ["Balance due", fmtUsd(balance), true],
  ]);
  ctx.y -= 8;
  paragraph(
    ctx,
    "How to pay",
    `Pay online securely with the link in your invoice email, or contact our office at ${contact.phoneDisplay} for ACH or check instructions. Please include invoice number ${inv.number} with your payment.`,
    title,
    inv.number,
  );
  if (inv.notes) paragraph(ctx, "Notes", inv.notes, title, inv.number);
  footer(ctx);
  return ctx.doc.save();
}

export async function renderQuotationPdf(quotationId: string): Promise<Uint8Array> {
  const q = await prisma.quotation.findUnique({ where: { id: quotationId }, include: { lines: { orderBy: { sortOrder: "asc" } }, customer: { include: { company: true } } } });
  if (!q) throw new HttpError(404, "Quotation not found.");
  const title = "Quotation";
  const ctx = await start(title, q.reference);

  ctx.page.drawText(safe(q.title), { x: M, y: ctx.y, size: 15, font: ctx.bold, color: NAVY });
  ctx.y -= 26;
  const yEnd1 = labelValue(ctx, M, "Prepared for", [q.customer.company?.name ?? "", q.customer.name, q.customer.email].filter(Boolean));
  const yEnd2 = labelValue(ctx, 330, "Quotation", [`Date: ${dateStr(q.sentAt ?? q.createdAt)}`, `Valid until: ${dateStr(q.validUntil)}`]);
  ctx.y = Math.min(yEnd1, yEnd2) - 16;

  // Customer-facing lines only: description, quantity, unit price, total (never unit cost)
  table(
    ctx,
    q.lines.map((l) => ({ description: l.description, qty: `${qtyStr(l.quantity)}${l.unit ? ` ${l.unit}` : ""}`, unit: fmtUsd(l.unitCents), amount: fmtUsd(l.totalCents) })),
    title,
    q.reference,
  );
  ensure(ctx, 110, title, q.reference);
  totals(ctx, [
    ["Subtotal", fmtUsd(q.subtotalCents)],
    ...(q.discountCents ? ([["Discount", `-${fmtUsd(q.discountCents)}`]] as [string, string][]) : []),
    ...(q.taxCents ? ([["Tax", fmtUsd(q.taxCents)]] as [string, string][]) : []),
    ["Total", fmtUsd(q.totalCents), true],
    ...(q.depositCents ? ([["Deposit due on acceptance", fmtUsd(q.depositCents)]] as [string, string][]) : []),
  ]);
  ctx.y -= 8;
  if (q.scope) paragraph(ctx, "Scope, assumptions and change policy", q.scope, title, q.reference);
  if (q.terms) paragraph(ctx, "Terms", q.terms, title, q.reference);
  paragraph(
    ctx,
    "Acceptance",
    q.acceptedAt
      ? `Accepted electronically by ${q.acceptedName}${q.acceptedTitle ? `, ${q.acceptedTitle}` : ""} on ${new Date(q.acceptedAt).toUTCString()}.`
      : "Accept this quotation online using the secure link in your email. Every route, time window, vehicle and access requirement is confirmed by our dispatch team.",
    title,
    q.reference,
  );
  footer(ctx);
  return ctx.doc.save();
}
