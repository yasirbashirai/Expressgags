/**
 * Protection & claims integration tests: legal gate, 404 while disabled, max benefit per ORDER
 * (not per item), customer scoping/IDOR, evidence ownership, staff decisions, payout and reserve.
 * Global settings touched here (features, protectionPlans) are restored afterwards.
 */
import "../../../lib/env";
import jwt from "jsonwebtoken";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("protection claims API", async () => {
  const { app } = await import("../../../app");
  const { prisma } = await import("../../../db");
  const { hashPassword } = await import("../../../auth");
  const { env } = await import("../../../lib/env");
  const { createOrder } = await import("../../../services/orders");
  const { DEFAULT_PLANS } = await import("../plans");
  const tag = randomBytes(3).toString("hex");
  const pw = "Claims-Test-Password-1!";
  const emails = { owner: `cl-owner-${tag}@test.local`, staff: `cl-staff-${tag}@test.local`, acct: `cl-acct-${tag}@test.local`, disp: `cl-disp-${tag}@test.local` };
  const custA = `cl-a-${tag}@example.org`;
  const custB = `cl-b-${tag}@example.org`;
  let owner: ReturnType<typeof request.agent>;
  let staff: ReturnType<typeof request.agent>;
  let acct: ReturnType<typeof request.agent>;
  let cookieA = "";
  let cookieB = "";
  let orderA = "";
  let orderNoTier = "";
  const saved: { key: string; value: unknown }[] = [];

  const customerCookie = (id: string) => `eb_customer=${jwt.sign({ sub: id, typ: "customer" }, env.jwtSecret + ":customer", { expiresIn: 600 })}`;
  const asA = (r: request.Test) => r.set("Cookie", cookieA);

  beforeAll(async () => {
    for (const key of ["features", "protectionPlans"]) {
      const row = await prisma.setting.findUnique({ where: { key } });
      if (row) saved.push({ key, value: row.value });
    }
    const passwordHash = await hashPassword(pw);
    await prisma.user.createMany({
      data: [
        { email: emails.owner, role: "OWNER", passwordHash },
        { email: emails.staff, role: "STAFF", passwordHash, name: "Claire Claims" },
        { email: emails.acct, role: "ACCOUNTING", passwordHash },
        { email: emails.disp, role: "DISPATCHER", passwordHash },
      ],
    });
    owner = request.agent(app);
    staff = request.agent(app);
    acct = request.agent(app);
    await owner.post("/v1/admin/auth/login").send({ email: emails.owner, password: pw });
    await staff.post("/v1/admin/auth/login").send({ email: emails.staff, password: pw });
    await acct.post("/v1/admin/auth/login").send({ email: emails.acct, password: pw });

    const a = await prisma.customer.create({ data: { name: "Alice Claimant", email: custA, passwordHash } });
    const b = await prisma.customer.create({ data: { name: "Bob Other", email: custB, passwordHash } });
    cookieA = customerCookie(a.id);
    cookieB = customerCookie(b.id);
    const base = {
      serviceType: "luggage-local",
      pickup: { type: "hotel", address: "Hotel, Miami Beach", market: "miami" },
      delivery: { type: "airport", address: "MIA", market: "miami" },
      serviceDate: new Date(),
      market: "miami",
      // Five pieces: the maximum benefit still applies once per order, not per item
      pieces: Array.from({ length: 5 }, () => ({ category: "standard-checked" })),
    };
    const o1 = await createOrder({ ...base, customerId: a.id });
    await prisma.order.update({ where: { id: o1.id }, data: { protectionTier: "plus", protectionCents: 1500, paymentStatus: "PAID" } });
    orderA = o1.id;
    const o2 = await createOrder({ ...base, customerId: a.id });
    orderNoTier = o2.id;
    // Start from a known state: protection OFF, default (unapproved) plans
    await prisma.setting.deleteMany({ where: { key: "protectionPlans" } });
    await owner.post("/v1/admin/protection/enable").send({ enabled: false });
  });

  afterAll(async () => {
    const claims = await prisma.claim.findMany({ where: { customer: { email: { in: [custA, custB] } } }, select: { id: true } });
    const ids = claims.map((c) => c.id);
    await prisma.claimEvidence.deleteMany({ where: { claimId: { in: ids } } });
    await prisma.claimEvent.deleteMany({ where: { claimId: { in: ids } } });
    await prisma.claim.deleteMany({ where: { id: { in: ids } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: [orderA, orderNoTier] } } });
    await prisma.order.deleteMany({ where: { id: { in: [orderA, orderNoTier] } } });
    await prisma.upload.deleteMany({ where: { ownerType: "customer", ownerId: { in: (await prisma.customer.findMany({ where: { email: { in: [custA, custB] } } })).map((c) => c.id) } } });
    await prisma.customer.deleteMany({ where: { email: { in: [custA, custB] } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ user: { email: { in: Object.values(emails) } } }, { entity: "claim", userId: null, detail: { path: ["reference"], string_contains: "EB-CL" } }] } });
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
    await prisma.setting.deleteMany({ where: { key: "protectionPlans" } });
    for (const s of saved) await prisma.setting.upsert({ where: { key: s.key }, update: { value: s.value as object }, create: { key: s.key, value: s.value as object } });
    if (!saved.find((s) => s.key === "features")) {
      const f = await prisma.setting.findUnique({ where: { key: "features" } });
      if (f) await prisma.setting.update({ where: { key: "features" }, data: { value: { ...(f.value as object), protectionEnabled: false } } });
    }
  });

  it("is invisible to customers while disabled", async () => {
    expect((await request(app).get("/v1/protection/plans")).status).toBe(404);
    expect((await asA(request(app).get("/v1/protection/claims"))).status).toBe(404);
  });

  it("refuses to enable without the legal approval record", async () => {
    const r = await owner.post("/v1/admin/protection/enable").send({ enabled: true });
    expect(r.status).toBe(409);
    // Only the owner may switch the offering on
    expect((await staff.post("/v1/admin/protection/enable").send({ enabled: true })).status).toBe(403);
  });

  it("rejects calling the product insurance", async () => {
    const r = await staff.put("/v1/admin/protection/plans").send({ ...DEFAULT_PLANS, displayName: "Luggage Insurance" });
    expect(r.status).toBe(400);
  });

  it("goes live once approval is recorded and the owner enables it", async () => {
    const plans = { ...DEFAULT_PLANS, reservePercent: 40, approval: { approvedBy: "Florida counsel (test)", approvedAt: "2026-10-15", termsUrl: "https://www.express-bags.com/protection-terms", structure: "Declared-value protection (test)" } };
    expect((await staff.put("/v1/admin/protection/plans").send(plans)).status).toBe(200);
    expect((await owner.post("/v1/admin/protection/enable").send({ enabled: true })).body.live).toBe(true);
    const pub = await request(app).get("/v1/protection/plans");
    expect(pub.status).toBe(200);
    expect(pub.body.tiers.map((t: { maxBenefitCents: number }) => t.maxBenefitCents)).toEqual([25000, 50000, 100000]);
    expect(JSON.stringify(pub.body)).not.toMatch(/reserve|approvedBy/i);
  });

  const upload = async (cookie: string) => {
    const r = await request(app).post("/v1/protection/uploads").set("Cookie", cookie).attach("file", Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { filename: "damage.jpg", contentType: "image/jpeg" });
    expect(r.status).toBe(201);
    return r.body.id as string;
  };

  let claim1 = "";
  it("lets a customer claim on their own protected order only", async () => {
    const eligible = await asA(request(app).get("/v1/protection/eligible-orders"));
    expect(eligible.body.orders.map((o: { id: string }) => o.id)).toEqual([orderA]);
    const evidence = [{ uploadId: await upload(cookieA), category: "damage-photo" }];
    // No tier on the order → refused
    expect((await asA(request(app).post("/v1/protection/claims")).send({ orderId: orderNoTier, description: "Handle broke during transfer to the airport.", claimedCents: 5000, evidence })).status).toBe(409);
    // Above the Plus maximum ($500 per order)
    expect((await asA(request(app).post("/v1/protection/claims")).send({ orderId: orderA, description: "Handle broke during transfer to the airport.", claimedCents: 60000, evidence })).status).toBe(400);
    const ok = await asA(request(app).post("/v1/protection/claims")).send({ orderId: orderA, description: "Handle broke during transfer to the airport.", claimedCents: 30000, evidence });
    expect(ok.status).toBe(201);
    claim1 = ok.body.claim.id;
  });

  it("hides other customers' orders, claims and files (IDOR)", async () => {
    const bUpload = await upload(cookieB);
    expect((await request(app).post("/v1/protection/claims").set("Cookie", cookieB).send({ orderId: orderA, description: "Trying to claim someone else's order here.", claimedCents: 1000, evidence: [{ uploadId: bUpload, category: "damage-photo" }] })).status).toBe(404);
    expect((await request(app).get(`/v1/protection/claims/${claim1}`).set("Cookie", cookieB)).status).toBe(404);
    // A can't attach B's upload either
    expect((await asA(request(app).post(`/v1/protection/claims/${claim1}/reply`)).send({ note: "More photos", evidence: [{ uploadId: bUpload, category: "other" }] })).status).toBe(400);
  });

  it("applies the maximum per order across claims and lets staff decide", async () => {
    expect((await staff.post(`/v1/admin/protection/claims/${claim1}/decision`).send({ status: "APPROVED", decisionCents: 30000, note: "Damage matches intake photos." })).status).toBe(200);
    // $300 of $500 used → a second $300 claim exceeds what is left on THIS order
    const evidence = [{ uploadId: await upload(cookieA), category: "proof-of-value" }];
    const second = await asA(request(app).post("/v1/protection/claims")).send({ orderId: orderA, description: "Second bag also damaged on the same trip.", claimedCents: 30000, evidence });
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/200\.00/);
    const small = await asA(request(app).post("/v1/protection/claims")).send({ orderId: orderA, description: "Second bag also damaged on the same trip.", claimedCents: 15000, evidence });
    expect(small.status).toBe(201);
    // Staff can't approve beyond the remaining $200 either
    expect((await staff.post(`/v1/admin/protection/claims/${small.body.claim.id}/decision`).send({ status: "PARTIAL", decisionCents: 25000, note: "Too much" })).status).toBe(400);
    expect((await staff.post(`/v1/admin/protection/claims/${small.body.claim.id}/decision`).send({ status: "NEED_INFO", note: "Please send a receipt for the bag." })).status).toBe(200);
    const view = await asA(request(app).get(`/v1/protection/claims/${small.body.claim.id}`));
    expect(view.body.events.some((e: { type: string }) => e.type === "INFO_REQUESTED")).toBe(true);
  });

  it("records the payout as a refund (accounting) and reports the reserve", async () => {
    expect((await staff.post(`/v1/admin/protection/claims/${claim1}/pay`).send({ method: "check" })).status).toBe(403);
    const paid = await acct.post(`/v1/admin/protection/claims/${claim1}/pay`).send({ method: "check", reference: "CHK-1001" });
    expect(paid.status).toBe(200);
    const pay = await prisma.payment.findUnique({ where: { id: paid.body.paymentId } });
    expect(pay).toMatchObject({ kind: "REFUND", amountCents: 30000, orderId: orderA });
    const report = await staff.get("/v1/admin/protection/reserve");
    expect(report.body.report.paidOutCents).toBeGreaterThanOrEqual(30000);
    expect(report.body.report.reservePercent).toBe(40);
  });

  it("keeps dispatchers out of claims", async () => {
    const d = request.agent(app);
    await d.post("/v1/admin/auth/login").send({ email: emails.disp, password: pw });
    expect((await d.get("/v1/admin/protection/claims")).status).toBe(403);
  });
});
