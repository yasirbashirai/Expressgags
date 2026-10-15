/**
 * Module "carriers" — nationwide / international luggage shipping behind the Express Bags pricing layer.
 *
 * Admin  /v1/admin/carriers   (OWNER / STAFF / DISPATCHER; settings + approval as noted)
 *   GET    /settings                       carrier settings (default dims, carriers, processing points…)
 *   PUT    /settings                       update settings (OWNER / STAFF)
 *   GET    /orders/awaiting                nationwide orders that still need labels
 *   POST   /orders/:orderId/rates          staff rate shop (internal cost, profit, margin visible)
 *   POST   /orders/:orderId/labels         buy one label per piece for a service level
 *   GET    /shipments                      list + filters (status, carrier, search)
 *   GET    /shipments/:id                  detail (events, order, piece)
 *   GET    /shipments/:id/label            label file (private)
 *   POST   /shipments/:id/void             void an unused label
 *   POST   /shipments/:id/refresh          pull the latest carrier tracking
 *   POST   /quote                          ad-hoc staff quote (any destination + pieces)
 *   GET    /sandbox/scenarios              the 25 test-pricing scenarios
 *   POST   /sandbox/run                    run scenarios, save a PricingTestRun
 *   GET    /sandbox/runs                   recent runs · GET /sandbox/runs/:id one run
 *   GET    /sandbox/status                 current flags + approval history
 *   POST   /sandbox/approve                OWNER: enable/disable public instant pricing
 * Public /v1/shipping  (only when the owner approved instant pricing + carrier shipping)
 *   POST   /quote                          Express Bags service levels + retail prices (no costs)
 *   POST   /book                           book a level → order + checkout URL
 * Webhook /v1/webhooks/carriers           EasyPost tracker events (HMAC verified, de-duplicated)
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { join, resolve } from "node:path";
import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { quoteRequestSchema } from "@/lib/quote-schema";
import { audit, requireAuth, requireRole } from "../../auth";
import { prisma } from "../../db";
import { env } from "../../lib/env";
import { asyncHandler, HttpError } from "../../lib/errors";
import { getSetting } from "../../settings";
import "../../providers/easypost";
import type { PlatformModule } from "../types";
import { parseAddress } from "./address";
import { nationwideInstantBook, nationwideInstantQuote } from "./instant";
import { quoteNationwide } from "./quote";
import { MIN_SCENARIOS_FOR_APPROVAL, runSandbox, scenarios, setInstantPricing } from "./sandbox";
import { getCarrierSettings, saveCarrierSettings } from "./settings";
import { applyTrackingUpdate, buyLabels, rateShopOrder, refreshTracking, voidShipment } from "./shipments";

export const adminRouter = Router();
export const publicRouter = Router();
export const webhookRouter = Router();

const actor = (req: express.Request) => ({ id: req.user!.id, name: req.user!.name || req.user!.email });

/* ------------------------------- Admin ---------------------------------- */

adminRouter.use(requireAuth);
adminRouter.use(requireRole("STAFF", "DISPATCHER"));
const canConfigure = requireRole("STAFF");

adminRouter.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, settings: await getCarrierSettings() });
  }),
);

adminRouter.put(
  "/settings",
  canConfigure,
  asyncHandler(async (req, res) => {
    const settings = await saveCarrierSettings(req.body, req.user!.email);
    await audit(req, "update", "carrierSettings", undefined, { enabledCarriers: settings.enabledCarriers, showCarrierBeforeCheckout: settings.showCarrierBeforeCheckout });
    res.json({ ok: true, settings });
  }),
);

adminRouter.get(
  "/orders/awaiting",
  asyncHandler(async (_req, res) => {
    const orders = await prisma.order.findMany({
      where: {
        OR: [{ fulfillment: "nationwide" }, { serviceType: "nationwide-shipping" }],
        status: { notIn: ["DELIVERED", "CANCELLED"] },
        shipments: { none: { status: { not: "VOIDED" } } },
      },
      orderBy: { serviceDate: "asc" },
      take: 100,
      select: { id: true, reference: true, serviceDate: true, status: true, delivery: true, customer: { select: { name: true } }, _count: { select: { pieces: true } } },
    });
    res.json({ ok: true, orders });
  }),
);

const shopBody = z.object({ processingPoint: z.string().max(30).optional(), destination: z.string().trim().min(3).max(300).optional() });

adminRouter.post(
  "/orders/:orderId/rates",
  asyncHandler(async (req, res) => {
    const body = shopBody.parse(req.body ?? {});
    const { order, destination, result } = await rateShopOrder(String(req.params.orderId), body);
    res.json({ ok: true, order: { id: order.id, reference: order.reference, pieces: order.pieces.length }, destination, result: result.status === "priced" ? { ...result, rules: undefined } : result });
  }),
);

adminRouter.post(
  "/orders/:orderId/labels",
  asyncHandler(async (req, res) => {
    const body = shopBody.extend({ level: z.enum(["economy", "standard", "priority", "express", "next-day"]) }).parse(req.body);
    const out = await buyLabels(String(req.params.orderId), body.level, actor(req), body);
    await audit(req, "buy-labels", "order", String(req.params.orderId), { level: body.level, count: out.shipments.length, carrier: out.offer.carrier });
    res.status(201).json({ ok: true, shipments: out.shipments.map((s) => ({ id: s.id, trackingNumber: s.trackingNumber, carrier: s.carrier })) });
  }),
);

const listQuery = z.object({
  status: z.string().max(20).optional(),
  carrier: z.string().max(10).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

adminRouter.get(
  "/shipments",
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.carrier ? { carrier: q.carrier } : {}),
      ...(q.q ? { OR: [{ trackingNumber: { contains: q.q, mode: "insensitive" as const } }, { order: { reference: { contains: q.q, mode: "insensitive" as const } } }] } : {}),
    };
    const [rows, total, counts] = await Promise.all([
      prisma.carrierShipment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * 50,
        take: 50,
        include: { order: { select: { id: true, reference: true, customer: { select: { name: true } } } } },
      }),
      prisma.carrierShipment.count({ where }),
      prisma.carrierShipment.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    res.json({ ok: true, rows, total, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) });
  }),
);

adminRouter.get(
  "/shipments/:id",
  asyncHandler(async (req, res) => {
    const s = await prisma.carrierShipment.findUnique({
      where: { id: String(req.params.id) },
      include: { order: { select: { id: true, reference: true, status: true, delivery: true, customer: { select: { name: true, email: true } } } } },
    });
    if (!s) throw new HttpError(404, "Shipment not found.");
    const piece = s.pieceId ? await prisma.orderPiece.findUnique({ where: { id: s.pieceId }, select: { pieceId: true, category: true } }) : null;
    res.json({ ok: true, shipment: s, piece });
  }),
);

adminRouter.get(
  "/shipments/:id/label",
  asyncHandler(async (req, res) => {
    const s = await prisma.carrierShipment.findUnique({ where: { id: String(req.params.id) } });
    if (!s?.labelUploadId) throw new HttpError(404, "Label not found.");
    const up = await prisma.upload.findUnique({ where: { id: s.labelUploadId } });
    if (!up) throw new HttpError(404, "Label not found.");
    await audit(req, "download", "label", s.id);
    res.setHeader("Content-Type", up.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `inline; filename="${up.originalName.replace(/[^\w.\- ]/g, "_")}"`);
    res.sendFile(join(resolve(env.uploadDir), up.storedName));
  }),
);

adminRouter.post(
  "/shipments/:id/void",
  asyncHandler(async (req, res) => {
    const s = await voidShipment(String(req.params.id), actor(req));
    await audit(req, "void", "carrierShipment", s.id, { trackingNumber: s.trackingNumber });
    res.json({ ok: true, shipment: s });
  }),
);

adminRouter.post(
  "/shipments/:id/refresh",
  asyncHandler(async (req, res) => {
    res.json({ ok: true, ...(await refreshTracking(String(req.params.id))) });
  }),
);

const adhocQuote = z.object({
  destination: z.string().trim().min(3).max(300),
  includePickup: z.boolean().default(true),
  processingPoint: z.string().max(30).optional(),
  pieces: z
    .array(
      z.object({
        category: z.enum(["carry-on", "standard-checked", "large", "oversized", "special"]),
        weightLbs: z.number().positive().max(500).optional(),
        lengthIn: z.number().positive().max(200).optional(),
        widthIn: z.number().positive().max(200).optional(),
        heightIn: z.number().positive().max(200).optional(),
      }),
    )
    .min(1)
    .max(200),
});

adminRouter.post(
  "/quote",
  asyncHandler(async (req, res) => {
    const b = adhocQuote.parse(req.body);
    const result = await quoteNationwide({ destination: parseAddress(b.destination), includePickup: b.includePickup, pieces: b.pieces, processingPoint: b.processingPoint });
    res.json({ ok: true, result: result.status === "priced" ? { ...result, rules: undefined } : result });
  }),
);

/* ------------------------------ Sandbox --------------------------------- */

adminRouter.get(
  "/sandbox/scenarios",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, minimumForApproval: MIN_SCENARIOS_FOR_APPROVAL, scenarios: scenarios().map((s) => ({ id: s.id, label: s.label, group: s.group })) });
  }),
);

adminRouter.post(
  "/sandbox/run",
  canConfigure,
  asyncHandler(async (req, res) => {
    const b = z.object({ ids: z.array(z.string().max(10)).max(40).optional(), notes: z.string().max(2000).optional() }).parse(req.body ?? {});
    const out = await runSandbox({ id: req.user!.id, email: req.user!.email }, b);
    await audit(req, "run", "pricingTestRun", out.run.id, { scenarios: out.results.length });
    res.status(201).json({ ok: true, run: { id: out.run.id, createdAt: out.run.createdAt, scenarioCount: out.run.scenarioCount }, results: out.results });
  }),
);

adminRouter.get(
  "/sandbox/runs",
  asyncHandler(async (_req, res) => {
    const runs = await prisma.pricingTestRun.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id: true, createdAt: true, scenarioCount: true, runByEmail: true, notes: true } });
    res.json({ ok: true, runs });
  }),
);

adminRouter.get(
  "/sandbox/runs/:id",
  asyncHandler(async (req, res) => {
    const run = await prisma.pricingTestRun.findUnique({ where: { id: String(req.params.id) } });
    if (!run) throw new HttpError(404, "Test run not found.");
    res.json({ ok: true, run });
  }),
);

adminRouter.get(
  "/sandbox/status",
  asyncHandler(async (_req, res) => {
    const f = await getSetting("features");
    const approvals = await prisma.pricingApproval.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    res.json({
      ok: true,
      flags: { pricingEnabled: f.pricingEnabled, instantBookingEnabled: f.instantBookingEnabled, carrierShippingEnabled: f.carrierShippingEnabled },
      approvals,
    });
  }),
);

adminRouter.post(
  "/sandbox/approve",
  requireRole("OWNER"),
  asyncHandler(async (req, res) => {
    const b = z.object({ enable: z.boolean(), carrierShipping: z.boolean().default(true), testRunId: z.string().max(40).optional(), statement: z.string().max(1000).optional() }).parse(req.body);
    const out = await setInstantPricing({ id: req.user!.id, email: req.user!.email, role: req.user!.role }, b);
    await audit(req, b.enable ? "enable-instant-pricing" : "disable-instant-pricing", "features", undefined, { flags: out.flags, testRunId: b.testRunId });
    res.json({ ok: true, ...out });
  }),
);

/* ------------------------------- Public --------------------------------- */

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.PUBLIC_RATE_LIMIT || 30),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Please wait a few minutes or call our office." },
});
publicRouter.use(publicLimiter);

publicRouter.post(
  "/quote",
  asyncHandler(async (req, res) => {
    const r = quoteRequestSchema.parse(req.body);
    res.json(await nationwideInstantQuote(r));
  }),
);

publicRouter.post(
  "/book",
  asyncHandler(async (req, res) => {
    const { request, priceToken, acceptName } = z
      .object({ request: z.unknown(), priceToken: z.string().min(20).max(2000), acceptName: z.string().trim().min(2).max(120) })
      .parse(req.body);
    res.status(201).json(await nationwideInstantBook(quoteRequestSchema.parse(request), priceToken, { name: acceptName, ip: req.ip, userAgent: req.get("user-agent") }));
  }),
);

/* ------------------------------ Webhook --------------------------------- */

/** EasyPost signs webhooks with HMAC-SHA256 of the raw body: header "X-Hmac-Signature: hmac-sha256-hex=<hex>". */
export function verifyEasypostSignature(raw: Buffer, header: string | undefined, secret: string) {
  if (!header || !secret) return false;
  const expected = `hmac-sha256-hex=${createHmac("sha256", secret.normalize("NFKD")).update(raw).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(header.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

webhookRouter.post(
  "/",
  express.raw({ type: "*/*", limit: "1mb" }),
  asyncHandler(async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const secret = process.env.EASYPOST_WEBHOOK_SECRET || "";
    if (!verifyEasypostSignature(raw, req.get("x-hmac-signature"), secret)) throw new HttpError(401, "Invalid signature.");
    let event: { id?: string; description?: string; result?: { tracking_code?: string; status?: string; tracking_details?: { datetime: string; status: string; message?: string; tracking_location?: { city?: string; state?: string } }[] } };
    try {
      event = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new HttpError(400, "Invalid JSON.");
    }
    const eventId = event.id || `${event.result?.tracking_code}:${event.result?.status}:${event.result?.tracking_details?.length ?? 0}`;
    // De-duplicate: carriers resend webhooks; a repeat is acknowledged and ignored.
    const existing = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider: "easypost", eventId } } });
    if (existing) return res.json({ ok: true, duplicate: true });
    const row = await prisma.webhookEvent.create({ data: { provider: "easypost", eventId, type: event.description ?? "unknown", payload: event as object } });
    let outcome: unknown = { ignored: true };
    try {
      if (event.description?.startsWith("tracker.") && event.result?.tracking_code && event.result.status) {
        outcome = await applyTrackingUpdate(
          event.result.tracking_code,
          event.result.status,
          (event.result.tracking_details ?? []).map((d) => ({
            at: d.datetime,
            status: d.status,
            message: d.message,
            location: [d.tracking_location?.city, d.tracking_location?.state].filter(Boolean).join(", ") || undefined,
          })),
        );
      }
      await prisma.webhookEvent.update({ where: { id: row.id }, data: { processedAt: new Date() } });
    } catch (e) {
      await prisma.webhookEvent.update({ where: { id: row.id }, data: { error: (e as Error).message.slice(0, 500) } });
      throw e;
    }
    res.json({ ok: true, outcome });
  }),
);

export const platformModule: PlatformModule = {
  name: "carriers",
  routes: [
    { scope: "admin", path: "/carriers", router: adminRouter },
    { scope: "public", path: "/shipping", router: publicRouter },
    { scope: "webhook", path: "/webhooks/carriers", router: webhookRouter },
  ],
};
