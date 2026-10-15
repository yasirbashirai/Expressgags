/**
 * Transactional email. Uses SMTP when configured; otherwise logs the message (console + EmailLog)
 * so requests are never lost and nothing crashes in development.
 */
import nodemailer from "nodemailer";
import { prisma } from "../db";
import { env } from "./env";
import { company, contact } from "@/content/site";

export type Mail = { to: string; subject: string; text: string; html?: string; replyTo?: string };

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransport() {
  if (!env.smtp.host) return null;
  transporter ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  return transporter;
}

export async function sendMail(mail: Mail): Promise<"SENT" | "LOGGED" | "FAILED"> {
  const t = getTransport();
  let status: "SENT" | "LOGGED" | "FAILED" = "LOGGED";
  let error: string | undefined;
  if (!t) {
    console.info(`[email:logged] to=${mail.to} subject="${mail.subject}"`);
  } else {
    try {
      await t.sendMail({ from: env.smtp.from, ...mail });
      status = "SENT";
    } catch (e) {
      status = "FAILED";
      error = (e as Error).message;
      console.error("[email] send failed", error);
    }
  }
  try {
    await prisma.emailLog.create({ data: { to: mail.to, subject: mail.subject, status, error } });
  } catch {
    /* logging must never break a request */
  }
  return status;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Simple branded HTML wrapper (navy header, orange accent). */
export function brandedHtml(title: string, paragraphs: string[]) {
  return `<!doctype html><html><body style="margin:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:#002858;padding:20px 28px;color:#fff;font-size:20px;font-weight:bold">${esc(company.name)}</td></tr>
<tr><td style="height:4px;background:#E06010"></td></tr>
<tr><td style="padding:28px"><h1 style="font-size:20px;color:#002858;margin:0 0 16px">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${esc(p)}</p>`).join("")}
</td></tr>
<tr><td style="padding:18px 28px;background:#f5f7fa;font-size:12px;color:#616e7c">${esc(company.tagline)}<br>${esc(contact.addressLine)} · ${esc(contact.phoneDisplay)} · ${esc(contact.visits)}</td></tr>
</table></td></tr></table></body></html>`;
}
