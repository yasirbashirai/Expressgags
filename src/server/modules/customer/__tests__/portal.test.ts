/**
 * Customer portal API tests (supertest + real dev Postgres). Skipped when no database is configured.
 * Covers: registration/verification (incl. pre-claim protection), login, reset, scoping/IDOR,
 * company roles, invites, concierge requests, admin customer management.
 */
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

const hasDb = !!process.env.DATABASE_URL || (() => { try { process.loadEnvFile(".env"); return !!process.env.DATABASE_URL; } catch { return false; } })();

describe.skipIf(!hasDb)("customer portal API", async () => {
  process.env.LOGIN_RATE_LIMIT = "10000";
  process.env.PUBLIC_RATE_LIMIT = "10000";
  const { app } = await import("../../../app");
  const { prisma } = await import("../../../db");
  const { hashPassword } = await import("../../../auth");
  const { issueToken } = await import("../tokens");
  const { createOrder } = await import("../../../services/orders");

  const tag = randomBytes(4).toString("hex");
  const mail = (who: string) => `${who}-${tag}@portal-test.local`;
  const PW = "Portal-Test-2026!";
  const companyIds: string[] = [];
  const staffEmails = [mail("staff"), mail("dispatch")];

  const order = (customerId: string, companyId?: string) =>
    createOrder({
      customerId,
      companyId,
      serviceType: "airport",
      pickup: { type: "hotel", address: "Hotel on Collins Ave, Miami Beach", market: "miami" },
      delivery: { type: "airport", address: "MIA", facility: "MIA", market: "miami" },
      serviceDate: new Date("2026-12-01T10:00:00Z"),
      market: "miami",
      pieces: [{ category: "standard-checked" }, { category: "standard-checked" }, { category: "carry-on" }],
      costCents: 4000,
      retailCents: 9900,
    });

  /** Creates an activated customer (as if verified) and returns a logged-in agent. */
  async function activeCustomer(who: string, extra: { companyId?: string; accountRole?: string } = {}) {
    const c = await prisma.customer.create({ data: { name: `Test ${who}`, email: mail(who), phone: "305-555-0199", passwordHash: await hashPassword(PW), emailVerifiedAt: new Date(), ...extra } });
    await prisma.customerAccess.create({ data: { customerId: c.id, status: "ACTIVE" } });
    const agent = request.agent(app);
    const res = await agent.post("/v1/account/auth/login").send({ email: c.email, password: PW });
    expect(res.status).toBe(200);
    return { c, agent };
  }

  beforeAll(async () => {
    const passwordHash = await hashPassword(PW);
    await prisma.user.createMany({ data: [{ email: staffEmails[0], role: "STAFF", passwordHash }, { email: staffEmails[1], role: "DISPATCHER", passwordHash }] });
  });

  afterAll(async () => {
    const customers = await prisma.customer.findMany({ where: { email: { endsWith: `-${tag}@portal-test.local` } }, select: { id: true } });
    const ids = customers.map((c) => c.id);
    await prisma.order.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.quoteRequest.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.authToken.deleteMany({ where: { subjectId: { in: ids } } });
    await prisma.customerAccess.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ user: { email: { in: staffEmails } } }, ...ids.map((id) => ({ detail: { path: ["customerId"], equals: id } }))] } });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { email: { in: staffEmails } } });
  });

  it("register → pending (cannot log in) → verify requires the same password → active session", async () => {
    const email = mail("newbie");
    const reg = await request(app).post("/v1/account/auth/register").send({ name: "New Traveler", email, phone: "305-555-0101", password: PW });
    expect(reg.status).toBe(201);
    const c = await prisma.customer.findUniqueOrThrow({ where: { email } });
    expect(c.passwordHash).toBeNull();

    const early = await request(app).post("/v1/account/auth/login").send({ email, password: PW });
    expect(early.status).toBe(403);
    expect(early.body.details?.code).toBe("EMAIL_NOT_VERIFIED");

    const token = await issueToken("email-verify", c.id);
    expect((await request(app).get(`/v1/account/auth/verify/${token}`)).status).toBe(200);
    const wrong = await request(app).post("/v1/account/auth/verify").send({ token, password: "Something-Else-1" });
    expect(wrong.status).toBe(400);
    const agent = request.agent(app);
    const ok = await agent.post("/v1/account/auth/verify").send({ token, password: PW });
    expect(ok.status).toBe(200);
    const me = await agent.get("/v1/account/me");
    expect(me.status).toBe(200);
    expect(me.body.customer.email).toBe(email);
    // token is single-use
    expect((await request(app).post("/v1/account/auth/verify").send({ token, password: PW })).status).toBe(400);
  });

  it("weak passwords are rejected", async () => {
    const res = await request(app).post("/v1/account/auth/register").send({ name: "Weak", email: mail("weak"), phone: "305-555-0102", password: "short" });
    expect(res.status).toBe(400);
  });

  it("protects history of customers created by quote requests until they verify (no pre-claim)", async () => {
    const victim = await prisma.customer.create({ data: { name: "Existing Client", email: mail("existing"), phone: "305-555-0103" } });
    await order(victim.id);
    // An attacker registers the victim's email with their own password
    const reg = await request(app).post("/v1/account/auth/register").send({ name: "Attacker", email: victim.email, phone: "305-555-0000", password: "Attacker-Pass-99" });
    expect(reg.status).toBe(201);
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.passwordHash).toBeNull(); // nothing activated
    expect(after.name).toBe("Existing Client"); // not overwritten
    const login = await request(app).post("/v1/account/auth/login").send({ email: victim.email, password: "Attacker-Pass-99" });
    expect(login.status).not.toBe(200);
  });

  it("registering an already-active email answers the same generic message", async () => {
    const { c } = await activeCustomer("dup");
    const res = await request(app).post("/v1/account/auth/register").send({ name: "Dup", email: c.email, phone: "305-555-0104", password: PW });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/If that email can be used/);
  });

  it("generic error for wrong password and unknown email", async () => {
    const { c } = await activeCustomer("login");
    const a = await request(app).post("/v1/account/auth/login").send({ email: c.email, password: "Wrong-Password-1" });
    const b = await request(app).post("/v1/account/auth/login").send({ email: mail("nobody"), password: "Wrong-Password-1" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error).toBe(b.body.error);
  });

  it("forgot/reset password is single-use and replaces the old password", async () => {
    const { c } = await activeCustomer("reset");
    expect((await request(app).post("/v1/account/auth/forgot").send({ email: c.email })).status).toBe(200);
    const token = await issueToken("password-reset", c.id);
    const NEW = "Brand-New-Pass-77";
    expect((await request(app).post("/v1/account/auth/reset").send({ token, password: NEW })).status).toBe(200);
    expect((await request(app).post("/v1/account/auth/reset").send({ token, password: NEW })).status).toBe(400);
    expect((await request(app).post("/v1/account/auth/login").send({ email: c.email, password: PW })).status).toBe(401);
    expect((await request(app).post("/v1/account/auth/login").send({ email: c.email, password: NEW })).status).toBe(200);
  });

  it("scopes orders to the owner and answers 404 to everyone else (no IDOR)", async () => {
    const a = await activeCustomer("owner-a");
    const b = await activeCustomer("owner-b");
    const o = await order(a.c.id);
    await prisma.orderEvent.create({ data: { orderId: o.id, type: "NOTE", detail: "internal only", customerVisible: false } });

    const mine = await a.agent.get(`/v1/account/orders/${o.id}`);
    expect(mine.status).toBe(200);
    expect(mine.body.order.reference).toBe(o.reference);
    expect(mine.body.order.costCents).toBeUndefined(); // internal economics never leave admin
    expect(mine.body.timeline.every((e: { detail: string }) => e.detail !== "internal only")).toBe(true);
    expect(mine.body.driver).toBeNull(); // no assignment yet

    expect((await b.agent.get(`/v1/account/orders/${o.id}`)).status).toBe(404);
    expect((await b.agent.get(`/v1/account/orders/${o.id}/repeat-draft`)).status).toBe(404);
    expect((await b.agent.get(`/v1/account/orders/${o.id}/files/whatever`)).status).toBe(404);
    expect((await b.agent.get("/v1/account/orders")).body.orders.find((x: { id: string }) => x.id === o.id)).toBeUndefined();
    expect((await request(app).get(`/v1/account/orders/${o.id}`)).status).toBe(401);

    const draft = await a.agent.get(`/v1/account/orders/${o.id}/repeat-draft`);
    expect(draft.status).toBe(200);
    expect(draft.body.draft.items).toEqual(expect.arrayContaining([expect.objectContaining({ category: "standard-checked", quantity: "2" })]));
    expect(draft.body.draft.leadSource).toBe("repeat-client");
  });

  it("documents and saved addresses are private to their owner", async () => {
    const a = await activeCustomer("docs-a");
    const b = await activeCustomer("docs-b");
    const up = await a.agent.post("/v1/account/documents").field("title", "Group manifest").attach("file", Buffer.from("%PDF-1.4 test"), { filename: "manifest.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);
    const id = up.body.document.id;
    expect((await a.agent.get(`/v1/account/documents/${id}/file`)).status).toBe(200);
    expect((await b.agent.get(`/v1/account/documents/${id}/file`)).status).toBe(404);

    const addr = await a.agent.post("/v1/account/addresses").send({ label: "Home", type: "residence", address: "123 Example St, Miami", market: "miami" });
    expect(addr.status).toBe(201);
    expect((await b.agent.patch(`/v1/account/addresses/${addr.body.address.id}`).send({ label: "Hacked" })).status).toBe(404);
    expect((await b.agent.delete(`/v1/account/addresses/${addr.body.address.id}`)).status).toBe(404);
    // individuals cannot create shared company locations
    expect((await a.agent.post("/v1/account/addresses").send({ label: "Lobby", type: "hotel", address: "x st", market: "miami", shared: true })).status).toBe(403);
  });

  it("company roles: admin sees company orders + manages users; company user sees own only", async () => {
    const company = await prisma.company.create({ data: { name: `Demo Corp ${tag}`, accountType: "corporate", accountStatus: "ACTIVE", poRequired: true } });
    companyIds.push(company.id);
    const admin = await activeCustomer("corp-admin", { companyId: company.id, accountRole: "COMPANY_ADMIN" });
    const user = await activeCustomer("corp-user", { companyId: company.id, accountRole: "COMPANY_USER" });
    const o1 = await order(user.c.id, company.id);
    const o2 = await order(admin.c.id, company.id);

    expect((await admin.agent.get(`/v1/account/orders/${o1.id}`)).status).toBe(200);
    expect((await user.agent.get(`/v1/account/orders/${o2.id}`)).status).toBe(404);
    expect((await user.agent.get("/v1/account/company/users")).status).toBe(403);

    const users = await admin.agent.get("/v1/account/company/users");
    expect(users.status).toBe(200);
    expect(users.body.users.length).toBe(2);

    const invite = await admin.agent.post("/v1/account/company/users").send({ name: "Invited Colleague", email: mail("invitee"), role: "COMPANY_USER" });
    expect(invite.status).toBe(201);
    const invitee = await prisma.customer.findUniqueOrThrow({ where: { email: mail("invitee") } });
    expect(invitee.companyId).toBe(company.id);
    const token = await issueToken("invite", invitee.id);
    const accept = request.agent(app);
    expect((await accept.post("/v1/account/auth/invite").send({ token, name: "Invited Colleague", password: PW })).status).toBe(200);
    expect((await accept.get("/v1/account/me")).body.customer.company.id).toBe(company.id);

    // deactivate → session rejected
    expect((await admin.agent.patch(`/v1/account/company/users/${invitee.id}`).send({ active: false })).status).toBe(200);
    expect((await accept.get("/v1/account/me")).status).toBe(401);
    // admin cannot deactivate themselves
    expect((await admin.agent.patch(`/v1/account/company/users/${admin.c.id}`).send({ active: false })).status).toBe(400);

    // PO number required on signed-in quote requests
    const req = {
      serviceType: "courier",
      pickup: { type: "business", address: "Office, Doral", market: "miami" },
      delivery: { type: "business", address: "Client office, Brickell", market: "miami" },
      serviceDate: "2026-12-02",
      timeWindow: "morning",
      items: [{ category: "cargo", description: "Document box", quantity: 1 }],
      contact: { name: "Corp User", email: user.c.email, phone: "305-555-0110" },
      leadSource: "repeat-client",
      acceptsProhibitedItemsPolicy: true,
      consentToContact: true,
    };
    expect((await user.agent.post("/v1/account/quotes").send({ request: req })).status).toBe(400);
    const withPo = await user.agent.post("/v1/account/quotes").send({ request: req, poNumber: "PO-1234", costCenter: "OPS" });
    expect(withPo.status).toBe(201);
    const stored = await prisma.quoteRequest.findUniqueOrThrow({ where: { reference: withPo.body.reference } });
    expect(stored.companyId).toBe(company.id);
    expect((stored.payload as { poNumber?: string }).poNumber).toBe("PO-1234");
  });

  it("concierge desk creates a guest request linked to the hotel and lists today's requests", async () => {
    const hotel = await prisma.company.create({ data: { name: `Demo Hotel ${tag}`, accountType: "hotel", accountStatus: "ACTIVE" } });
    companyIds.push(hotel.id);
    const desk = await activeCustomer("concierge", { companyId: hotel.id, accountRole: "CONCIERGE" });
    const loc = await desk.agent.post("/v1/account/addresses").send({ label: "Main lobby", type: "hotel", address: "Demo Hotel, Collins Ave, Miami Beach", market: "miami", shared: true });
    expect(loc.status).toBe(201);
    const today = new Date().toISOString().slice(0, 10);
    const res = await desk.agent.post("/v1/account/concierge/requests").send({
      guestName: "Guest Example",
      guestRoom: "1204",
      pickupDate: today,
      pickupTime: "09:30",
      timeWindow: "morning",
      hotelAddressId: loc.body.address.id,
      destinationType: "airport",
      destinationFacility: "MIA",
      flightOrShip: "AA 100",
      pieces: [{ category: "large", quantity: 2 }],
      acceptsProhibitedItemsPolicy: true,
    });
    expect(res.status).toBe(201);
    const q = await prisma.quoteRequest.findUniqueOrThrow({ where: { reference: res.body.reference } });
    expect(q.companyId).toBe(hotel.id);
    expect(q.leadSource).toBe("hotel-concierge");
    expect(q.serviceType).toBe("airport");
    const list = await desk.agent.get(`/v1/account/concierge/requests?date=${today}`);
    expect(list.body.requests[0].guest.guestName).toBe("Guest Example");
    const slip = await desk.agent.get(`/v1/account/concierge/requests/${q.id}`);
    expect(slip.status).toBe(200);

    // an individual customer cannot use the concierge desk
    const solo = await activeCustomer("solo");
    expect((await solo.agent.get("/v1/account/concierge/requests")).status).toBe(403);
  });

  it("admin: staff manage customers & approve business accounts; dispatcher is refused", async () => {
    const staff = request.agent(app);
    expect((await staff.post("/v1/admin/auth/login").send({ email: staffEmails[0], password: PW })).status).toBe(200);
    const disp = request.agent(app);
    expect((await disp.post("/v1/admin/auth/login").send({ email: staffEmails[1], password: PW })).status).toBe(200);

    const applicant = await activeCustomer("applicant");
    const app1 = await applicant.agent.post("/v1/account/business-application").send({ companyName: `Applicant DMC ${tag}`, accountType: "dmc", billingEmail: mail("billing") });
    expect(app1.status).toBe(201);
    const company = await prisma.company.findFirstOrThrow({ where: { name: `Applicant DMC ${tag}` } });
    companyIds.push(company.id);
    expect(company.accountStatus).toBe("PENDING");

    expect((await disp.get("/v1/admin/customers")).status).toBe(403);
    const list = await staff.get(`/v1/admin/customers?search=${encodeURIComponent(applicant.c.email)}`);
    expect(list.status).toBe(200);
    expect(list.body.customers[0].id).toBe(applicant.c.id);
    expect((await staff.get("/v1/admin/customers/companies?status=PENDING")).body.companies.some((c: { id: string }) => c.id === company.id)).toBe(true);

    expect((await staff.post(`/v1/admin/customers/companies/${company.id}/approve`).send({ paymentTermsDays: 30 })).status).toBe(200);
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: applicant.c.id } });
    expect(after.accountRole).toBe("COMPANY_ADMIN");
    const bad = await staff.patch(`/v1/admin/customers/companies/${company.id}`).send({ negotiatedRules: "not-an-object" });
    expect(bad.status).toBe(400);
    const good = await staff.patch(`/v1/admin/customers/companies/${company.id}`).send({ negotiatedRules: { local: { minimumChargeCents: 7500 } }, poRequired: true });
    expect(good.status).toBe(200);
    expect(good.body.company.poRequired).toBe(true);
  });
});
