/**
 * Public API (used by the website):
 *   POST /v1/quotes   POST /v1/uploads   POST /v1/careers   POST /v1/contact   GET /v1/health
 * Bots that fill the honeypot field "website" receive a normal-looking success and nothing is stored.
 */
import { timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { quoteRequestSchema } from "@/lib/quote-schema";
import { company } from "@/content/site";
import { prisma } from "../db";
import { brandedHtml, sendMail } from "../lib/email";
import { asyncHandler, HttpError } from "../lib/errors";
import { parseMultipart, storeUpload } from "../lib/multipart";
import { quoteReference } from "../lib/reference";
import { createQuote, ROUTE_MESSAGES } from "../services/quotes";
import { getSetting } from "../settings";
import { protectionLive } from "../modules/protection/plans";
import { readiness } from "../lib/readiness";

export const publicRouter = Router();

const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.PUBLIC_RATE_LIMIT || 30),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Please wait a few minutes or call our office." },
});

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.get("user-agent") });

publicRouter.get("/health", (_req, res) => {
  res.json({ ok: true, service: "express-bags-api" });
});

/**
 * Readiness: database, migrations, required config (503 when not ready). No secrets in the output.
 * Details (which checks/warnings) only with header `x-ready-token: <READY_TOKEN>`; everyone else sees ok/not ok.
 */
publicRouter.get(
  "/ready",
  asyncHandler(async (req, res) => {
    const r = await readiness();
    const token = process.env.READY_TOKEN;
    const provided = req.get("x-ready-token") ?? "";
    const detailed =
      process.env.NODE_ENV !== "production" ||
      (!!token && provided.length === token.length && timingSafeEqual(Buffer.from(provided), Buffer.from(token)));
    res.status(r.ok ? 200 : 503).set("Cache-Control", "no-store").json(detailed ? r : { ok: r.ok });
  }),
);

/** Public, non-sensitive site config (e.g. whether the public email may be shown). */
publicRouter.get(
  "/public-config",
  asyncHandler(async (_req, res) => {
    const contact = await getSetting("contact");
    const features = await getSetting("features");
    res.json({
      ok: true,
      emailLive: contact.emailLive,
      pricingEnabled: features.pricingEnabled,
      // Public booleans only (never prices): the quote wizard shows instant prices when these are on
      instantBookingEnabled: Boolean(features.pricingEnabled && features.instantBookingEnabled),
      carrierShippingEnabled: Boolean(features.pricingEnabled && features.instantBookingEnabled && features.carrierShippingEnabled),
      // Optional protection: true only when enabled AND legally approved (tiers come from /v1/protection/plans)
      protectionLive: (await protectionLive()).live,
    });
  }),
);

publicRouter.post(
  "/quotes",
  formLimiter,
  asyncHandler(async (req, res) => {
    // Honeypot: pretend success, store nothing
    if (typeof req.body?.website === "string" && req.body.website.length > 0) {
      return res.status(201).json({ ok: true, reference: quoteReference(), route: "standard-quote", message: ROUTE_MESSAGES["standard-quote"] });
    }
    const input = quoteRequestSchema.parse(req.body);
    const result = await createQuote(input, meta(req));
    res.status(201).json({ ok: true, ...result });
  }),
);

publicRouter.post(
  "/uploads",
  formLimiter,
  asyncHandler(async (req, res) => {
    const form = await parseMultipart(req);
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, 'Attach a file in the "file" field.');
    const id = await storeUpload(file);
    res.status(201).json({ ok: true, id });
  }),
);

const careerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(7).max(40),
  role: z.string().trim().min(2).max(120),
  market: z.string().max(80).optional().or(z.literal("")),
  experience: z.string().max(2000).optional().or(z.literal("")),
  message: z.string().max(4000).optional().or(z.literal("")),
  consent: z.literal("true", { message: "Please agree to be contacted" }).or(z.literal("on")),
  website: z.string().max(0).optional().or(z.literal("")),
});

publicRouter.post(
  "/careers",
  formLimiter,
  asyncHandler(async (req, res) => {
    const form = await parseMultipart(req);
    const fields = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
    if (typeof fields.website === "string" && fields.website.length > 0) return res.status(201).json({ ok: true });
    const data = careerSchema.parse(fields);
    const resume = form.get("resume");
    const resumeId = resume instanceof File && resume.size > 0 ? await storeUpload(resume) : undefined;
    await prisma.careerApplication.create({
      data: { name: data.name, email: data.email.toLowerCase(), phone: data.phone, role: data.role, market: data.market || null, experience: data.experience || null, message: data.message || null, resumeId },
    });
    const { notifyEmail } = await getSetting("contact");
    await Promise.allSettled([
      sendMail({
        to: data.email,
        subject: `Application received | ${company.shortName}`,
        text: `Hello ${data.name},\n\nThank you for applying for the ${data.role} position. Our team reviews every application and will contact you if there is a fit.\n\n${company.name}`,
        html: brandedHtml("Application received", [`Hello ${data.name},`, `Thank you for applying for the ${data.role} position.`, "Our team reviews every application and will contact you if there is a fit."]),
      }),
      notifyEmail ? sendMail({ to: notifyEmail, replyTo: data.email, subject: `New career application: ${data.role}`, text: `${data.name} · ${data.email} · ${data.phone}\nRole: ${data.role}\nMarket: ${data.market || "-"}` }) : null,
    ]);
    res.status(201).json({ ok: true });
  }),
);

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().max(40).optional().or(z.literal("")),
  topic: z.string().trim().min(2).max(120),
  message: z.string().trim().min(5).max(4000),
  consent: z.literal(true, { message: "Please agree to be contacted" }),
  website: z.string().max(0).optional().or(z.literal("")),
});

publicRouter.post(
  "/contact",
  formLimiter,
  asyncHandler(async (req, res) => {
    if (typeof req.body?.website === "string" && req.body.website.length > 0) return res.status(201).json({ ok: true });
    const data = contactSchema.parse(req.body);
    await prisma.contactMessage.create({ data: { name: data.name, email: data.email.toLowerCase(), phone: data.phone || null, topic: data.topic, message: data.message } });
    const { notifyEmail } = await getSetting("contact");
    if (notifyEmail) {
      await sendMail({ to: notifyEmail, replyTo: data.email, subject: `Website message: ${data.topic}`, text: `${data.name} · ${data.email} · ${data.phone || "-"}\n\n${data.message}` });
    }
    res.status(201).json({ ok: true });
  }),
);
