/**
 * Admin API (/v1/admin). Every route requires a session; writes are role-checked and audited.
 * Roles: OWNER (everything) · STAFF (quotes, messages, careers) · DISPATCHER (read quotes, update status/notes).
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { resolve, join } from "node:path";
import { z } from "zod";
import { notableProjects } from "@/content/site";
import { quoteRequestSchema, type QuoteRequest } from "@/lib/quote-schema";
import {
  LOCKOUT_MINUTES, assertPasswordOk, audit, checkTotp, clearSession, consumeAuthToken, createAuthToken, hashRecoveryCode, issueSession, peekAuthToken,
  recordFailedLogin, requireAuth, requireRole, setUserPassword, verifyPassword, webBaseUrl,
} from "../auth";
import { brandedHtml, sendMail } from "../lib/email";
import { prisma } from "../db";
import type { Prisma } from "../generated/prisma/client";
import { decideRoute } from "../engines/decision-engine";
import { quoteCarrierShipment, type CarrierResponse } from "../engines/pricing/carrier";
import { priceLocal } from "../engines/pricing/local";
import { priceStorage } from "../engines/pricing/storage";
import { env } from "../lib/env";
import { asyncHandler, HttpError } from "../lib/errors";
import { getActiveRules, getAllSettings, saveRules, updateSetting, type EngineName } from "../settings";

export const adminRouter = Router();

/* --------------------------------- Auth ---------------------------------- */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT || 10),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { ok: false, error: "Too many sign-in attempts. Please wait 15 minutes." },
});

adminRouter.post(
  "/auth/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password, totp, recoveryCode } = z
      .object({ email: z.string().email(), password: z.string().min(1).max(200), totp: z.string().max(12).optional(), recoveryCode: z.string().max(20).optional() })
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const invalid = new HttpError(401, "Email or password is incorrect.");
    if (!user || !user.active) {
      await verifyPassword(password, "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.vH2xDzoP2iC1aHcmP7DzVNcCz0hW"); // equal timing
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpError(423, `Too many failed sign-in attempts. Please try again in ${LOCKOUT_MINUTES} minutes or reset your password.`);
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      const locked = await recordFailedLogin(user.id);
      await prisma.auditLog.create({ data: { userId: user.id, action: locked ? "login-locked" : "login-failed", entity: "user", entityId: user.id } });
      if (locked) throw new HttpError(423, `Too many failed sign-in attempts. Please try again in ${LOCKOUT_MINUTES} minutes or reset your password.`);
      throw invalid;
    }

    // Two-factor: password is right, now require a TOTP (or a single-use recovery code)
    let totpStep: number | null = null;
    let remainingCodes: string[] | null = null;
    if (user.totpEnabled && user.totpSecret) {
      if (!totp && !recoveryCode) return res.json({ ok: true, twoFactorRequired: true });
      if (totp) totpStep = checkTotp(user.totpSecret, totp, user.totpLastStep);
      if (totpStep === null && recoveryCode) {
        const h = hashRecoveryCode(recoveryCode);
        if (user.totpRecoveryCodes.includes(h)) remainingCodes = user.totpRecoveryCodes.filter((c) => c !== h);
      }
      if (totpStep === null && remainingCodes === null) {
        const locked = await recordFailedLogin(user.id);
        await prisma.auditLog.create({ data: { userId: user.id, action: "login-2fa-failed", entity: "user", entityId: user.id } });
        if (locked) throw new HttpError(423, `Too many failed sign-in attempts. Please try again in ${LOCKOUT_MINUTES} minutes.`);
        throw new HttpError(401, "That code is not valid. Check your authenticator app and try again.", [{ path: "totp", message: "Invalid code" }]);
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        failedLogins: 0,
        lockedUntil: null,
        ...(totpStep !== null ? { totpLastStep: totpStep } : {}),
        ...(remainingCodes !== null ? { totpRecoveryCodes: remainingCodes } : {}),
      },
    });
    const authUser = { id: user.id, email: user.email, role: user.role, name: user.name };
    issueSession(res, { ...authUser, tokenVersion: updated.tokenVersion });
    req.user = authUser;
    await audit(req, remainingCodes !== null ? "login-recovery-code" : "login", "user", user.id);
    res.json({ ok: true, user: { ...authUser, totpEnabled: user.totpEnabled, mustChangePassword: user.mustChangePassword }, recoveryCodesLeft: remainingCodes?.length });
  }),
);

adminRouter.post("/auth/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

/** Forgot password: always answers the same way (no account enumeration). */
adminRouter.post(
  "/auth/forgot",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user && user.active) {
      const token = await createAuthToken("password-reset", "user", user.id, 60);
      const link = `${webBaseUrl()}/admin/reset-password?token=${encodeURIComponent(token)}`;
      await sendMail({
        to: user.email,
        subject: "Reset your Express Bags admin password",
        text: `A password reset was requested for your Express Bags admin account.\n\nSet a new password (link valid for 1 hour, single use):\n${link}\n\nIf you did not request this, ignore this email.`,
        html: brandedHtml("Reset your admin password", ["A password reset was requested for your Express Bags admin account.", `Set a new password here (valid for 1 hour, single use): ${link}`, "If you did not request this, you can ignore this email."]),
      });
      await prisma.auditLog.create({ data: { userId: user.id, action: "password-reset-requested", entity: "user", entityId: user.id } });
    }
    res.json({ ok: true, message: "If that email belongs to a staff account, a reset link is on its way." });
  }),
);

/** Checks a reset / invite link before showing the set-password form. */
adminRouter.get(
  "/auth/token",
  asyncHandler(async (req, res) => {
    const { token } = z.object({ token: z.string().min(10).max(200) }).parse(req.query);
    const row = await peekAuthToken(token, ["password-reset", "invite"], "user");
    if (!row) throw new HttpError(400, "This link is invalid or has expired. Please request a new one.");
    const user = await prisma.user.findUnique({ where: { id: row.subjectId } });
    if (!user || !user.active) throw new HttpError(400, "This link is invalid or has expired. Please request a new one.");
    res.json({ ok: true, purpose: row.purpose, email: user.email });
  }),
);

/** Sets a password from a reset or invite link (single use, ends all other sessions). */
adminRouter.post(
  "/auth/reset",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { token, password } = z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(200) }).parse(req.body);
    const peek = await peekAuthToken(token, ["password-reset", "invite"], "user");
    if (!peek) throw new HttpError(400, "This link is invalid or has expired. Please request a new one.");
    const user = await prisma.user.findUnique({ where: { id: peek.subjectId } });
    if (!user || !user.active) throw new HttpError(400, "This link is invalid or has expired. Please request a new one.");
    assertPasswordOk(password, user.email); // validate before burning the token
    const row = await consumeAuthToken(token, ["password-reset", "invite"], "user");
    await setUserPassword(user.id, user.email, password);
    await prisma.auditLog.create({ data: { userId: user.id, action: row.purpose === "invite" ? "invite-accepted" : "password-reset", entity: "user", entityId: user.id } });
    res.json({ ok: true });
  }),
);

adminRouter.use(asyncHandler(async (req, res, next) => requireAuth(req, res, next)));

/** Drivers use the driver app (/v1/driver/*); the office admin API is closed to them except their own session info. */
adminRouter.use((req, _res, next) => {
  if (req.user?.role === "DRIVER" && !req.path.startsWith("/auth/")) return next(new HttpError(403, "Drivers use the Express Bags driver app."));
  next();
});

adminRouter.get(
  "/auth/me",
  asyncHandler(async (req, res) => {
    const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { totpEnabled: true, mustChangePassword: true, lastLoginAt: true } });
    res.json({ ok: true, user: { ...req.user, ...u } });
  }),
);

/* -------------------------------- Dashboard ------------------------------- */

adminRouter.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [byStatus, byService, byMarket, byRoute, latest, last30, careersNew, messagesNew] = await Promise.all([
      prisma.quoteRequest.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.quoteRequest.groupBy({ by: ["serviceType"], _count: { _all: true } }),
      prisma.quoteRequest.groupBy({ by: ["pickupMarket"], _count: { _all: true } }),
      prisma.quoteRequest.groupBy({ by: ["route"], _count: { _all: true } }),
      prisma.quoteRequest.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { customer: { select: { name: true, email: true } } } }),
      prisma.quoteRequest.count({ where: { createdAt: { gte: since } } }),
      prisma.careerApplication.count({ where: { status: "NEW" } }),
      prisma.contactMessage.count({ where: { status: "NEW" } }),
    ]);
    const toMap = <T extends { _count: { _all: number } }>(rows: T[], key: keyof T) => Object.fromEntries(rows.map((r) => [String(r[key]), r._count._all]));
    res.json({
      ok: true,
      counts: {
        byStatus: toMap(byStatus, "status"),
        byService: toMap(byService, "serviceType"),
        byMarket: toMap(byMarket, "pickupMarket"),
        byRoute: toMap(byRoute, "route"),
        last30Days: last30,
        careersNew,
        messagesNew,
      },
      latest: latest.map(summary),
    });
  }),
);

/* --------------------------------- Quotes --------------------------------- */

const STATUSES = ["NEW", "REVIEWING", "QUOTED", "WON", "LOST", "ARCHIVED"] as const;

function summary(q: Prisma.QuoteRequestGetPayload<{ include: { customer: { select: { name: true; email: true } } } }>) {
  return {
    id: q.id,
    reference: q.reference,
    serviceType: q.serviceType,
    route: q.route,
    status: q.status,
    pickupMarket: q.pickupMarket,
    deliveryMarket: q.deliveryMarket,
    serviceDate: q.serviceDate,
    totalPieces: q.totalPieces,
    leadSource: q.leadSource,
    customerName: q.customer.name,
    customerEmail: q.customer.email,
    createdAt: q.createdAt,
  };
}

const listQuery = z.object({
  status: z.enum(STATUSES).optional(),
  service: z.string().max(40).optional(),
  market: z.string().max(60).optional(),
  route: z.enum(["CUSTOM_QUOTE", "STANDARD_QUOTE", "SPECIAL_ROUTE"]).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

function quoteWhere(f: z.infer<typeof listQuery>): Prisma.QuoteRequestWhereInput {
  const where: Prisma.QuoteRequestWhereInput = {};
  if (f.status) where.status = f.status;
  if (f.service) where.serviceType = f.service;
  if (f.market) where.pickupMarket = f.market;
  if (f.route) where.route = f.route;
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}),
      ...(f.to ? { lte: new Date(`${f.to}T23:59:59Z`) } : {}),
    };
  }
  if (f.q) {
    where.OR = [
      { reference: { contains: f.q, mode: "insensitive" } },
      { customer: { name: { contains: f.q, mode: "insensitive" } } },
      { customer: { email: { contains: f.q, mode: "insensitive" } } },
      { company: { name: { contains: f.q, mode: "insensitive" } } },
    ];
  }
  return where;
}

adminRouter.get(
  "/quotes",
  asyncHandler(async (req, res) => {
    const f = listQuery.parse(req.query);
    const where = quoteWhere(f);
    const [total, rows] = await Promise.all([
      prisma.quoteRequest.count({ where }),
      prisma.quoteRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
        include: { customer: { select: { name: true, email: true } } },
      }),
    ]);
    res.json({ ok: true, total, page: f.page, pageSize: f.pageSize, quotes: rows.map(summary) });
  }),
);

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralize spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

adminRouter.get(
  "/quotes/export.csv",
  requireRole("STAFF"),
  asyncHandler(async (req, res) => {
    const f = listQuery.parse({ ...req.query, page: 1, pageSize: 200 });
    const rows = await prisma.quoteRequest.findMany({
      where: quoteWhere(f),
      orderBy: { createdAt: "desc" },
      take: 5000,
      include: { customer: true, company: true },
    });
    const header = ["Reference", "Created", "Status", "Route", "Service", "Pickup market", "Delivery market", "Service date", "Pieces", "Customer", "Email", "Phone", "Company", "Lead source"];
    const lines = rows.map((q) =>
      [q.reference, q.createdAt.toISOString(), q.status, q.route, q.serviceType, q.pickupMarket, q.deliveryMarket, q.serviceDate, q.totalPieces, q.customer.name, q.customer.email, q.customer.phone, q.company?.name, q.leadSource]
        .map(csvCell)
        .join(","),
    );
    await audit(req, "export", "quote", undefined, { count: rows.length });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="express-bags-quotes-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send([header.map(csvCell).join(","), ...lines].join("\r\n"));
  }),
);

adminRouter.get(
  "/quotes/:id",
  asyncHandler(async (req, res) => {
    const q = await prisma.quoteRequest.findUnique({
      where: { id: String(req.params.id) },
      include: {
        customer: true,
        company: true,
        notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { email: true, name: true } } } },
        events: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!q) throw new HttpError(404, "Quote not found.");
    const payload = q.payload as unknown as QuoteRequest;
    const attachmentIds = payload.attachmentIds ?? [];
    const attachments = attachmentIds.length
      ? await prisma.upload.findMany({ where: { id: { in: attachmentIds } }, select: { id: true, originalName: true, mimeType: true, sizeBytes: true } })
      : [];
    res.json({ ok: true, quote: q, attachments });
  }),
);

adminRouter.patch(
  "/quotes/:id/status",
  requireRole("STAFF", "DISPATCHER"),
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(STATUSES) }).parse(req.body);
    const id = String(req.params.id);
    const before = await prisma.quoteRequest.findUnique({ where: { id }, select: { status: true } });
    if (!before) throw new HttpError(404, "Quote not found.");
    const q = await prisma.quoteRequest.update({
      where: { id },
      data: { status, events: { create: { type: "status", detail: `${before.status} → ${status}`, actor: req.user!.email } } },
    });
    await audit(req, "status", "quote", id, { from: before.status, to: status });
    res.json({ ok: true, status: q.status });
  }),
);

adminRouter.post(
  "/quotes/:id/notes",
  requireRole("STAFF", "DISPATCHER"),
  asyncHandler(async (req, res) => {
    const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
    const id = String(req.params.id);
    if (!(await prisma.quoteRequest.findUnique({ where: { id }, select: { id: true } }))) throw new HttpError(404, "Quote not found.");
    const note = await prisma.quoteNote.create({ data: { quoteId: id, authorId: req.user!.id, body } });
    await audit(req, "note", "quote", id);
    res.status(201).json({ ok: true, note });
  }),
);

/** Internal pricing preview for a stored quote (never shown publicly). */
adminRouter.post(
  "/quotes/:id/pricing-preview",
  requireRole("STAFF"),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const q = await prisma.quoteRequest.findUnique({ where: { id } });
    if (!q) throw new HttpError(404, "Quote not found.");
    const preview = await previewFor(q.payload as unknown as QuoteRequest);
    await prisma.quoteRequest.update({ where: { id }, data: { pricingPreview: preview as object } });
    res.json({ ok: true, preview });
  }),
);

async function previewFor(input: QuoteRequest) {
  const { thresholds } = await getAllSettings();
  const decision = decideRoute(input, thresholds);
  if (decision.engine === "storage" && input.storageStart && input.storageEnd) {
    return { decision, result: priceStorage({ start: new Date(input.storageStart), end: new Date(input.storageEnd), pieces: decision.totalPieces, withPickup: input.storageWithPickup, withDelivery: input.storageWithDelivery }, await getActiveRules("storage")) };
  }
  if (decision.engine === "carrier") return { decision, result: null, note: "Carrier rates require the multi-carrier integration (Phase 3)." };
  return {
    decision,
    result: priceLocal(
      {
        pickupZone: input.pickup.market,
        deliveryZone: input.delivery.market,
        pieces: input.items.map((i) => ({ category: i.category, quantity: i.quantity })),
        pickupLocationType: input.pickup.type,
        deliveryLocationType: input.delivery.type,
        sameDay: input.speed === "same-day",
        urgent: input.speed === "urgent",
        afterHours: input.timeWindow === "after-hours",
      },
      await getActiveRules("local"),
    ),
  };
}

/* -------------------------------- Settings -------------------------------- */

adminRouter.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    const [settings, local, carrier, storage, perms] = await Promise.all([
      getAllSettings(),
      getActiveRules("local"),
      getActiveRules("carrier"),
      getActiveRules("storage"),
      prisma.notableProjectPermission.findMany(),
    ]);
    const permMap = new Map(perms.map((p) => [p.projectId, p]));
    res.json({
      ok: true,
      settings,
      rules: { local, carrier, storage },
      notableProjects: notableProjects.map((p) => ({
        id: p.id,
        title: p.title,
        period: p.period,
        permissionGranted: permMap.get(p.id)?.permissionGranted ?? false,
        evidenceNote: permMap.get(p.id)?.evidenceNote ?? "",
      })),
    });
  }),
);

adminRouter.patch(
  "/settings/:key",
  requireRole(),
  asyncHandler(async (req, res) => {
    const key = z.enum(["contact", "features", "thresholds"]).parse(req.params.key);
    const value = await updateSetting(key, req.body, req.user!.email);
    await audit(req, "update", "setting", key, req.body);
    res.json({ ok: true, value });
  }),
);

adminRouter.put(
  "/pricing-rules/:engine",
  requireRole(),
  asyncHandler(async (req, res) => {
    const engine = z.enum(["local", "carrier", "storage"]).parse(req.params.engine) as EngineName;
    const { rules, note } = z.object({ rules: z.record(z.string(), z.unknown()), note: z.string().max(300).optional() }).parse(req.body);
    const saved = await saveRules(engine, rules, req.user!.email, note);
    await audit(req, "update", "pricing-rules", engine, { version: saved.version });
    res.json({ ok: true, version: saved.version, rules: saved.rules });
  }),
);

const previewSchema = z.discriminatedUnion("engine", [
  z.object({ engine: z.literal("local"), rules: z.record(z.string(), z.unknown()).optional(), input: z.record(z.string(), z.unknown()) }),
  z.object({ engine: z.literal("storage"), rules: z.record(z.string(), z.unknown()).optional(), input: z.record(z.string(), z.unknown()) }),
  z.object({ engine: z.literal("carrier"), rules: z.record(z.string(), z.unknown()).optional(), input: z.record(z.string(), z.unknown()), rates: z.array(z.record(z.string(), z.unknown())) }),
]);

/** Live pricing preview for the settings screen: try draft rules on a sample request. */
adminRouter.post(
  "/pricing-preview",
  requireRole("STAFF"),
  asyncHandler(async (req, res) => {
    const body = previewSchema.parse(req.body);
    if (body.engine === "local") {
      const rules = { ...(await getActiveRules("local")), ...(body.rules ?? {}) };
      return res.json({ ok: true, result: priceLocal(body.input as never, rules) });
    }
    if (body.engine === "storage") {
      const rules = { ...(await getActiveRules("storage")), ...(body.rules ?? {}) };
      const i = body.input as { start: string; end: string; pieces: number; oversizedPieces?: number; withPickup?: boolean; withDelivery?: boolean; afterHours?: boolean };
      return res.json({ ok: true, result: priceStorage({ ...i, start: new Date(i.start), end: new Date(i.end) }, rules) });
    }
    const rules = { ...(await getActiveRules("carrier")), ...(body.rules ?? {}) };
    return res.json({ ok: true, result: quoteCarrierShipment(body.rates as unknown as CarrierResponse[], body.input as never, rules) });
  }),
);

/** Validate a sample request against the public contract (useful when testing the quote form). */
adminRouter.post(
  "/decision-preview",
  asyncHandler(async (req, res) => {
    const input = quoteRequestSchema.parse(req.body);
    const { thresholds } = await getAllSettings();
    res.json({ ok: true, decision: decideRoute(input, thresholds) });
  }),
);

adminRouter.put(
  "/notable-projects/:id",
  requireRole(),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    if (!notableProjects.some((p) => p.id === id)) throw new HttpError(404, "Unknown project.");
    const { permissionGranted, evidenceNote } = z.object({ permissionGranted: z.boolean(), evidenceNote: z.string().max(500).optional() }).parse(req.body);
    // Naming a client publicly requires a recorded written-permission note (form B13); same rule as Website content → History & names
    if (permissionGranted && (!evidenceNote || evidenceNote.trim().length < 10)) {
      throw new HttpError(400, "Record how written permission was given (at least 10 characters) before naming this client publicly.");
    }
    const row = await prisma.notableProjectPermission.upsert({
      where: { projectId: id },
      update: { permissionGranted, evidenceNote, grantedAt: permissionGranted ? new Date() : null, updatedBy: req.user!.email },
      create: { projectId: id, permissionGranted, evidenceNote, grantedAt: permissionGranted ? new Date() : null, updatedBy: req.user!.email },
    });
    await audit(req, "update", "notable-project", id, { permissionGranted });
    res.json({ ok: true, permission: row });
  }),
);

/* --------------------------- Careers & messages ---------------------------- */

adminRouter.get(
  "/careers",
  requireRole("STAFF"),
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, applications: await prisma.careerApplication.findMany({ orderBy: { createdAt: "desc" }, take: 200 }) });
  }),
);

adminRouter.get(
  "/messages",
  requireRole("STAFF"),
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, messages: await prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 200 }) });
  }),
);

for (const kind of ["careers", "messages"] as const) {
  adminRouter.patch(
    `/${kind}/:id/status`,
    requireRole("STAFF"),
    asyncHandler(async (req, res) => {
      const { status } = z.object({ status: z.enum(["NEW", "REVIEWED", "ARCHIVED"]) }).parse(req.body);
      const id = String(req.params.id);
      if (kind === "careers") await prisma.careerApplication.update({ where: { id }, data: { status } });
      else await prisma.contactMessage.update({ where: { id }, data: { status } });
      await audit(req, "status", kind, id, { status });
      res.json({ ok: true });
    }),
  );
}


/* --------------------------------- Uploads -------------------------------- */

/** Private download of an uploaded attachment or résumé (staff only, never public). */
adminRouter.get(
  "/uploads/:id",
  requireRole("STAFF", "DISPATCHER"),
  asyncHandler(async (req, res) => {
    const up = await prisma.upload.findUnique({ where: { id: String(req.params.id) } });
    if (!up) throw new HttpError(404, "File not found.");
    await audit(req, "download", "upload", up.id);
    res.setHeader("Content-Type", up.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename="${up.originalName.replace(/[^\w.\- ]/g, "_")}"`);
    res.sendFile(join(resolve(env.uploadDir), up.storedName));
  }),
);

/* ---------------------------- Markets & zones ------------------------------ */

adminRouter.get(
  "/markets",
  asyncHandler(async (_req, res) => {
    res.json({
      ok: true,
      markets: await prisma.market.findMany({ orderBy: { sortOrder: "asc" }, include: { zones: { orderBy: { sortOrder: "asc" } }, locations: true } }),
    });
  }),
);

const zoneSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9-]+$/, "Use capital letters, numbers and dashes"),
  name: z.string().trim().min(2).max(120),
  marketId: z.string().min(1),
  parentId: z.string().nullable().optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

adminRouter.post(
  "/zones",
  requireRole(),
  asyncHandler(async (req, res) => {
    const data = zoneSchema.parse(req.body);
    const zone = await prisma.zone.create({ data });
    await audit(req, "create", "zone", zone.id, data);
    res.status(201).json({ ok: true, zone });
  }),
);

adminRouter.patch(
  "/zones/:id",
  requireRole(),
  asyncHandler(async (req, res) => {
    const data = zoneSchema.partial().parse(req.body);
    const zone = await prisma.zone.update({ where: { id: String(req.params.id) }, data });
    await audit(req, "update", "zone", zone.id, data);
    res.json({ ok: true, zone });
  }),
);

adminRouter.patch(
  "/markets/:id",
  requireRole(),
  asyncHandler(async (req, res) => {
    const data = z.object({ name: z.string().min(2).max(120).optional(), active: z.boolean().optional(), sortOrder: z.number().int().optional() }).parse(req.body);
    const market = await prisma.market.update({ where: { id: String(req.params.id) }, data });
    await audit(req, "update", "market", market.id, data);
    res.json({ ok: true, market });
  }),
);
