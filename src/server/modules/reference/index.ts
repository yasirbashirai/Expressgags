/**
 * Module "reference" — geography & operations reference data that feeds the pricing engines
 * (Master Requirements §5.5: editable zones and sub-zones instead of hundreds of hard-coded
 * city-to-city prices; §5.6: vehicle capacity thresholds are set by Express Bags, never invented).
 *
 * /v1/admin/reference  (read: OWNER, STAFF, DISPATCHER · write: OWNER, STAFF)
 *   GET    /overview                     markets + zone trees + locations + vehicle classes + thresholds
 *   PATCH  /markets/:id                  name, tier, active, sort order
 *   POST   /zones · PATCH /zones/:id · DELETE /zones/:id   (delete only when it has no sub-zones)
 *   GET    /zone-prices                  local engine trip rules (same-zone base, zone pairs, per-mile)
 *   PUT    /zone-prices                  saves a NEW local rule-set version (history kept)
 *   GET    /rule-versions?engine=local|carrier|storage
 *   POST   /locations · PATCH /locations/:id     recognized hotels/airports/ports/private aviation/venues
 *   POST   /vehicle-classes · PATCH /vehicle-classes/:id
 *   GET    /thresholds · PUT /thresholds          automatic-pricing vs custom-quote thresholds
 */
import { Router, type Request } from "express";
import { z } from "zod";
import { audit, requireAuth, requireRole } from "../../auth";
import { prisma } from "../../db";
import { zonePairKey } from "../../engines/pricing/local";
import { asyncHandler, HttpError } from "../../lib/errors";
import { getActiveRules, getSetting, saveRules, SETTING_SCHEMAS, updateSetting } from "../../settings";
import type { PlatformModule } from "../types";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("STAFF", "DISPATCHER"));
const canWrite = requireRole("STAFF");

const prismaCode = (e: unknown) => (e as { code?: string }).code;
function friendly(e: unknown, what: string): never {
  if (prismaCode(e) === "P2002") throw new HttpError(409, `A ${what} with that code already exists.`);
  if (prismaCode(e) === "P2025") throw new HttpError(404, `${what[0].toUpperCase()}${what.slice(1)} not found.`);
  throw e;
}

/* ------------------------------- Overview -------------------------------- */

adminRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const [markets, vehicleClasses, thresholds] = await Promise.all([
      prisma.market.findMany({
        orderBy: { sortOrder: "asc" },
        include: { zones: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }, locations: { orderBy: [{ type: "asc" }, { name: "asc" }] } },
      }),
      prisma.vehicleClass.findMany({ orderBy: { sortOrder: "asc" } }),
      getSetting("thresholds"),
    ]);
    // Nest sub-zones under their parent for the tree view
    const tree = markets.map((m) => ({
      ...m,
      zones: m.zones.filter((z) => !z.parentId).map((z) => ({ ...z, children: m.zones.filter((c) => c.parentId === z.id) })),
    }));
    res.json({ ok: true, markets: tree, vehicleClasses, thresholds });
  }),
);

/* -------------------------------- Markets -------------------------------- */

adminRouter.patch(
  "/markets/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const data = z
      .object({ name: z.string().trim().min(2).max(80), tier: z.enum(["top", "next", "additional"]), active: z.boolean(), sortOrder: z.coerce.number().int().min(0).max(999) })
      .partial()
      .parse(req.body);
    const market = await prisma.market.update({ where: { id: String(req.params.id) }, data }).catch((e) => friendly(e, "market"));
    await audit(req, "update", "market", market.id, data);
    res.json({ ok: true, market });
  }),
);

/* --------------------------------- Zones --------------------------------- */

const zoneSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9-]+$/, "Use uppercase letters, numbers and dashes (e.g. KEYS-MARATHON)"),
  name: z.string().trim().min(2).max(120),
  marketId: z.string().min(1),
  parentId: z.string().nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});

/** Sub-zones are one level deep and must stay inside the parent's market. */
async function validateParent(parentId: string | null | undefined, marketId: string, selfId?: string) {
  if (!parentId) return;
  if (parentId === selfId) throw new HttpError(400, "A zone cannot be its own parent.");
  const parent = await prisma.zone.findUnique({ where: { id: parentId } });
  if (!parent) throw new HttpError(400, "Parent zone not found.");
  if (parent.parentId) throw new HttpError(400, "Sub-zones can only be one level deep.");
  if (parent.marketId !== marketId) throw new HttpError(400, "A sub-zone must be in the same market as its parent.");
}

adminRouter.post(
  "/zones",
  canWrite,
  asyncHandler(async (req, res) => {
    const input = zoneSchema.parse(req.body);
    await validateParent(input.parentId, input.marketId);
    const zone = await prisma.zone.create({ data: { ...input, parentId: input.parentId ?? null } }).catch((e) => friendly(e, "zone"));
    await audit(req, "create", "zone", zone.id, { code: zone.code, parentId: zone.parentId });
    res.status(201).json({ ok: true, zone });
  }),
);

adminRouter.patch(
  "/zones/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const current = await prisma.zone.findUnique({ where: { id }, include: { _count: { select: { children: true } } } });
    if (!current) throw new HttpError(404, "Zone not found.");
    const input = zoneSchema.omit({ code: true, marketId: true }).partial().parse(req.body);
    if (input.parentId && current._count.children) throw new HttpError(400, "A zone with sub-zones cannot become a sub-zone.");
    if (input.parentId !== undefined) await validateParent(input.parentId, current.marketId, id);
    const zone = await prisma.zone.update({ where: { id }, data: input });
    await audit(req, "update", "zone", id, input);
    res.json({ ok: true, zone });
  }),
);

adminRouter.delete(
  "/zones/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const zone = await prisma.zone.findUnique({ where: { id }, include: { _count: { select: { children: true } } } });
    if (!zone) throw new HttpError(404, "Zone not found.");
    if (zone._count.children) throw new HttpError(409, "Remove or move its sub-zones first.");
    const rules = await getActiveRules("local");
    if (Object.keys(rules.zonePairBase).some((k) => k.split("|").includes(zone.code))) {
      throw new HttpError(409, "This zone is used by zone-pair prices. Remove those prices first, or deactivate the zone instead.");
    }
    await prisma.zone.delete({ where: { id } });
    await audit(req, "delete", "zone", id, { code: zone.code });
    res.json({ ok: true });
  }),
);

/* ------------------------------ Zone prices ------------------------------ */

const centsRule = z.coerce.number().int().min(0).max(10_000_000);

adminRouter.get(
  "/zone-prices",
  asyncHandler(async (_req, res) => {
    const [rules, active] = await Promise.all([getActiveRules("local"), prisma.pricingRuleSet.findFirst({ where: { engine: "local", active: true }, orderBy: { version: "desc" } })]);
    const pairs = Object.entries(rules.zonePairBase).map(([key, cents]) => {
      const [a, b] = key.split("|");
      return { a, b, cents };
    });
    res.json({ ok: true, sameZoneBase: rules.sameZoneBase, perMile: rules.perMile, minimumMilesCharged: rules.minimumMilesCharged, pairs, version: active?.version ?? 0 });
  }),
);

adminRouter.put(
  "/zone-prices",
  canWrite,
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        sameZoneBase: centsRule,
        perMile: centsRule,
        minimumMilesCharged: z.coerce.number().min(0).max(1000),
        pairs: z.array(z.object({ a: z.string().min(2), b: z.string().min(2), cents: centsRule })).max(2000),
        note: z.string().trim().max(300).optional(),
      })
      .parse(req.body);
    const codes = new Set((await prisma.zone.findMany({ select: { code: true } })).map((z) => z.code));
    const pairMap: Record<string, number> = {};
    for (const p of input.pairs) {
      if (!codes.has(p.a) || !codes.has(p.b)) throw new HttpError(400, `Unknown zone code in pair ${p.a} → ${p.b}.`);
      if (p.a === p.b) throw new HttpError(400, `Same-zone trips use the same-zone base price (${p.a}).`);
      const key = zonePairKey(p.a, p.b);
      if (key in pairMap) throw new HttpError(400, `Duplicate price for ${p.a} ↔ ${p.b}.`);
      pairMap[key] = p.cents;
    }
    const current = await getActiveRules("local");
    const set = await saveRules("local", { ...current, sameZoneBase: input.sameZoneBase, perMile: input.perMile, minimumMilesCharged: input.minimumMilesCharged, zonePairBase: pairMap }, req.user!.email, input.note || "Zone prices updated");
    await audit(req, "update", "pricingRuleSet", set.id, { engine: "local", version: set.version, pairs: input.pairs.length });
    res.json({ ok: true, version: set.version });
  }),
);

adminRouter.get(
  "/rule-versions",
  asyncHandler(async (req, res) => {
    const engine = z.enum(["local", "carrier", "storage"]).default("local").parse(req.query.engine);
    const versions = await prisma.pricingRuleSet.findMany({ where: { engine }, orderBy: { version: "desc" }, take: 30, select: { id: true, version: true, active: true, note: true, createdBy: true, createdAt: true } });
    res.json({ ok: true, versions });
  }),
);

/* -------------------------- Recognized locations ------------------------- */

const locationSchema = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
  name: z.string().trim().min(2).max(160),
  type: z.enum(["airport", "cruise-port", "hotel", "private-aviation", "venue", "business", "storage", "other"]),
  marketId: z.string().min(1),
  /** Operating instructions & access notes (loading dock, terminal rules, contact desk) — staff only */
  instructions: z.string().trim().max(3000).nullable().optional(),
  surchargeCents: z.coerce.number().int().min(0).max(1_000_000).default(0),
  active: z.boolean().default(true),
});

adminRouter.post(
  "/locations",
  canWrite,
  asyncHandler(async (req, res) => {
    const input = locationSchema.parse(req.body);
    const loc = await prisma.recognizedLocation.create({ data: input }).catch((e) => friendly(e, "location"));
    await audit(req, "create", "recognizedLocation", loc.id, { code: loc.code, type: loc.type });
    res.status(201).json({ ok: true, location: loc });
  }),
);

adminRouter.patch(
  "/locations/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const input = locationSchema.omit({ code: true }).partial().parse(req.body);
    const loc = await prisma.recognizedLocation.update({ where: { id: String(req.params.id) }, data: input }).catch((e) => friendly(e, "location"));
    await audit(req, "update", "recognizedLocation", loc.id, input);
    res.json({ ok: true, location: loc });
  }),
);

/* ---------------------------- Vehicle classes ---------------------------- */

const vehicleSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only"),
  name: z.string().trim().min(2).max(80),
  /** Left empty until Express Bags sets real capacities (never invented) */
  maxPieces: z.coerce.number().int().min(1).max(100000).nullable().optional(),
  maxWeightLbs: z.coerce.number().int().min(1).max(100000).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});

adminRouter.post(
  "/vehicle-classes",
  canWrite,
  asyncHandler(async (req, res) => {
    const input = vehicleSchema.parse(req.body);
    const vc = await prisma.vehicleClass.create({ data: input }).catch((e) => friendly(e, "vehicle class"));
    await audit(req, "create", "vehicleClass", vc.id, { code: vc.code });
    res.status(201).json({ ok: true, vehicleClass: vc });
  }),
);

adminRouter.patch(
  "/vehicle-classes/:id",
  canWrite,
  asyncHandler(async (req, res) => {
    const input = vehicleSchema.omit({ code: true }).partial().parse(req.body);
    const vc = await prisma.vehicleClass.update({ where: { id: String(req.params.id) }, data: input }).catch((e) => friendly(e, "vehicle class"));
    await audit(req, "update", "vehicleClass", vc.id, input);
    res.json({ ok: true, vehicleClass: vc });
  }),
);

/* ------------------------------ Thresholds ------------------------------- */

adminRouter.get("/thresholds", asyncHandler(async (_req, res) => res.json({ ok: true, thresholds: await getSetting("thresholds") })));

adminRouter.put(
  "/thresholds",
  canWrite,
  asyncHandler(async (req: Request, res) => {
    const parsed = SETTING_SCHEMAS.thresholds.partial().parse(req.body);
    const thresholds = await updateSetting("thresholds", parsed, req.user!.email);
    await audit(req, "update", "setting", "thresholds", parsed);
    res.json({ ok: true, thresholds });
  }),
);

export const platformModule: PlatformModule = {
  name: "reference",
  routes: [{ scope: "admin", path: "/reference", router: adminRouter }],
};
