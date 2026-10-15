/**
 * Branded email layout for every Express Bags message.
 * Table-based with inline CSS (Outlook/Gmail safe), dark-mode friendly (color-scheme meta,
 * solid backgrounds, light logo on navy), and the ONLY public contact details:
 * P.O. Box + office phone. Never the street address, mobile number or any staff name
 * (the assigned driver's first name is passed in by templates that are allowed to show it).
 */
import { company, contact } from "@/content/site";

export type Lang = "en" | "es";

export type EmailBlock = {
  /** Hidden inbox preview text */
  preheader: string;
  title: string;
  paragraphs: string[];
  /** Label/value rows rendered as a details card */
  details?: [string, string][];
  cta?: { label: string; url: string };
  /** Small grey note under the card (e.g. carrier tracking explanation) */
  footnote?: string;
  /** Unsubscribe URL (marketing-type messages only) */
  unsubscribeUrl?: string;
};

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Absolute site URL used for links and the hosted logo. */
export function siteUrl() {
  const base =
    process.env.PUBLIC_WEB_URL ||
    (process.env.NODE_ENV === "production" ? process.env.NEXT_PUBLIC_SITE_URL : undefined) ||
    (process.env.WEB_ORIGIN || "http://localhost:3000").split(",")[0];
  return (base || company.url).replace(/\/$/, "");
}

const FOOTER: Record<Lang, { reply: string; rights: string; unsubscribe: string }> = {
  en: { reply: "Questions? Call our office", rights: "All rights reserved.", unsubscribe: "Unsubscribe from marketing emails" },
  es: { reply: "¿Preguntas? Llame a nuestra oficina", rights: "Todos los derechos reservados.", unsubscribe: "Cancelar correos promocionales" },
};

export function renderEmailHtml(b: EmailBlock, lang: Lang) {
  const f = FOOTER[lang];
  const logo = `${siteUrl()}/brand/express-bags-logo-reversed.png`;
  const details = b.details?.length
    ? `<tr><td style="padding:4px 32px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6fb;border-radius:12px">
${b.details
  .map(
    ([k, v], i) =>
      `<tr><td style="padding:${i === 0 ? "16px" : "8px"} 18px ${i === b.details!.length - 1 ? "16px" : "8px"};font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#616e7c;width:38%;vertical-align:top">${esc(k)}</td><td style="padding:${i === 0 ? "16px" : "8px"} 18px ${i === b.details!.length - 1 ? "16px" : "8px"};font-size:15px;color:#002858;font-weight:bold;vertical-align:top">${esc(v)}</td></tr>`,
  )
  .join("")}
</table></td></tr>`
    : "";
  const cta = b.cta
    ? `<tr><td style="padding:16px 32px 8px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#E06010;border-radius:999px"><a href="${esc(b.cta.url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px">${esc(b.cta.label)}</a></td></tr></table></td></tr>`
    : "";
  const footnote = b.footnote ? `<tr><td style="padding:8px 32px 0;font-size:13px;line-height:1.5;color:#616e7c">${esc(b.footnote)}</td></tr>` : "";
  const unsub = b.unsubscribeUrl
    ? `<br><a href="${esc(b.unsubscribeUrl)}" style="color:#616e7c;text-decoration:underline">${esc(f.unsubscribe)}</a>`
    : "";

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(b.title)}</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(b.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#002858;padding:22px 32px"><img src="${logo}" width="150" alt="${esc(company.name)}" style="display:block;height:auto;border:0"></td></tr>
<tr><td style="height:4px;background:#E06010;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:30px 32px 6px"><h1 style="margin:0;font-size:22px;line-height:1.3;color:#002858">${esc(b.title)}</h1></td></tr>
${b.paragraphs.map((p) => `<tr><td style="padding:10px 32px 4px;font-size:15px;line-height:1.6;color:#1f2933">${esc(p)}</td></tr>`).join("\n")}
${details}
${cta}
${footnote}
<tr><td style="padding:28px 32px 0"></td></tr>
<tr><td style="padding:20px 32px;background:#00142d;color:#c9d3df;font-size:12px;line-height:1.6">
<strong style="color:#ffffff">${esc(company.tagline)}</strong><br>
${esc(f.reply)}: <a href="${contact.phoneHref}" style="color:#ffffff;text-decoration:none">${esc(contact.phoneDisplay)}</a><br>
${esc(contact.addressLine)} · ${esc(lang === "es" ? "Visitas solo con cita previa" : contact.visits)}<br>
© ${new Date().getFullYear()} ${esc(company.name)} ${esc(f.rights)}${unsub}
</td></tr>
</table></td></tr></table></body></html>`;
}

export function renderEmailText(b: EmailBlock, lang: Lang) {
  const f = FOOTER[lang];
  const lines = [b.title, "", ...b.paragraphs.flatMap((p) => [p, ""])];
  if (b.details?.length) lines.push(...b.details.map(([k, v]) => `${k}: ${v}`), "");
  if (b.cta) lines.push(`${b.cta.label}: ${b.cta.url}`, "");
  if (b.footnote) lines.push(b.footnote, "");
  lines.push("--", company.name, `${f.reply}: ${contact.phoneDisplay}`, contact.addressLine);
  if (b.unsubscribeUrl) lines.push(`${f.unsubscribe}: ${b.unsubscribeUrl}`);
  return lines.join("\n");
}
