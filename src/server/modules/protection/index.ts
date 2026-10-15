/**
 * Module "protection" — optional luggage protection & claims (Master Requirements §8).
 * Never marketed as insurance. Customer endpoints answer 404 unless features.protectionEnabled
 * is ON *and* legal approval (approvedBy, approvedAt, termsUrl) is recorded in the plans.
 *
 * Admin /v1/admin/protection
 *   GET   /plans                 plans + live/approval status          (OWNER, STAFF, ACCOUNTING)
 *   PUT   /plans                 save tiers, reserve %, legal approval  (OWNER, STAFF)
 *   POST  /enable {enabled}      turn the customer offering on/off — refuses ON without approval (OWNER)
 *   GET   /claims?status&q · GET /claims/:id
 *   POST  /claims/:id/decision   UNDER_REVIEW | NEED_INFO | APPROVED | PARTIAL | DENIED (OWNER, STAFF)
 *   POST  /claims/:id/notes      internal note
 *   POST  /claims/:id/pay        record payout as a REFUND payment       (OWNER, ACCOUNTING)
 *   GET   /claims/:id/files/:uploadId   inline evidence / Express Bags condition photos
 *   GET   /reserve               fees collected vs payouts
 *
 * Public /v1/protection (wizard + customer portal, cookie "eb_customer")
 *   GET   /plans                 tiers for booking (404 when not live)
 *   GET   /eligible-orders · GET /claims · GET /claims/:id
 *   POST  /uploads (multipart "file") · POST /claims · POST /claims/:id/reply
 *   GET   /claims/:id/files/:uploadId
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { join, resolve } from "node:path";
import { z } from "zod";
import { audit, requireAuth, requireRole } from "../../auth";
import { prisma } from "../../db";
import { env } from "../../lib/env";
import { asyncHandler, HttpError } from "../../lib/errors";
import { parseMultipart, storeUpload } from "../../lib/multipart";
import { updateSetting } from "../../settings";
import { requirePortal as requireCustomer } from "../customer/access";
import type { PlatformModule } from "../types";
import { getPlans, legallyApproved, protectionLive, savePlans } from "./plans";
import {
  addStaffNote, adminDetail, adminList, adminListSchema, customerClaim, customerReply, decide, decisionSchema, eligibleOrders, EVIDENCE_CATEGORIES, markPaid, payoutSchema, reserveReport, submitClaim, submitSchema,
} from "./service";

export const adminRouter = Router();
export const publicRouter = Router();

const actor = (req: Request) => ({ id: req.user!.id, name: req.user!.name || req.user!.email });

function sendInline(res: Response, up: { mimeType: string; storedName: string; originalName: string }) {
  res.setHeader("Content-Type", up.mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=300");
  // Let the website (same site, other origin/port) display the photo; access still requires the session cookie
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  if (!up.mimeType.startsWith("image/") && up.mimeType !== "application/pdf") res.setHeader("Content-Disposition", `attachment; filename="${up.originalName.replace(/[^\w.\- ]/g, "_")}"`);
  res.sendFile(join(resolve(env.uploadDir), up.storedName));
}

/* -------------------------------- Admin ---------------------------------- */

adminRouter.use(requireAuth, requireRole("STAFF", "ACCOUNTING"));
const canDecide = requireRole("STAFF");
const canPay = requireRole("ACCOUNTING");

adminRouter.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    const status = await protectionLive();
    res.json({ ok: true, plans: status.plans, live: status.live, enabledFlag: status.enabledFlag, approved: status.approved });
  }),
);

adminRouter.put(
  "/plans",
  canDecide,
  asyncHandler(async (req, res) => {
    const plans = await savePlans(req.body, req.user!.email);
    await audit(req, "update", "protectionPlans", undefined, { tiers: plans.tiers.map((t) => [t.code, t.priceCents, t.maxBenefitCents]), reservePercent: plans.reservePercent, approved: legallyApproved(plans) });
    // Losing approval switches the customer offering off immediately
    if (!legallyApproved(plans)) await updateSetting("features", { protectionEnabled: false }, req.user!.email);
    const status = await protectionLive();
    res.json({ ok: true, plans, live: status.live, enabledFlag: status.enabledFlag, approved: status.approved });
  }),
);

adminRouter.post(
  "/enable",
  requireRole(), // OWNER only
  asyncHandler(async (req, res) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    if (enabled && !legallyApproved(await getPlans())) {
      throw new HttpError(409, "Record the Florida legal approval (approved by, date and terms URL) before offering protection to customers.");
    }
    await updateSetting("features", { protectionEnabled: enabled }, req.user!.email);
    await audit(req, enabled ? "enable" : "disable", "protection");
    const status = await protectionLive();
    res.json({ ok: true, live: status.live, enabledFlag: status.enabledFlag, approved: status.approved });
  }),
);

adminRouter.get("/claims", asyncHandler(async (req, res) => res.json({ ok: true, ...(await adminList(adminListSchema.parse(req.query))) })));

adminRouter.get("/claims/:id", asyncHandler(async (req, res) => {
  const d = await adminDetail(String(req.params.id));
  res.json({ ok: true, ...d });
}));

adminRouter.post(
  "/claims/:id/decision",
  canDecide,
  asyncHandler(async (req, res) => {
    const input = decisionSchema.parse(req.body);
    await decide(String(req.params.id), input, actor(req));
    await audit(req, "decide", "claim", String(req.params.id), { status: input.status, decisionCents: "decisionCents" in input ? input.decisionCents : null });
    res.json({ ok: true });
  }),
);

adminRouter.post(
  "/claims/:id/notes",
  canDecide,
  asyncHandler(async (req, res) => {
    const { note } = z.object({ note: z.string().trim().min(2).max(2000) }).parse(req.body);
    await addStaffNote(String(req.params.id), note, actor(req));
    await audit(req, "note", "claim", String(req.params.id));
    res.status(201).json({ ok: true });
  }),
);

adminRouter.post(
  "/claims/:id/pay",
  canPay,
  asyncHandler(async (req, res) => {
    const payment = await markPaid(String(req.params.id), payoutSchema.parse(req.body), actor(req));
    await audit(req, "payout", "claim", String(req.params.id), { paymentId: payment.id, amountCents: payment.amountCents });
    res.json({ ok: true, paymentId: payment.id });
  }),
);

adminRouter.get(
  "/claims/:id/files/:uploadId",
  asyncHandler(async (req, res) => {
    const d = await adminDetail(String(req.params.id));
    const uploadId = String(req.params.uploadId);
    if (!d.allowedUploadIds.includes(uploadId)) throw new HttpError(404, "File not found.");
    const up = await prisma.upload.findUnique({ where: { id: uploadId } });
    if (!up) throw new HttpError(404, "File not found.");
    sendInline(res, up);
  }),
);

adminRouter.get("/reserve", asyncHandler(async (_req, res) => res.json({ ok: true, report: await reserveReport(await getPlans()) })));

/* ------------------------------- Public ---------------------------------- */

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: Number(process.env.PUBLIC_RATE_LIMIT || 60), standardHeaders: "draft-8", legacyHeaders: false, message: { ok: false, error: "Too many requests. Please wait a few minutes." } });

/** Every customer-facing protection route is invisible (404) until the module is live. */
async function requireLive(req: Request, _res: Response, next: NextFunction) {
  try {
    const s = await protectionLive();
    if (!s.live) throw new HttpError(404, "Not found.");
    (req as Request & { plans?: typeof s.plans }).plans = s.plans;
    next();
  } catch (e) {
    next(e);
  }
}
const plansOf = (req: Request) => (req as Request & { plans: Awaited<ReturnType<typeof getPlans>> }).plans;

publicRouter.use(limiter, requireLive);

publicRouter.get("/plans", (req, res) => {
  const p = plansOf(req);
  res.json({
    ok: true,
    displayName: p.displayName,
    termsUrl: p.approval.termsUrl,
    note: "Maximum benefit applies per order, not per item. Subject to the published terms.",
    evidenceRules: p.evidenceRules,
    claimWindowDays: p.claimWindowDays,
    tiers: p.tiers.filter((t) => t.active).map((t) => ({ code: t.code, name: t.name, priceCents: t.priceCents, maxBenefitCents: t.maxBenefitCents, benefits: t.benefits })),
  });
});

publicRouter.get("/eligible-orders", requireCustomer, asyncHandler(async (req, res) => res.json({ ok: true, orders: await eligibleOrders(req.customer!, plansOf(req)) })));

publicRouter.get(
  "/claims",
  requireCustomer,
  asyncHandler(async (req, res) => {
    const claims = await prisma.claim.findMany({
      where: { customerId: req.customer!.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, reference: true, status: true, tier: true, claimedCents: true, decisionCents: true, createdAt: true, order: { select: { reference: true } } },
    });
    res.json({ ok: true, claims });
  }),
);

publicRouter.post(
  "/uploads",
  requireCustomer,
  asyncHandler(async (req, res) => {
    const form = await parseMultipart(req);
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a photo or document to upload.");
    const id = await storeUpload(file);
    await prisma.upload.update({ where: { id }, data: { kind: "claim-evidence", ownerType: "customer", ownerId: req.customer!.id } });
    res.status(201).json({ ok: true, id });
  }),
);

publicRouter.post(
  "/claims",
  requireCustomer,
  asyncHandler(async (req, res) => {
    const claim = await submitClaim(req.customer!, submitSchema.parse(req.body), plansOf(req));
    await prisma.auditLog.create({ data: { action: "submit", entity: "claim", entityId: claim.id, detail: { customerId: req.customer!.id, reference: claim.reference } } });
    res.status(201).json({ ok: true, claim: { id: claim.id, reference: claim.reference, status: claim.status } });
  }),
);

publicRouter.get("/claims/:id", requireCustomer, asyncHandler(async (req, res) => res.json({ ok: true, ...(await customerClaim(req.customer!, String(req.params.id))) })));

publicRouter.post(
  "/claims/:id/reply",
  requireCustomer,
  asyncHandler(async (req, res) => {
    const input = z
      .object({ note: z.string().trim().min(2).max(3000), evidence: z.array(z.object({ uploadId: z.string(), category: z.enum(EVIDENCE_CATEGORIES) })).max(20).default([]) })
      .parse(req.body);
    await customerReply(req.customer!, String(req.params.id), input);
    res.json({ ok: true });
  }),
);

publicRouter.get(
  "/claims/:id/files/:uploadId",
  requireCustomer,
  asyncHandler(async (req, res) => {
    const claim = await prisma.claim.findFirst({ where: { id: String(req.params.id), customerId: req.customer!.id }, select: { evidenceUploadIds: true } });
    const uploadId = String(req.params.uploadId);
    if (!claim || !claim.evidenceUploadIds.includes(uploadId)) throw new HttpError(404, "File not found.");
    const up = await prisma.upload.findUnique({ where: { id: uploadId } });
    if (!up) throw new HttpError(404, "File not found.");
    sendInline(res, up);
  }),
);

export const platformModule: PlatformModule = {
  name: "protection",
  routes: [
    { scope: "admin", path: "/protection", router: adminRouter },
    { scope: "public", path: "/protection", router: publicRouter },
  ],
};
