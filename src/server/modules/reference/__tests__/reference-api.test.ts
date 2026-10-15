/**
 * Reference data integration tests: zone tree rules, zone-pair prices saved as new local
 * rule-set versions (and used by the engine), guarded deletes, thresholds, role checks.
 * The local rule set active before the test is re-activated afterwards.
 */
import "../../../lib/env";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("reference data API", async () => {
  const { app } = await import("../../../app");
  const { prisma } = await import("../../../db");
  const { hashPassword } = await import("../../../auth");
  const { getActiveRules, getSetting } = await import("../../../settings");
  const { priceLocal } = await import("../../../engines/pricing/local");
  const tag = randomBytes(3).toString("hex").toUpperCase();
  const pw = "Reference-Test-Password-1!";
  const emails = { staff: `rf-staff-${tag.toLowerCase()}@test.local`, disp: `rf-disp-${tag.toLowerCase()}@test.local` };
  let staff: ReturnType<typeof request.agent>;
  let disp: ReturnType<typeof request.agent>;
  let marketId = "";
  let otherMarketId = "";
  let previousLocal: string | null = null;
  let previousThresholds: unknown = null;
  const created: string[] = [];

  beforeAll(async () => {
    const hash = await hashPassword(pw);
    await prisma.user.createMany({ data: [{ email: emails.staff, role: "STAFF", passwordHash: hash }, { email: emails.disp, role: "DISPATCHER", passwordHash: hash }] });
    staff = request.agent(app);
    disp = request.agent(app);
    await staff.post("/v1/admin/auth/login").send({ email: emails.staff, password: pw });
    await disp.post("/v1/admin/auth/login").send({ email: emails.disp, password: pw });
    const markets = await prisma.market.findMany({ orderBy: { sortOrder: "asc" }, take: 2 });
    marketId = markets[0].id;
    otherMarketId = markets[1].id;
    previousLocal = (await prisma.pricingRuleSet.findFirst({ where: { engine: "local", active: true }, orderBy: { version: "desc" } }))?.id ?? null;
    previousThresholds = (await prisma.setting.findUnique({ where: { key: "thresholds" } }))?.value ?? null;
  });

  afterAll(async () => {
    // Drop the rule versions this test created and restore the previous active one
    await prisma.pricingRuleSet.deleteMany({ where: { engine: "local", note: { contains: tag } } });
    if (previousLocal) await prisma.pricingRuleSet.update({ where: { id: previousLocal }, data: { active: true } });
    await prisma.zone.deleteMany({ where: { code: { contains: tag }, parentId: { not: null } } });
    await prisma.zone.deleteMany({ where: { code: { contains: tag } } });
    await prisma.recognizedLocation.deleteMany({ where: { code: { contains: tag.toLowerCase() } } });
    await prisma.vehicleClass.deleteMany({ where: { code: { contains: tag.toLowerCase() } } });
    if (previousThresholds) await prisma.setting.update({ where: { key: "thresholds" }, data: { value: previousThresholds as object } });
    else await prisma.setting.deleteMany({ where: { key: "thresholds" } });
    await prisma.auditLog.deleteMany({ where: { user: { email: { in: Object.values(emails) } } } });
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    void created;
  });

  it("lets dispatchers read but not write", async () => {
    expect((await disp.get("/v1/admin/reference/overview")).status).toBe(200);
    expect((await disp.post("/v1/admin/reference/zones").send({ code: `X-${tag}`, name: "Nope", marketId })).status).toBe(403);
  });

  let parentId = "";
  it("builds a one-level zone tree inside one market", async () => {
    const parent = await staff.post("/v1/admin/reference/zones").send({ code: `T-${tag}`, name: "Test chain", marketId });
    expect(parent.status).toBe(201);
    parentId = parent.body.zone.id;
    const child = await staff.post("/v1/admin/reference/zones").send({ code: `T-${tag}-A`, name: "Test sub-zone A", marketId, parentId });
    expect(child.status).toBe(201);
    expect((await staff.post("/v1/admin/reference/zones").send({ code: `T-${tag}-B`, name: "Grandchild", marketId, parentId: child.body.zone.id })).status).toBe(400);
    expect((await staff.post("/v1/admin/reference/zones").send({ code: `T-${tag}-C`, name: "Wrong market", marketId: otherMarketId, parentId })).status).toBe(400);
    expect((await staff.post("/v1/admin/reference/zones").send({ code: `T-${tag}`, name: "Duplicate", marketId })).status).toBe(409);
    expect((await staff.delete(`/v1/admin/reference/zones/${parentId}`)).status).toBe(409); // has a sub-zone
    const tree = await staff.get("/v1/admin/reference/overview");
    const m = tree.body.markets.find((x: { id: string }) => x.id === marketId);
    expect(m.zones.find((z: { id: string }) => z.id === parentId).children).toHaveLength(1);
  });

  it("saves zone-pair prices as a new rule version the engine uses", async () => {
    const before = await staff.get("/v1/admin/reference/zone-prices");
    const res = await staff.put("/v1/admin/reference/zone-prices").send({
      sameZoneBase: before.body.sameZoneBase,
      perMile: before.body.perMile,
      minimumMilesCharged: before.body.minimumMilesCharged,
      pairs: [...before.body.pairs, { a: `T-${tag}`, b: `T-${tag}-A`, cents: 12345 }],
      note: `test ${tag}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(before.body.version + 1);
    const rules = await getActiveRules("local");
    const price = priceLocal({ pickupZone: `T-${tag}`, deliveryZone: `T-${tag}-A`, pieces: [] }, rules);
    expect(price.lines[0]).toEqual({ label: `Zone route T-${tag} → T-${tag}-A`, cents: 12345 });
    // Unknown codes and same-zone pairs are rejected
    expect((await staff.put("/v1/admin/reference/zone-prices").send({ ...before.body, pairs: [{ a: "NOPE", b: `T-${tag}`, cents: 1 }] })).status).toBe(400);
    expect((await staff.put("/v1/admin/reference/zone-prices").send({ ...before.body, pairs: [{ a: `T-${tag}`, b: `T-${tag}`, cents: 1 }] })).status).toBe(400);
    // A zone used by a price can't be deleted
    const child = await prisma.zone.findUnique({ where: { code: `T-${tag}-A` } });
    expect((await staff.delete(`/v1/admin/reference/zones/${child!.id}`)).status).toBe(409);
  });

  it("manages recognized locations and vehicle classes without invented capacities", async () => {
    const loc = await staff.post("/v1/admin/reference/locations").send({ code: `hotel-${tag.toLowerCase()}`, name: "Test Resort", type: "hotel", marketId, instructions: "Loading dock on 5th St", surchargeCents: 500 });
    expect(loc.status).toBe(201);
    const vc = await staff.post("/v1/admin/reference/vehicle-classes").send({ code: `van-${tag.toLowerCase()}`, name: "Test van" });
    expect(vc.status).toBe(201);
    expect(vc.body.vehicleClass.maxPieces).toBeNull();
  });

  it("updates custom-quote thresholds", async () => {
    const res = await staff.put("/v1/admin/reference/thresholds").send({ maxAutoPieces: 37 });
    expect(res.status).toBe(200);
    expect((await getSetting("thresholds")).maxAutoPieces).toBe(37);
    expect((await staff.put("/v1/admin/reference/thresholds").send({ maxAutoPieces: -1 })).status).toBe(400);
  });
});
