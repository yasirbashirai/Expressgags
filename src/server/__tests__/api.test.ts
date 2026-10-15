/**
 * API integration tests (supertest) against a real Postgres (Prisma dev server / DATABASE_URL).
 * Skipped automatically when no database is reachable.
 */
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

const hasDb = !!process.env.DATABASE_URL || (() => { try { process.loadEnvFile(".env"); return !!process.env.DATABASE_URL; } catch { return false; } })();

const sample = () => ({
  serviceType: "luggage-local",
  pickup: { type: "hotel", address: "Hotel in Miami Beach, FL 33139", market: "miami" },
  delivery: { type: "airport", address: "MIA Terminal D", facility: "MIA", market: "miami" },
  serviceDate: "2026-11-14",
  timeWindow: "morning",
  items: [{ category: "standard-checked", quantity: 2 }],
  contact: { name: "API Test", email: `api-${randomBytes(3).toString("hex")}@example.org`, phone: "305-555-0100" },
  leadSource: "referral",
  acceptsProhibitedItemsPolicy: true,
  consentToContact: true,
});

describe.skipIf(!hasDb)("API", async () => {
  const { app } = await import("../app");
  const { prisma } = await import("../db");
  const { hashPassword } = await import("../auth");
  const pw = "Test-Password-123!";
  const tag = randomBytes(3).toString("hex");
  const emails = { owner: `owner-${tag}@test.local`, staff: `staff-${tag}@test.local`, dispatcher: `disp-${tag}@test.local` };

  beforeAll(async () => {
    const passwordHash = await hashPassword(pw);
    await prisma.user.createMany({
      data: [
        { email: emails.owner, role: "OWNER", passwordHash },
        { email: emails.staff, role: "STAFF", passwordHash },
        { email: emails.dispatcher, role: "DISPATCHER", passwordHash },
      ],
    });
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { user: { email: { in: Object.values(emails) } } } });
    await prisma.quoteNote.deleteMany({ where: { author: { email: { in: Object.values(emails) } } } });
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  });

  const login = async (email: string) => {
    const agent = request.agent(app);
    const res = await agent.post("/v1/admin/auth/login").send({ email, password: pw });
    expect(res.status).toBe(200);
    return agent;
  };

  it("health", async () => {
    const res = await request(app).get("/v1/health");
    expect(res.body).toEqual({ ok: true, service: "express-bags-api" });
  });

  it("stores a valid quote and returns a reference", async () => {
    const res = await request(app).post("/v1/quotes").send(sample());
    expect(res.status).toBe(201);
    expect(res.body.reference).toMatch(/^EB-Q-\d{6}-[A-Z2-9]{4}$/);
    expect(res.body.route).toBe("standard-quote");
    const row = await prisma.quoteRequest.findUnique({ where: { reference: res.body.reference } });
    expect(row?.totalPieces).toBe(2);
  });

  it("routes a 40-truck group to custom quote", async () => {
    const res = await request(app).post("/v1/quotes").send({ ...sample(), serviceType: "group-event", vehiclesNeeded: "about 40 trucks" });
    expect(res.status).toBe(201);
    expect(res.body.route).toBe("custom-quote");
  });

  it("rejects an invalid quote with field errors", async () => {
    const res = await request(app).post("/v1/quotes").send({ ...sample(), contact: { name: "x", email: "bad", phone: "1" }, acceptsProhibitedItemsPolicy: false });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    const paths = res.body.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["contact.email", "acceptsProhibitedItemsPolicy"]));
  });

  it("honeypot: pretends success and stores nothing", async () => {
    const body = { ...sample(), website: "http://spam.example" };
    const before = await prisma.quoteRequest.count();
    const res = await request(app).post("/v1/quotes").send(body);
    expect(res.status).toBe(201);
    expect(await prisma.quoteRequest.count()).toBe(before);
  });

  it("admin routes require a session (401)", async () => {
    expect((await request(app).get("/v1/admin/quotes")).status).toBe(401);
    expect((await request(app).post("/v1/admin/auth/login").send({ email: emails.owner, password: "wrong" })).status).toBe(401);
  });

  it("roles: dispatcher can update status but not export or change settings (403)", async () => {
    const quote = await request(app).post("/v1/quotes").send(sample());
    const row = await prisma.quoteRequest.findUniqueOrThrow({ where: { reference: quote.body.reference } });
    const disp = await login(emails.dispatcher);
    expect((await disp.patch(`/v1/admin/quotes/${row.id}/status`).send({ status: "REVIEWING" })).status).toBe(200);
    expect((await disp.get("/v1/admin/quotes/export.csv")).status).toBe(403);
    expect((await disp.patch("/v1/admin/settings/features").send({ pricingEnabled: true })).status).toBe(403);
    const staff = await login(emails.staff);
    expect((await staff.get("/v1/admin/quotes/export.csv")).status).toBe(200);
    expect((await staff.patch("/v1/admin/settings/features").send({ pricingEnabled: true })).status).toBe(403);
  });

  it("owner can read settings, preview pricing and add notes", async () => {
    const owner = await login(emails.owner);
    const s = await owner.get("/v1/admin/settings");
    expect(s.body.settings.features.pricingEnabled).toBe(false);
    const prev = await owner.post("/v1/admin/pricing-preview").send({ engine: "local", input: { pickupZone: "MIA-BEACH", deliveryZone: "MIA-BEACH", pieces: [{ category: "large", quantity: 2 }] } });
    expect(prev.status).toBe(200);
    expect(prev.body.result.retailCents).toBeGreaterThan(0);
    const latest = await prisma.quoteRequest.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect((await owner.post(`/v1/admin/quotes/${latest.id}/notes`).send({ body: "Called the guest." })).status).toBe(201);
    const detail = await owner.get(`/v1/admin/quotes/${latest.id}`);
    expect(detail.body.quote.notes[0].body).toBe("Called the guest.");
  });

  it("public config never exposes pricing while disabled", async () => {
    const res = await request(app).get("/v1/public-config");
    expect(res.body).toMatchObject({ ok: true, pricingEnabled: false });
  });
});
