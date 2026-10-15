/**
 * Privacy & data-leak sweep across every customer-facing surface (tracking, portal, quotation and
 * invoice links, driver app): responses are deep-scanned for internal economics, credentials,
 * employee identities (beyond the assigned driver's first name), the private HQ street address,
 * and other customers' data. Also checks cross-customer IDOR on the portal.
 */
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../app";
import { prisma } from "../../db";
import { publicToken, quotationReference } from "../../lib/reference";
import { cleanupFixture, createAssignedJob, createDriver } from "../../modules/driver/__tests__/fixtures";

const tag = randomBytes(3).toString("hex");
const ORIGIN = "http://localhost:3000";
/** Keys that must never appear in a customer/public/driver response. */
const FORBIDDEN_KEYS = /^(costCents|unitCostCents|marginPct|markupPct|profitCents|pricingBreakdown|internalNotes|passwordHash|totpSecret|totpRecoveryCodes|tokenVersion|ipHash|addressPrivate|qboError|hubspotError|aiSummary)$/;

type Ctx = Awaited<ReturnType<typeof createDriver>> & Awaited<ReturnType<typeof createAssignedJob>>;
let ctx: Ctx;
let other: { id: string; email: string };
let quotationToken = "";
let invoiceToken = "";
let customerCookie = "";
let otherCookie = "";
let driverCookie = "";

function scan(value: unknown, path = "$", found: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v, i) => scan(v, `${path}[${i}]`, found));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.test(k)) found.push(`${path}.${k}`);
      scan(v, `${path}.${k}`, found);
    }
  } else if (typeof value === "string") {
    if (/7500\s*N\.?W\.?\s*55/i.test(value)) found.push(`${path} contains the private HQ street address`);
    if (ctx && value.includes(ctx.employee.lastName)) found.push(`${path} contains the driver's last name`);
    if (ctx && value.includes(ctx.user.email)) found.push(`${path} contains a staff email`);
    if (other && value.includes(other.email)) found.push(`${path} contains another customer's email`);
  }
  return found;
}

const customerJwt = (id: string) => "eb_customer=" + jwt.sign({ sub: id, typ: "customer" }, process.env.JWT_SECRET + ":customer", { expiresIn: 600 });

beforeAll(async () => {
  const driver = await createDriver(`priv${tag}`);
  const job = await createAssignedJob(driver.employee.id, { tag: `priv${tag}` });
  ctx = { ...driver, ...job };
  await prisma.customer.update({ where: { id: job.customer.id }, data: { passwordHash: "x", emailVerifiedAt: new Date() } });
  await prisma.order.update({
    where: { id: job.order.id },
    data: { status: "DRIVER_ASSIGNED", assignedDriverRef: driver.employee.id, costCents: 4200, retailCents: 9900, internalNotes: "Margin is thin, cost $42", pricingBreakdown: { costCents: 4200 } },
  });
  const o = await prisma.customer.create({ data: { name: `Other ${tag}`, email: `other-${tag}@example.org`, passwordHash: "x", emailVerifiedAt: new Date() } });
  other = { id: o.id, email: o.email };
  quotationToken = publicToken();
  await prisma.quotation.create({
    data: {
      reference: quotationReference(), customerId: job.customer.id, title: "Hotel to PortMiami", status: "SENT", publicToken: quotationToken,
      subtotalCents: 9900, totalCents: 9900, costCents: 4200, marginPct: 57.6,
      lines: { create: [{ kind: "transport", description: "Box truck", unitCents: 9900, unitCostCents: 4200, totalCents: 9900 }] },
    },
  });
  invoiceToken = publicToken();
  await prisma.invoice.create({ data: { number: `EB-INV-SEC-${tag}`, customerId: job.customer.id, status: "SENT", publicToken: invoiceToken, subtotalCents: 9900, totalCents: 9900, lines: { create: [{ description: "Transfer", unitCents: 9900, totalCents: 9900, orderId: job.order.id }] } } });
  customerCookie = customerJwt(job.customer.id);
  otherCookie = customerJwt(o.id);
  driverCookie = "eb_admin=" + jwt.sign({ sub: driver.user.id, role: "DRIVER", tv: 0 }, process.env.JWT_SECRET!, { expiresIn: 600 });
}, 60_000);

afterAll(async () => {
  await prisma.invoice.deleteMany({ where: { number: `EB-INV-SEC-${tag}` } });
  await prisma.quotation.deleteMany({ where: { publicToken: quotationToken } });
  await prisma.customer.deleteMany({ where: { id: other.id } });
  await cleanupFixture({ userIds: [ctx.user.id], employeeIds: [ctx.employee.id], customerIds: [ctx.customer.id] });
});

describe("customer-facing responses never leak internals", () => {
  it("public tracking (verified) shows only the driver's first name", async () => {
    const r = await request(app).post("/v1/track").set("Origin", ORIGIN).send({ reference: ctx.order.reference, verifier: ctx.customer.email });
    expect(r.status).toBe(200);
    expect(scan(r.body)).toEqual([]);
    expect(JSON.stringify(r.body)).toContain(ctx.employee.firstName);
  });

  it("portal order list + detail", async () => {
    const list = await request(app).get("/v1/account/orders").set("Cookie", customerCookie);
    expect(list.status).toBe(200);
    expect(scan(list.body)).toEqual([]);
    const detail = await request(app).get(`/v1/account/orders/${ctx.order.id}`).set("Cookie", customerCookie);
    expect(detail.status).toBe(200);
    expect(scan(detail.body)).toEqual([]);
  });

  it("portal dashboard, quotes and invoices", async () => {
    for (const p of ["/v1/account/dashboard", "/v1/account/quotes", "/v1/account/invoices"]) {
      const r = await request(app).get(p).set("Cookie", customerCookie);
      expect(r.status, p).toBe(200);
      expect(scan(r.body), p).toEqual([]);
    }
  });

  it("public quotation link hides cost and margin", async () => {
    const r = await request(app).get(`/v1/q/${quotationToken}`);
    expect(r.status).toBe(200);
    expect(scan(r.body)).toEqual([]);
  });

  it("public invoice link", async () => {
    const r = await request(app).get(`/v1/pay/invoice/${invoiceToken}`);
    expect(r.status).toBe(200);
    expect(scan(r.body)).toEqual([]);
  });

  it("driver job view carries no pricing internals", async () => {
    const r = await request(app).get(`/v1/driver/jobs/${ctx.order.id}`).set("Cookie", driverCookie);
    expect(r.status).toBe(200);
    const found = scan(r.body).filter((f) => !f.includes("driver's last name") && !f.includes("staff email")); // drivers may see their own identity
    expect(found).toEqual([]);
  });

  it("public content and config endpoints", async () => {
    for (const p of ["/v1/public-config", "/v1/content/posts", "/v1/content/history", "/v1/content/testimonials", "/v1/assistant/config", "/v1/marketing/config"]) {
      const r = await request(app).get(p);
      expect(r.status, p).toBe(200);
      expect(scan(r.body), p).toEqual([]);
    }
  });
});

describe("cross-customer access (IDOR)", () => {
  it("another customer gets 404 for someone else's order, files and repeat draft", async () => {
    for (const p of [`/v1/account/orders/${ctx.order.id}`, `/v1/account/orders/${ctx.order.id}/repeat-draft`]) {
      const r = await request(app).get(p).set("Cookie", otherCookie);
      expect(r.status, p).toBe(404);
    }
    const list = await request(app).get("/v1/account/orders").set("Cookie", otherCookie);
    expect(JSON.stringify(list.body)).not.toContain(ctx.order.reference);
  });

  it("tracking with a wrong verifier looks exactly like an unknown reference (no enumeration)", async () => {
    const wrong = await request(app).post("/v1/track").set("Origin", ORIGIN).send({ reference: ctx.order.reference, verifier: "someone@else.com" });
    const unknown = await request(app).post("/v1/track").set("Origin", ORIGIN).send({ reference: "EB-000000-ZZZZ", verifier: "someone@else.com" });
    expect(wrong.status).toBe(unknown.status);
    expect(wrong.body).toEqual(unknown.body);
  });

  it("guessed quotation / invoice / survey tokens reveal nothing", async () => {
    for (const p of [`/v1/q/${publicToken()}`, `/v1/pay/invoice/${publicToken()}`, `/v1/survey/${publicToken()}`]) {
      const r = await request(app).get(p);
      expect(r.status, p).toBe(404);
    }
  });
});
