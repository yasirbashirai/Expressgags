/**
 * Module "notifications" — customer communication, surveys/reviews, marketing consent & attribution.
 *
 * Admin   /v1/admin/notifications/*  log, queue, resend, templates (preview/test), settings, opt-outs, marketing IDs
 * Public  /v1/survey/:token          post-delivery survey (+ review-click)
 *         /v1/attribution            UTM / click-ID attribution for a just-submitted quote
 *         /v1/marketing/config       public tag IDs (GA4, Google Ads, Meta Pixel) for the consent banner
 *         /v1/marketing/unsubscribe  signed one-click unsubscribe for survey/review emails
 * Webhook /v1/webhooks/twilio        inbound STOP/START + delivery status callbacks (signature-verified)
 *
 * Event handlers are registered when this module loads (see engine.ts); nothing else calls it directly.
 */
import express, { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { audit, requireAuth, requireRole } from "../../auth";
import { prisma } from "../../db";
import { asyncHandler, HttpError } from "../../lib/errors";
import { renderTemplate, sampleData, STAFF_TEMPLATES, TEMPLATE_KEYS, type TemplateKey } from "../../lib/templates";
import { verifyTwilioSignature } from "../../providers/twilio";
import type { PlatformModule } from "../types";
import { enqueue, registerNotificationHandlers } from "./engine";
import { attributionSchema, recordAttribution } from "./marketing";
import { CUSTOMER_EVENT_KEYS, getMarketingSettings, getNotificationSettings, saveMarketingSettings, saveNotificationSettings } from "./settings";
import { getSurvey, recordReviewClick, submitSurvey, surveySubmitSchema } from "./survey";
import { toE164 } from "./time";
import { verifyUnsubscribe } from "./unsubscribe";
import { processDueJobs, startNotificationWorker } from "./worker";

export const adminRouter = Router();
export const publicRouter = Router();
export const attributionRouter = Router();
export const marketingRouter = Router();
export const twilioWebhookRouter = Router();

registerNotificationHandlers();
startNotificationWorker();

const limiter = (limit: number) =>
  rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.PUBLIC_RATE_LIMIT || limit), standardHeaders: "draft-8", legacyHeaders: false, message: { ok: false, error: "Too many requests. Please try again shortly." } });

/* ======================================================================= */
/* Admin                                                                     */
/* ======================================================================= */

adminRouter.use(requireAuth, requireRole("STAFF"));
const ownerOrStaff = requireRole("STAFF");
const ownerOnly = requireRole("OWNER");

const listQuery = z.object({
  channel: z.enum(["email", "sms", "whatsapp"]).optional(),
  template: z.string().max(60).optional(),
  status: z.string().max(20).optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

adminRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const f = listQuery.parse(req.query);
    const q = f.q?.trim();
    const orderIds = q ? (await prisma.order.findMany({ where: { reference: { contains: q, mode: "insensitive" } }, select: { id: true }, take: 50 })).map((o) => o.id) : [];
    const where = {
      ...(f.channel ? { channel: f.channel } : {}),
      ...(f.template ? { template: f.template } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(q ? { OR: [{ to: { contains: q, mode: "insensitive" as const } }, { orderId: { in: orderIds } }] } : {}),
    };
    const take = 50;
    const [rows, total] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * take, take, include: { order: { select: { reference: true } } } }),
      prisma.notification.count({ where }),
    ]);
    const statusCounts = await prisma.notification.groupBy({ by: ["status"], _count: { _all: true } });
    res.json({
      ok: true,
      total,
      page: f.page,
      pageSize: take,
      counts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])),
      notifications: rows.map((n) => ({ id: n.id, channel: n.channel, to: n.to, template: n.template, subject: n.subject, status: n.status, provider: n.provider, error: n.error, orderId: n.orderId, orderReference: n.order?.reference ?? null, createdAt: n.createdAt })),
    });
  }),
);

adminRouter.get(
  "/jobs",
  asyncHandler(async (req, res) => {
    const status = z.enum(["PENDING", "FAILED", "PROCESSING", "all"]).default("PENDING").parse(req.query.status ?? "PENDING");
    const jobs = await prisma.notificationJob.findMany({
      where: status === "all" ? {} : { status },
      orderBy: { scheduledFor: "asc" },
      take: 200,
      select: { id: true, channel: true, to: true, template: true, status: true, scheduledFor: true, attempts: true, lastError: true, orderId: true, createdAt: true },
    });
    res.json({ ok: true, jobs });
  }),
);

adminRouter.post(
  "/jobs/process",
  asyncHandler(async (req, res) => {
    const counts = await processDueJobs();
    await audit(req, "process", "notification-queue", undefined, counts);
    res.json({ ok: true, counts });
  }),
);

adminRouter.post(
  "/jobs/:id/cancel",
  asyncHandler(async (req, res) => {
    const r = await prisma.notificationJob.updateMany({ where: { id: String(req.params.id), status: "PENDING" }, data: { status: "CANCELLED" } });
    if (!r.count) throw new HttpError(404, "Only pending messages can be cancelled.");
    await audit(req, "cancel", "notification-job", String(req.params.id));
    res.json({ ok: true });
  }),
);

adminRouter.get(
  "/templates",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, templates: TEMPLATE_KEYS.map((key) => ({ key, staff: STAFF_TEMPLATES.includes(key) })) });
  }),
);

const templateKey = z.enum(TEMPLATE_KEYS);

adminRouter.get(
  "/templates/:key/preview",
  asyncHandler(async (req, res) => {
    const key = templateKey.parse(req.params.key);
    const lang = z.enum(["en", "es"]).default("en").parse(req.query.lang ?? "en");
    const r = renderTemplate(key, lang, sampleData(key));
    res.json({ ok: true, key, lang, ...r, smsLength: r.sms.length });
  }),
);

adminRouter.post(
  "/templates/:key/test",
  ownerOrStaff,
  asyncHandler(async (req, res) => {
    const key = templateKey.parse(req.params.key);
    const body = z.object({ to: z.string().trim().min(5).max(200), lang: z.enum(["en", "es"]).default("en"), channel: z.enum(["email", "sms", "whatsapp"]).default("email") }).parse(req.body);
    if (body.channel === "email" && !z.string().email().safeParse(body.to).success) throw new HttpError(400, "Enter a valid email address.");
    if (body.channel !== "email" && !toE164(body.to)) throw new HttpError(400, "Enter a valid phone number.");
    const ids = await enqueue({
      template: key,
      data: sampleData(key),
      recipient: { email: body.channel === "email" ? body.to : null, phone: body.channel === "email" ? null : body.to, language: body.lang },
      subject: `test:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      channels: [body.channel],
    });
    await audit(req, "test-send", "notification-template", key, { channel: body.channel });
    const job = ids[0] ? await prisma.notificationJob.findUnique({ where: { id: ids[0] } }) : null;
    res.json({ ok: true, status: job?.status ?? "QUEUED", error: job?.lastError ?? null });
  }),
);

adminRouter.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    const [notifications, marketing] = await Promise.all([getNotificationSettings(), getMarketingSettings()]);
    res.json({ ok: true, notifications, marketing, customerEvents: CUSTOMER_EVENT_KEYS });
  }),
);

adminRouter.put(
  "/settings",
  ownerOrStaff,
  asyncHandler(async (req, res) => {
    const saved = await saveNotificationSettings(req.body?.notifications, req.user?.email);
    await audit(req, "update", "setting", "notifications");
    res.json({ ok: true, notifications: saved });
  }),
);

adminRouter.put(
  "/settings/marketing",
  ownerOnly,
  asyncHandler(async (req, res) => {
    const saved = await saveMarketingSettings(req.body?.marketing, req.user?.email);
    await audit(req, "update", "setting", "marketing");
    res.json({ ok: true, marketing: saved });
  }),
);

adminRouter.get(
  "/opt-outs",
  asyncHandler(async (_req, res) => {
    const optOuts = await prisma.contactOptOut.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
    res.json({ ok: true, optOuts });
  }),
);

adminRouter.post(
  "/opt-outs",
  ownerOrStaff,
  asyncHandler(async (req, res) => {
    const b = z.object({ channel: z.enum(["sms", "whatsapp", "email-marketing"]), address: z.string().trim().min(5).max(200), note: z.string().max(300).optional() }).parse(req.body);
    const address = b.channel === "email-marketing" ? b.address.toLowerCase() : toE164(b.address);
    if (!address || (b.channel === "email-marketing" && !z.string().email().safeParse(address).success)) throw new HttpError(400, "Enter a valid phone number or email.");
    const row = await prisma.contactOptOut.upsert({ where: { channel_address: { channel: b.channel, address } }, create: { channel: b.channel, address, source: "admin", note: b.note }, update: { note: b.note } });
    await audit(req, "create", "contact-opt-out", row.id, { channel: b.channel });
    res.status(201).json({ ok: true, optOut: row });
  }),
);

adminRouter.delete(
  "/opt-outs/:id",
  ownerOrStaff,
  asyncHandler(async (req, res) => {
    await prisma.contactOptOut.delete({ where: { id: String(req.params.id) } }).catch(() => {
      throw new HttpError(404, "Opt-out not found.");
    });
    await audit(req, "delete", "contact-opt-out", String(req.params.id));
    res.json({ ok: true });
  }),
);

adminRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const n = await prisma.notification.findUnique({ where: { id: String(req.params.id) }, include: { order: { select: { reference: true } } } });
    if (!n) throw new HttpError(404, "Message not found.");
    const job = await prisma.notificationJob.findFirst({ where: { notificationId: n.id }, select: { id: true, attempts: true, language: true, scheduledFor: true } });
    res.json({ ok: true, notification: { ...n, orderReference: n.order?.reference ?? null }, job });
  }),
);

adminRouter.post(
  "/:id/resend",
  ownerOrStaff,
  asyncHandler(async (req, res) => {
    const n = await prisma.notification.findUnique({ where: { id: String(req.params.id) } });
    if (!n) throw new HttpError(404, "Message not found.");
    const original = await prisma.notificationJob.findFirst({ where: { notificationId: n.id } });
    if (!original) throw new HttpError(409, "This message has no stored content to resend.");
    const job = await prisma.notificationJob.create({
      data: { dedupeKey: `resend:${n.id}:${Date.now()}`, channel: original.channel, to: original.to, template: original.template, language: original.language, data: original.data as object, orderId: original.orderId, customerId: original.customerId },
    });
    const { processJob } = await import("./worker");
    await processJob(job.id);
    await audit(req, "resend", "notification", n.id);
    const fresh = await prisma.notificationJob.findUnique({ where: { id: job.id } });
    res.json({ ok: true, status: fresh?.status, error: fresh?.lastError ?? null });
  }),
);

/* ======================================================================= */
/* Public: survey                                                            */
/* ======================================================================= */

publicRouter.get(
  "/:token",
  limiter(120),
  asyncHandler(async (req, res) => {
    res.json({ ok: true, survey: await getSurvey(String(req.params.token)) });
  }),
);

publicRouter.post(
  "/:token",
  limiter(30),
  asyncHandler(async (req, res) => {
    const input = surveySubmitSchema.parse(req.body);
    res.json(await submitSurvey(String(req.params.token), input));
  }),
);

publicRouter.post(
  "/:token/review-click",
  limiter(30),
  asyncHandler(async (req, res) => {
    res.json(await recordReviewClick(String(req.params.token)));
  }),
);

/* ======================================================================= */
/* Public: attribution + marketing                                          */
/* ======================================================================= */

const clientMeta = (req: Request) => ({ ip: req.ip, userAgent: req.get("user-agent") ?? undefined });

attributionRouter.post(
  "/",
  limiter(30),
  asyncHandler(async (req, res) => {
    const input = attributionSchema.parse(req.body);
    await recordAttribution(input, clientMeta(req));
    // Same answer whether or not the reference exists (no enumeration)
    res.json({ ok: true });
  }),
);

marketingRouter.get(
  "/config",
  limiter(300),
  asyncHandler(async (_req, res) => {
    const m = await getMarketingSettings();
    res.set("Cache-Control", "public, max-age=300");
    res.json({ ok: true, ga4Id: m.ga4Id || null, googleAdsId: m.googleAdsId || null, googleAdsQuoteLabel: m.googleAdsQuoteLabel || null, googleAdsBookingLabel: m.googleAdsBookingLabel || null, metaPixelId: m.metaPixelId || null });
  }),
);

const unsubPage = (title: string, text: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f5f7fa;color:#1f2933"><main style="max-width:520px;margin:12vh auto;padding:32px;background:#fff;border-radius:16px">
<p style="margin:0 0 6px;color:#E06010;font-weight:bold;letter-spacing:.12em;font-size:12px;text-transform:uppercase">Express Bags</p><h1 style="margin:0 0 12px;color:#002858;font-size:22px">${title}</h1><p style="line-height:1.6">${text}</p></main></body></html>`;

marketingRouter.get(
  "/unsubscribe",
  limiter(60),
  asyncHandler(async (req, res) => {
    const email = String(req.query.e ?? "").trim().toLowerCase();
    const token = String(req.query.t ?? "");
    if (!email || !verifyUnsubscribe(email, token)) {
      res.status(400).type("html").send(unsubPage("Link not valid", "This unsubscribe link is not valid. Please call our office at (305) 783-2860 and we will update your preferences."));
      return;
    }
    await prisma.contactOptOut.upsert({ where: { channel_address: { channel: "email-marketing", address: email } }, create: { channel: "email-marketing", address: email, source: "unsubscribe-link" }, update: {} });
    res.type("html").send(unsubPage("You are unsubscribed", "You will no longer receive review requests or other optional emails from Express Bags. Messages about your bookings, such as confirmations and delivery updates, will still be sent."));
  }),
);

/* ======================================================================= */
/* Webhook: Twilio (STOP/START + status callbacks)                          */
/* ======================================================================= */

twilioWebhookRouter.use(express.urlencoded({ extended: false, limit: "64kb" }));

function webhookUrl(req: Request) {
  const base = process.env.PUBLIC_API_URL?.replace(/\/$/, "");
  return base ? `${base}${req.originalUrl}` : `${req.protocol}://${req.get("host")}${req.originalUrl}`;
}

function assertTwilio(req: Request) {
  const params = Object.fromEntries(Object.entries((req.body ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
  if (!verifyTwilioSignature(webhookUrl(req), params, req.get("x-twilio-signature") ?? undefined)) throw new HttpError(403, "Invalid signature");
  return params;
}

const STOP_WORDS = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|optout|opt out|baja|parar)\s*$/i;
const START_WORDS = /^\s*(start|unstop|yes|subscribe|alta)\s*$/i;

twilioWebhookRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const p = assertTwilio(req);
    const isWhatsapp = /^whatsapp:/i.test(p.From ?? "");
    const address = toE164(p.From);
    if (address) {
      const channel = isWhatsapp ? "whatsapp" : "sms";
      if (STOP_WORDS.test(p.Body ?? "")) {
        await prisma.contactOptOut.upsert({ where: { channel_address: { channel, address } }, create: { channel, address, source: "twilio-stop" }, update: {} });
      } else if (START_WORDS.test(p.Body ?? "")) {
        await prisma.contactOptOut.deleteMany({ where: { channel, address } });
      }
    }
    // Empty TwiML: Twilio's own compliance replies handle the STOP confirmation text
    res.type("text/xml").send("<Response></Response>");
  }),
);

twilioWebhookRouter.post(
  "/status",
  asyncHandler(async (req, res) => {
    const p = assertTwilio(req);
    const sid = p.MessageSid;
    const status = (p.MessageStatus ?? "").toLowerCase();
    if (sid) {
      const mapped = status === "delivered" || status === "sent" ? "SENT" : status === "failed" || status === "undelivered" ? "FAILED" : null;
      if (mapped) await prisma.notification.updateMany({ where: { providerRef: sid }, data: { status: mapped, ...(mapped === "FAILED" ? { error: `Twilio ${status}${p.ErrorCode ? ` (${p.ErrorCode})` : ""}` } : {}) } });
    }
    res.status(204).end();
  }),
);

export const platformModule: PlatformModule = {
  name: "notifications",
  routes: [
    { scope: "admin", path: "/notifications", router: adminRouter },
    { scope: "public", path: "/survey", router: publicRouter },
    { scope: "public", path: "/attribution", router: attributionRouter },
    { scope: "public", path: "/marketing", router: marketingRouter },
    { scope: "webhook", path: "/webhooks/twilio", router: twilioWebhookRouter },
  ],
};

export type { TemplateKey };
