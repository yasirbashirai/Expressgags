/**
 * Money module integration tests (supertest + real dev Postgres; mock payment provider).
 * Covers: quotation build → send → public view (no cost leakage) → idempotent acceptance → order,
 * deposit checkout, link security, expiry, Stripe webhook signature + de-duplication, invoice numbering
 * under concurrency, invoice payment, role checks, instant pricing disabled by default.
 */
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

const hasDb = !!process.env.DATABASE_URL || (() => { try { process.loadEnvFile(".env"); return !!process.env.DATABASE_URL; } catch { return false; } })();

const LEAK = /costCents|unitCostCents|marginPct|marginPercent|markupPercent|profitCents/;

describe.skipIf(!hasDb)("money API", async () => {
  const { app } = await import("../../../app");
  const { prisma } = await import("../../../db");
  const { hashPassword } = await import("../../../auth");
  const { nextSequence } = await import("../money");
  const Stripe = (await import("stripe")).default;

  const pw = "Test-Password-123!";
  const tag = randomBytes(3).toString("hex");
  const emails = { owner: `m-owner-${tag}@test.local`, acct: `m-acct-${tag}@test.local`, disp: `m-disp-${tag}@test.local` };
  const customerEmail = `money-${tag}@example.org`;

  beforeAll(async () => {
    const passwordHash = await hashPassword(pw);
    await prisma.user.createMany({
      data: [
        { email: emails.owner, role: "OWNER", passwordHash },
        { email: emails.acct, role: "ACCOUNTING", passwordHash },
        { email: emails.disp, role: "DISPATCHER", passwordHash },
      ],
    });
  });
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: Object.values(emails) } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.quotation.updateMany({ where: { createdById: { in: ids } }, data: { createdById: null } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  const login = async (email: string) => {
    const agent = request.agent(app);
    const res = await agent.post("/v1/admin/auth/login").send({ email, password: pw });
    expect(res.status).toBe(200);
    return agent;
  };

  const quoteRequest = async () => {
    const res = await request(app)
      .post("/v1/quotes")
      .send({
        serviceType: "luggage-local",
        pickup: { type: "hotel", address: "Hotel on Collins Ave, Miami Beach", market: "miami" },
        delivery: { type: "cruise-port", address: "PortMiami Terminal A", facility: "portmiami", market: "miami" },
        serviceDate: "2026-12-05",
        timeWindow: "morning",
        items: [{ category: "standard-checked", quantity: 3 }, { category: "carry-on", quantity: 1 }],
        contact: { name: "Money Test", email: customerEmail, phone: "305-555-0101" },
        leadSource: "referral",
        acceptsProhibitedItemsPolicy: true,
        consentToContact: true,
      });
    expect(res.status).toBe(201);
    return prisma.quoteRequest.findUniqueOrThrow({ where: { reference: res.body.reference } });
  };

  const buildBody = (prefill: { customer: { id: string }; details: unknown; quoteRequest: { id: string } }, deposit = { type: "percent", value: 25 }) => ({
    customerId: prefill.customer.id,
    quoteRequestId: prefill.quoteRequest.id,
    title: "Hotel to PortMiami transfer",
    depositType: deposit.type,
    depositValue: deposit.value,
    lines: [
      { kind: "transport", description: "Hotel to PortMiami, cargo van", quantity: 1, unitCents: 14000, unitCostCents: 10000 },
      { kind: "handling", description: "Luggage handling, 4 pieces", quantity: 4, unit: "piece", unitCents: 1500, unitCostCents: 500 },
    ],
    details: prefill.details,
  });

  let token = "";
  let quotationId = "";

  it("builds, sends and shows a quotation with no internal economics", async () => {
    const owner = await login(emails.owner);
    const qr = await quoteRequest();
    const prefill = (await owner.get(`/v1/admin/quotations/prefill/${qr.id}`)).body;
    expect(prefill.details.items).toHaveLength(2);

    const created = await owner.post("/v1/admin/quotations").send(buildBody(prefill));
    expect(created.status).toBe(201);
    quotationId = created.body.quotation.id;
    expect(created.body.quotation.totalCents).toBe(20000);
    expect(created.body.quotation.depositCents).toBe(5000);

    const detail = await owner.get(`/v1/admin/quotations/${quotationId}`);
    expect(detail.body.math.costCents).toBe(12000);
    expect(detail.body.math.marginPercent).toBe(40);
    expect(detail.body.math.markupPercent).toBe(66.7);

    // Drafts are not reachable publicly
    const draftToken = created.body.quotation.publicToken;
    expect((await request(app).get(`/v1/q/${draftToken}`)).status).toBe(404);

    const sent = await owner.post(`/v1/admin/quotations/${quotationId}/send`);
    expect(sent.status).toBe(200);
    token = sent.body.link.split("/q/")[1];
    expect((await prisma.quoteRequest.findUniqueOrThrow({ where: { id: qr.id } })).status).toBe("QUOTED");

    const pub = await request(app).get(`/v1/q/${token}`);
    expect(pub.status).toBe(200);
    expect(pub.body.quotation.status).toBe("VIEWED");
    expect(pub.body.quotation.totalCents).toBe(20000);
    expect(JSON.stringify(pub.body)).not.toMatch(LEAK);

    const pdf = await request(app).get(`/v1/q/${token}/pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect((pdf.body as Buffer).toString("latin1").slice(0, 5)).toBe("%PDF-");
  });

  it("rejects guessed and malformed links", async () => {
    expect((await request(app).get(`/v1/q/${"A".repeat(32)}`)).status).toBe(404);
    expect((await request(app).get("/v1/q/not-a-token")).status).toBe(404);
    expect((await request(app).get("/v1/pay/invoice/0000")).status).toBe(404);
  });

  it("accepts idempotently (two simultaneous clicks → one order)", async () => {
    const body = { name: "Money Test", title: "Guest", agree: true };
    const [a, b] = await Promise.all([request(app).post(`/v1/q/${token}/accept`).send(body), request(app).post(`/v1/q/${token}/accept`).send(body)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.orderReference).toBe(b.body.orderReference);
    expect(a.body.depositDue).toBe(true);
    const orders = await prisma.order.findMany({ where: { quotationId }, include: { pieces: true } });
    expect(orders).toHaveLength(1);
    expect(orders[0].pieces).toHaveLength(4);
    expect(orders[0].retailCents).toBe(20000);
    expect(orders[0].costCents).toBe(12000);
    const q = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId } });
    expect(q.status).toBe("CONVERTED");
    expect(q.acceptedName).toBe("Money Test");
    expect(q.acceptedIp).toBeTruthy();
    // Accepting a third time still returns the same order
    const again = await request(app).post(`/v1/q/${token}/accept`).send(body);
    expect(again.body.orderReference).toBe(a.body.orderReference);
  });

  it("collects the deposit through the mock checkout", async () => {
    const dep = await request(app).post(`/v1/q/${token}/deposit`);
    expect(dep.status).toBe(200);
    const session = new URL(dep.body.checkoutUrl).searchParams.get("session")!;
    expect(dep.body.checkoutUrl).toContain("/pay/mock-checkout");
    const info = await request(app).get(`/v1/pay/mock/${session}`);
    expect(info.body.amountCents).toBe(5000);
    expect((await request(app).post(`/v1/pay/mock/${session}/complete`).send({ outcome: "succeeded" })).status).toBe(200);
    // Completing twice is harmless
    expect((await request(app).post(`/v1/pay/mock/${session}/complete`).send({})).status).toBe(200);
    const order = await prisma.order.findFirstOrThrow({ where: { quotationId }, include: { payments: true } });
    expect(order.paymentStatus).toBe("DEPOSIT_PAID");
    expect(order.payments.filter((p) => p.status === "SUCCEEDED")).toHaveLength(1);
    expect((await request(app).get(`/v1/pay/status/${session}`)).body.status).toBe("SUCCEEDED");
    // A second deposit cannot be started
    expect((await request(app).post(`/v1/q/${token}/deposit`)).status).toBe(409);
  });

  it("expires quotations past their validity date", async () => {
    const owner = await login(emails.owner);
    const qr = await quoteRequest();
    const prefill = (await owner.get(`/v1/admin/quotations/prefill/${qr.id}`)).body;
    const created = await owner.post("/v1/admin/quotations").send(buildBody(prefill, { type: "none", value: 0 }));
    const sent = await owner.post(`/v1/admin/quotations/${created.body.quotation.id}/send`);
    const t = sent.body.link.split("/q/")[1];
    await prisma.quotation.update({ where: { id: created.body.quotation.id }, data: { validUntil: new Date(Date.now() - 60000) } });
    const pub = await request(app).get(`/v1/q/${t}`);
    expect(pub.body.quotation.status).toBe("EXPIRED");
    const acc = await request(app).post(`/v1/q/${t}/accept`).send({ name: "Late Person", agree: true });
    expect(acc.status).toBe(409);
  });

  it("invoices the order, nets the deposit, and gets paid online", async () => {
    const owner = await login(emails.owner);
    const order = await prisma.order.findFirstOrThrow({ where: { quotationId } });
    const created = await owner.post("/v1/admin/billing/invoices").send({ orderIds: [order.id], send: true, dueDays: 15 });
    expect(created.status).toBe(201);
    const inv = created.body.invoice;
    expect(inv.number).toMatch(/^EB-INV-\d{6}$/);
    expect(inv.totalCents).toBe(15000); // $200 less $50 deposit
    expect(inv.status).toBe("SENT");
    // Cannot invoice the same order twice
    expect((await owner.post("/v1/admin/billing/invoices").send({ orderIds: [order.id] })).status).toBe(409);

    const pub = await request(app).get(`/v1/pay/invoice/${inv.publicToken}`);
    expect(pub.status).toBe(200);
    expect(pub.body.invoice.balanceCents).toBe(15000);
    expect(JSON.stringify(pub.body)).not.toMatch(LEAK);

    const co = await request(app).post(`/v1/pay/invoice/${inv.publicToken}/checkout`);
    const session = new URL(co.body.checkoutUrl).searchParams.get("session")!;
    await request(app).post(`/v1/pay/mock/${session}/complete`).send({});
    const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(paid.status).toBe("PAID");
    expect(paid.paidCents).toBe(15000);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("PAID");

    const pdf = await owner.get(`/v1/admin/billing/invoices/${inv.id}/pdf`);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    const aging = await owner.get("/v1/admin/billing/aging");
    expect(aging.status).toBe(200);
    expect(aging.body.aging.buckets).toHaveProperty("90+");
  });

  it("numbers invoices without duplicates under concurrency", async () => {
    const values = await Promise.all(Array.from({ length: 25 }, () => nextSequence(`test-seq-${tag}`)));
    expect(new Set(values).size).toBe(25);
    expect(Math.max(...values)).toBe(25);
  });

  it("verifies and de-duplicates Stripe webhooks", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests";
    const order = await prisma.order.findFirstOrThrow({ where: { quotationId } });
    const ref = `cs_test_${tag}`;
    await prisma.payment.create({ data: { method: "stripe", kind: "PAYMENT", status: "PENDING", amountCents: 1000, orderId: order.id, providerRef: ref } });
    const payload = JSON.stringify({ id: `evt_${tag}`, object: "event", type: "checkout.session.completed", data: { object: { id: ref, object: "checkout.session", payment_status: "paid" } } });
    const header = new Stripe("sk_test_placeholder").webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });

    const bad = await request(app).post("/v1/webhooks/stripe").set("content-type", "application/json").set("stripe-signature", "t=1,v1=bad").send(payload);
    expect(bad.status).toBe(400);
    const ok = await request(app).post("/v1/webhooks/stripe").set("content-type", "application/json").set("stripe-signature", header).send(payload);
    expect(ok.status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { providerRef: ref } })).status).toBe("SUCCEEDED");
    const dup = await request(app).post("/v1/webhooks/stripe").set("content-type", "application/json").set("stripe-signature", header).send(payload);
    expect(dup.body.duplicate).toBe(true);
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("enforces money roles", async () => {
    const disp = await login(emails.disp);
    expect((await disp.get("/v1/admin/billing/invoices")).status).toBe(403);
    expect((await disp.post("/v1/admin/billing/payments").send({ method: "cash", amountCents: 100, orderId: "x" })).status).toBe(403);
    expect((await disp.get("/v1/admin/quotations")).status).toBe(403);
    const dash = await disp.get("/v1/admin/reports/dashboard");
    expect(dash.status).toBe(200);
    expect(dash.body.money).toBeNull();

    const acct = await login(emails.acct);
    const order = await prisma.order.findFirstOrThrow({ where: { quotationId } });
    const manual = await acct.post("/v1/admin/billing/payments").send({ method: "check", amountCents: 500, orderId: order.id, note: "Check #1001" });
    expect(manual.status).toBe(201);
    const refund = await acct.post(`/v1/admin/billing/payments/${manual.body.payment.id}/refund`).send({ amountCents: 500 });
    expect(refund.status).toBe(201);
    expect((await acct.post(`/v1/admin/billing/payments/${manual.body.payment.id}/refund`).send({ amountCents: 1 })).status).toBe(400);
    const acctDash = await acct.get("/v1/admin/reports/dashboard");
    expect(acctDash.body.money.collected).toBeTruthy();
    expect(acctDash.body.ops).toBeNull();
  });

  it("keeps instant pricing off by default", async () => {
    const valid = {
      serviceType: "luggage-local",
      pickup: { type: "hotel", address: "Hotel, Miami", market: "miami" },
      delivery: { type: "airport", address: "MIA", facility: "MIA", market: "miami" },
      serviceDate: "2026-12-05",
      timeWindow: "morning",
      items: [{ category: "carry-on", quantity: 1 }],
      contact: { name: "X Y", email: customerEmail, phone: "305-555-0101" },
      leadSource: "referral",
      acceptsProhibitedItemsPolicy: true,
      consentToContact: true,
    };
    const r = await request(app).post("/v1/pay/instant-quote").send(valid);
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toMatch(LEAK);
  });

  it("reports summary and CSV", async () => {
    const owner = await login(emails.owner);
    const s = await owner.get("/v1/admin/reports/summary");
    expect(s.status).toBe(200);
    expect(Array.isArray(s.body.report.byService)).toBe(true);
    const c = await owner.get("/v1/admin/reports/summary.csv?table=byMarket");
    expect(c.headers["content-type"]).toContain("text/csv");
  });
});
