/**
 * Carriers module integration tests (supertest + dev Postgres; mock carrier + payment providers).
 * Covers: staff rate shop + label purchase (one per piece, private label PDF), void, roles,
 * EasyPost webhook signature + de-duplication + order transitions, public instant shipping disabled
 * by default, owner-only approval gated on a ≥20-scenario test run, instant quote/book with no
 * cost leakage. Feature flags are always restored afterwards (shared dev DB).
 */
import { createHmac, randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL || (() => { try { process.loadEnvFile(".env"); return !!process.env.DATABASE_URL; } catch { return false; } })();
const LEAK = /costCents|unitCostCents|marginPct|marginPercent|markupPercent|profitCents|carrierService|providerRateId|billableCostCents/;

describe.skipIf(!hasDb)("carriers API", async () => {
  const { app } = await import("../../../app");
  const { prisma } = await import("../../../db");
  const { hashPassword } = await import("../../../auth");
  const { createOrder } = await import("../../../services/orders");
  const { getSetting, updateSetting } = await import("../../../settings");

  const pw = "Test-Password-123!";
  const tag = randomBytes(3).toString("hex");
  const emails = { owner: `c-owner-${tag}@test.local`, staff: `c-staff-${tag}@test.local`, acct: `c-acct-${tag}@test.local` };
  const customerEmail = `carriers-${tag}@example.org`;
  const SECRET = "whsec_test_carriers";
  let savedFeatures: Awaited<ReturnType<typeof getSetting<"features">>>;
  let orderId = "";
  let customerId = "";

  beforeAll(async () => {
    process.env.EASYPOST_WEBHOOK_SECRET = SECRET;
    savedFeatures = await getSetting("features");
    const passwordHash = await hashPassword(pw);
    await prisma.user.createMany({
      data: [
        { email: emails.owner, role: "OWNER", passwordHash },
        { email: emails.staff, role: "STAFF", passwordHash },
        { email: emails.acct, role: "ACCOUNTING", passwordHash },
      ],
    });
    const c = await prisma.customer.create({ data: { email: customerEmail, name: "Carrier Test" } });
    customerId = c.id;
    const o = await createOrder({
      customerId,
      serviceType: "nationwide-shipping",
      fulfillment: "nationwide",
      pickup: { type: "hotel", address: "Hotel in Miami Beach", market: "miami" },
      delivery: { type: "residence", address: "350 5th Ave, New York, NY 10118", market: "outside-florida" },
      serviceDate: new Date(Date.now() + 5 * 86_400_000),
      market: "miami",
      pieces: [{ category: "standard-checked" }, { category: "carry-on" }],
    });
    orderId = o.id;
  });

  afterAll(async () => {
    await updateSetting("features", savedFeatures);
    const users = await prisma.user.findMany({ where: { email: { in: Object.values(emails) } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.pricingApproval.deleteMany({ where: { approvedById: { in: ids } } });
    await prisma.pricingTestRun.deleteMany({ where: { runById: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    const customers = await prisma.customer.findMany({ where: { email: { startsWith: `carriers-${tag}` } }, select: { id: true } });
    const cids = customers.map((x) => x.id);
    const orders = await prisma.order.findMany({ where: { customerId: { in: cids } }, select: { id: true, quotationId: true } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
    await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    await prisma.quotation.deleteMany({ where: { customerId: { in: cids } } });
    await prisma.customer.deleteMany({ where: { id: { in: cids } } });
  });

  const login = async (email: string) => {
    const agent = request.agent(app);
    const res = await agent.post("/v1/admin/auth/login").send({ email, password: pw });
    expect(res.status).toBe(200);
    return agent;
  };

  const sign = (body: string) => `hmac-sha256-hex=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

  it("blocks roles without shipping access", async () => {
    const acct = await login(emails.acct);
    expect((await acct.get("/v1/admin/carriers/shipments")).status).toBe(403);
    expect((await request(app).get("/v1/admin/carriers/shipments")).status).toBe(401);
  });

  it("staff rate-shops an order and sees internal economics", async () => {
    const staff = await login(emails.staff);
    const res = await staff.post(`/v1/admin/carriers/orders/${orderId}/rates`).send({});
    expect(res.status).toBe(200);
    expect(res.body.result.status).toBe("priced");
    const std = res.body.result.offers.find((o: { level: string }) => o.level === "standard");
    expect(std.costCents).toBeGreaterThan(0);
    expect(std.retailCents).toBeGreaterThan(std.costCents);
    expect(res.body.result.parcels).toHaveLength(2);
  });

  let shipmentIds: string[] = [];
  let trackingNumbers: string[] = [];

  it("buys one label per piece and serves the label PDF privately", async () => {
    const staff = await login(emails.staff);
    const res = await staff.post(`/v1/admin/carriers/orders/${orderId}/labels`).send({ level: "standard" });
    expect(res.status).toBe(201);
    expect(res.body.shipments).toHaveLength(2);
    shipmentIds = res.body.shipments.map((s: { id: string }) => s.id);
    trackingNumbers = res.body.shipments.map((s: { trackingNumber: string }) => s.trackingNumber);
    const label = await staff.get(`/v1/admin/carriers/shipments/${shipmentIds[0]}/label`).buffer(true);
    expect(label.status).toBe(200);
    expect(label.headers["content-type"]).toMatch(/pdf/);
    expect(Buffer.from(label.body).subarray(0, 4).toString()).toBe("%PDF");
    expect((await request(app).get(`/v1/admin/carriers/shipments/${shipmentIds[0]}/label`)).status).toBe(401);
    // A second purchase is refused while labels are active
    expect((await staff.post(`/v1/admin/carriers/orders/${orderId}/labels`).send({ level: "standard" })).status).toBe(409);
  });

  it("rejects webhooks with a bad signature", async () => {
    const body = JSON.stringify({ id: `evt_${tag}_bad`, description: "tracker.updated", result: { tracking_code: trackingNumbers[0], status: "in_transit" } });
    const res = await request(app).post("/v1/webhooks/carriers").set("Content-Type", "application/json").set("X-Hmac-Signature", "hmac-sha256-hex=deadbeef").send(body);
    expect(res.status).toBe(401);
  });

  it("applies carrier events, de-duplicates them, and moves the order to delivered", async () => {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    // The bags are picked up first (driver flow) so the carrier handoff is a legal transition
    await prisma.order.update({ where: { id: order.id }, data: { status: "PICKED_UP" } });
    const send = (id: string, tracking: string, status: string) => {
      const body = JSON.stringify({ id, description: "tracker.updated", result: { tracking_code: tracking, status, tracking_details: [{ datetime: new Date().toISOString(), status, message: status, tracking_location: { city: "Doral", state: "FL" } }] } });
      return request(app).post("/v1/webhooks/carriers").set("Content-Type", "application/json").set("X-Hmac-Signature", sign(body)).send(body);
    };
    const first = await send(`evt_${tag}_1`, trackingNumbers[0], "in_transit");
    expect(first.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("IN_TRANSIT");
    const dup = await send(`evt_${tag}_1`, trackingNumbers[0], "in_transit");
    expect(dup.body.duplicate).toBe(true);
    await send(`evt_${tag}_2`, trackingNumbers[0], "delivered");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("IN_TRANSIT"); // one bag still travelling
    await send(`evt_${tag}_3`, trackingNumbers[1], "delivered");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("DELIVERED");
    await prisma.webhookEvent.deleteMany({ where: { eventId: { startsWith: `evt_${tag}` } } });
  });

  it("refuses to void a label after the carrier has it", async () => {
    const staff = await login(emails.staff);
    expect((await staff.post(`/v1/admin/carriers/shipments/${shipmentIds[0]}/void`)).status).toBe(409);
  });

  it("keeps public instant shipping off by default", async () => {
    await updateSetting("features", { pricingEnabled: false, instantBookingEnabled: false, carrierShippingEnabled: false });
    const res = await request(app).post("/v1/shipping/quote").send(publicRequest());
    expect(res.status).toBe(404);
    const cfg = await request(app).get("/v1/public-config");
    expect(cfg.body.instantBookingEnabled).toBe(false);
    expect(cfg.body.carrierShippingEnabled).toBe(false);
  });

  it("lets only the owner approve, and only after a 20+ scenario test run", async () => {
    const staff = await login(emails.staff);
    const owner = await login(emails.owner);
    const run = await staff.post("/v1/admin/carriers/sandbox/run").send({});
    expect(run.status).toBe(201);
    expect(run.body.results.length).toBeGreaterThanOrEqual(20);
    expect(JSON.stringify(run.body.results.find((r: { group: string }) => r.group === "custom"))).toMatch(/custom-quote|special-route/);
    expect((await staff.post("/v1/admin/carriers/sandbox/approve").send({ enable: true, testRunId: run.body.run.id, statement: "Reviewed all scenarios" })).status).toBe(403);
    const small = await staff.post("/v1/admin/carriers/sandbox/run").send({ ids: ["l1", "n1"] });
    expect((await owner.post("/v1/admin/carriers/sandbox/approve").send({ enable: true, testRunId: small.body.run.id, statement: "Too few scenarios" })).status).toBe(409);
    const ok = await owner.post("/v1/admin/carriers/sandbox/approve").send({ enable: true, carrierShipping: true, testRunId: run.body.run.id, statement: "Reviewed all 25 scenarios with Carlos" });
    expect(ok.status).toBe(200);
    const f = await getSetting("features");
    expect(f.pricingEnabled && f.instantBookingEnabled && f.carrierShippingEnabled).toBe(true);
  });

  function publicRequest() {
    return {
      serviceType: "nationwide-shipping",
      pickup: { type: "hotel", address: "Hotel in Miami Beach", market: "miami" },
      delivery: { type: "residence", address: "233 S Wacker Dr, Chicago, IL 60606", market: "outside-florida" },
      serviceDate: new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10),
      timeWindow: "morning",
      speed: "standard",
      items: [{ category: "standard-checked", quantity: 2, weightLbs: 45, lengthIn: 27, widthIn: 19, heightIn: 11 }],
      contact: { name: "Instant Shipper", email: `carriers-${tag}-instant@example.org`, phone: "305-555-0177" },
      leadSource: "google-search",
      acceptsProhibitedItemsPolicy: true,
      consentToContact: true,
    };
  }

  it("returns instant service levels without any internal economics, then books via checkout", async () => {
    const q = await request(app).post("/v1/shipping/quote").send(publicRequest());
    expect(q.status).toBe(200);
    expect(q.body.available).toBe(true);
    expect(JSON.stringify(q.body)).not.toMatch(LEAK);
    const offer = q.body.offers.find((o: { level: string }) => o.level === "standard") ?? q.body.offers[0];
    expect(offer.price).toBeGreaterThan(0);
    // A tampered request is refused
    const tampered = { ...publicRequest(), items: [{ category: "standard-checked", quantity: 1, weightLbs: 45, lengthIn: 27, widthIn: 19, heightIn: 11 }] };
    expect((await request(app).post("/v1/shipping/book").send({ request: tampered, priceToken: offer.priceToken, acceptName: "Instant Shipper" })).status).toBe(409);
    const book = await request(app).post("/v1/shipping/book").send({ request: publicRequest(), priceToken: offer.priceToken, acceptName: "Instant Shipper" });
    expect(book.status).toBe(201);
    expect(book.body.checkoutUrl).toMatch(/mock-checkout|checkout/);
    expect(JSON.stringify(book.body)).not.toMatch(LEAK);
    const order = await prisma.order.findUniqueOrThrow({ where: { reference: book.body.orderReference }, include: { pieces: true } });
    expect(order.fulfillment).toBe("nationwide");
    expect(order.pieces).toHaveLength(2);
    expect(order.retailCents).toBe(Math.round(offer.price * 100));
  });

  it("owner can switch public pricing back off", async () => {
    const owner = await login(emails.owner);
    const res = await owner.post("/v1/admin/carriers/sandbox/approve").send({ enable: false });
    expect(res.status).toBe(200);
    expect((await getSetting("features")).pricingEnabled).toBe(false);
  });
});
