/**
 * Quote intake in Spanish: customer.language is stored, the response/confirmation are Spanish,
 * and a protection tier is dropped unless the protection module is live.
 */
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

const hasDb = !!process.env.DATABASE_URL || (() => { try { process.loadEnvFile(".env"); return !!process.env.DATABASE_URL; } catch { return false; } })();

describe.skipIf(!hasDb)("quote language & protection", async () => {
  const { app } = await import("../app");
  const { prisma } = await import("../db");
  const tag = randomBytes(3).toString("hex");
  const emails: string[] = [];
  const body = (over: Record<string, unknown> = {}) => {
    const email = `lang-${tag}-${emails.length}@example.org`;
    emails.push(email);
    return {
      serviceType: "luggage-local",
      pickup: { type: "hotel", address: "Hotel en Miami Beach", market: "miami" },
      delivery: { type: "airport", address: "MIA Terminal D", facility: "MIA", market: "miami" },
      serviceDate: "2026-11-14",
      timeWindow: "morning",
      items: [{ category: "standard-checked", quantity: 2 }],
      contact: { name: "Prueba Español", email, phone: "305-555-0100" },
      leadSource: "referral",
      acceptsProhibitedItemsPolicy: true,
      consentToContact: true,
      ...over,
    };
  };
  afterAll(async () => {
    const customers = await prisma.customer.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const ids = customers.map((c) => c.id);
    await prisma.quoteEvent.deleteMany({ where: { quote: { customerId: { in: ids } } } });
    await prisma.quoteRequest.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  });

  it("stores language es on the customer and payload and answers in Spanish", async () => {
    const res = await request(app).post("/v1/quotes").send(body({ language: "es" }));
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/Gracias/);
    const q = await prisma.quoteRequest.findUnique({ where: { reference: res.body.reference }, include: { customer: true } });
    expect(q?.customer.language).toBe("es");
    expect((q?.payload as { language?: string }).language).toBe("es");
  });

  it("keeps English for English requests", async () => {
    const res = await request(app).post("/v1/quotes").send(body({ language: "en" }));
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/^Thank you/);
  });

  it("rejects an unknown language and drops protection while the module is not live", async () => {
    expect((await request(app).post("/v1/quotes").send(body({ language: "fr" }))).status).toBe(400);
    const features = await prisma.setting.findUnique({ where: { key: "features" } });
    if ((features?.value as { protectionEnabled?: boolean } | undefined)?.protectionEnabled) return; // live in this DB: covered elsewhere
    const res = await request(app).post("/v1/quotes").send(body({ protectionTier: "vip" }));
    expect(res.status).toBe(201);
    const q = await prisma.quoteRequest.findUnique({ where: { reference: res.body.reference } });
    expect((q?.payload as { protectionTier?: string }).protectionTier).toBeUndefined();
  });
});
