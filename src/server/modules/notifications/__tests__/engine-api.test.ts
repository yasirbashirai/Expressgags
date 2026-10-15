/**
 * Notification engine + engagement API integration tests (real Postgres, mock providers).
 * Covers: event → jobs per channel/flags, de-duplication, opt-out, quiet-hours scheduling,
 * driver first-name privacy, Spanish templates, customer vs internal exceptions, staff alerts,
 * survey routing + testimonial drafts, Twilio STOP webhook, attribution consent, unsubscribe, admin auth.
 * Settings touched are restored afterwards; all data uses a unique tag and is deleted.
 */
import "../../../lib/env";
import { createHmac, randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("notifications engine & engagement API", async () => {
  const { app } = await import("../../../app");
  const { prisma } = await import("../../../db");
  const { hashPassword } = await import("../../../auth");
  const { createOrder, transitionOrder } = await import("../../../services/orders");
  const { emit } = await import("../../../lib/events");
  const { scheduleSurvey } = await import("../engine");
  const { processDueJobs } = await import("../worker");
  const { unsubscribeUrl } = await import("../unsubscribe");

  const tag = randomBytes(3).toString("hex");
  const pw = "Engage-Test-Password-1!";
  const staffEmail = `eng-staff-${tag}@test.local`;
  const alertEmail = `eng-alerts-${tag}@test.local`;
  const phone = `+1305555${String(Math.floor(1000 + Math.random() * 8999))}`;
  const saved: Record<string, unknown> = {};
  const created = { customers: [] as string[], orders: [] as string[], employees: [] as string[], quotes: [] as string[] };

  async function setSetting(key: string, value: object) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  async function newCustomer(over: { language?: string; preferredContact?: string; phone?: string | null } = {}) {
    const c = await prisma.customer.create({
      data: { name: `Alex Tester${tag}`, email: `eng-${tag}-${created.customers.length}@example.org`, phone: over.phone === undefined ? phone : over.phone, language: over.language ?? "en", preferredContact: over.preferredContact ?? "text" },
    });
    created.customers.push(c.id);
    return c;
  }

  async function newOrder(customerId: string) {
    const o = await createOrder({
      customerId,
      serviceType: "luggage-local",
      pickup: { type: "hotel", address: "Hotel on Collins Ave, Miami Beach", market: "miami" },
      delivery: { type: "cruise-port", address: "PortMiami Terminal B", facility: "portmiami", market: "miami" },
      serviceDate: new Date("2026-11-20T15:00:00Z"),
      timeWindow: "morning",
      market: "miami",
      pieces: [{ category: "standard-checked" }, { category: "large" }],
    });
    created.orders.push(o.id);
    return o;
  }

  const jobs = (orderId: string) => prisma.notificationJob.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });

  beforeAll(async () => {
    for (const key of ["features", "notifications", "contact"]) saved[key] = (await prisma.setting.findUnique({ where: { key } }))?.value ?? null;
    const features = { ...((saved.features as object) ?? {}), smsEnabled: true, surveysEnabled: true };
    await setSetting("features", features);
    // Quiet hours off by default in this suite (enabled explicitly in the quiet-hours test)
    await setSetting("notifications", { quietHours: { enabled: false, start: "21:00", end: "07:00" }, surveyDelayMinutes: 120, googleReviewUrl: "https://g.page/r/demo-review", lowRatingThreshold: 3 });
    await setSetting("contact", { ...((saved.contact as object) ?? { emailLive: false }), notifyEmail: alertEmail });
    await prisma.user.create({ data: { email: staffEmail, role: "STAFF", passwordHash: await hashPassword(pw) } });
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === null) await prisma.setting.deleteMany({ where: { key } });
      else await setSetting(key, value as object);
    }
    await prisma.notificationJob.deleteMany({ where: { OR: [{ orderId: { in: created.orders } }, { to: { contains: tag } }, { to: phone }] } });
    await prisma.notification.deleteMany({ where: { OR: [{ orderId: { in: created.orders } }, { to: { contains: tag } }, { to: phone }] } });
    await prisma.testimonial.deleteMany({ where: { quote: { contains: tag } } });
    await prisma.contactOptOut.deleteMany({ where: { address: { in: [phone, `eng-${tag}-0@example.org`] } } });
    await prisma.order.deleteMany({ where: { id: { in: created.orders } } });
    await prisma.quoteRequest.deleteMany({ where: { id: { in: created.quotes } } });
    await prisma.employee.deleteMany({ where: { id: { in: created.employees } } });
    await prisma.customer.deleteMany({ where: { id: { in: created.customers } } });
    await prisma.user.deleteMany({ where: { email: staffEmail } });
  });

  it("sends a booking confirmation by email and SMS, exactly once", async () => {
    const c = await newCustomer();
    const o = await newOrder(c.id);
    let j = await jobs(o.id);
    expect(j.map((x) => `${x.template}:${x.channel}`).sort()).toEqual(["order.confirmed:email", "order.confirmed:sms"]);
    expect(j.every((x) => x.status === "LOGGED")).toBe(true);
    await emit("order.created", { orderId: o.id });
    j = await jobs(o.id);
    expect(j).toHaveLength(2); // de-duplicated
    const n = await prisma.notification.findMany({ where: { orderId: o.id } });
    expect(n).toHaveLength(2);
    const timeline = await prisma.orderEvent.findMany({ where: { orderId: o.id, type: "NOTIFICATION" } });
    expect(timeline.length).toBe(2);
    expect(timeline.every((e) => e.customerVisible === false)).toBe(true);
  });

  it("respects email-only preference and the SMS feature flag", async () => {
    const c = await newCustomer({ preferredContact: "email" });
    const o = await newOrder(c.id);
    expect((await jobs(o.id)).map((x) => x.channel)).toEqual(["email"]);
  });

  it("uses WhatsApp when preferred, and Spanish when chosen", async () => {
    const c = await newCustomer({ preferredContact: "whatsapp", language: "es" });
    const o = await newOrder(c.id);
    const j = await jobs(o.id);
    expect(j.map((x) => x.channel).sort()).toEqual(["email", "whatsapp"]);
    const mail = await prisma.notification.findFirst({ where: { orderId: o.id, channel: "email" } });
    expect(mail?.subject).toMatch(/^Reserva confirmada/);
  });

  it("skips SMS for opted-out numbers", async () => {
    await prisma.contactOptOut.upsert({ where: { channel_address: { channel: "sms", address: phone } }, create: { channel: "sms", address: phone, source: "admin" }, update: {} });
    const c = await newCustomer();
    const o = await newOrder(c.id);
    const sms = (await jobs(o.id)).find((x) => x.channel === "sms");
    expect(sms?.status).toBe("SKIPPED");
    expect(sms?.lastError).toMatch(/opted out/i);
    await prisma.contactOptOut.deleteMany({ where: { address: phone } });
  });

  it("holds SMS during Miami quiet hours but sends email now", async () => {
    // Quiet window covering the current Miami time
    const now = new Date();
    const mins = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(now)) * 60;
    const hh = (m: number) => `${String(Math.floor(((m + 1440) % 1440) / 60)).padStart(2, "0")}:00`;
    await setSetting("notifications", { quietHours: { enabled: true, start: hh(mins - 60), end: hh(mins + 120) }, surveyDelayMinutes: 120, googleReviewUrl: "https://g.page/r/demo-review", lowRatingThreshold: 3 });
    try {
      const c = await newCustomer();
      const o = await newOrder(c.id);
      const j = await jobs(o.id);
      const sms = j.find((x) => x.channel === "sms")!;
      expect(sms.status).toBe("PENDING");
      expect(sms.scheduledFor.getTime()).toBeGreaterThan(Date.now() + 30 * 60_000);
      expect(j.find((x) => x.channel === "email")?.status).toBe("LOGGED");
    } finally {
      await setSetting("notifications", { quietHours: { enabled: false, start: "21:00", end: "07:00" }, surveyDelayMinutes: 120, googleReviewUrl: "https://g.page/r/demo-review", lowRatingThreshold: 3 });
    }
  });

  it("shares only the assigned driver's first name with the booked customer", async () => {
    const c = await newCustomer({ phone: null });
    const o = await newOrder(c.id);
    const e = await prisma.employee.create({ data: { firstName: "Marco", lastName: `Privacy${tag}`, role: "DRIVER", phone: "305-555-0001" } });
    created.employees.push(e.id);
    await prisma.assignment.create({ data: { orderId: o.id, employeeId: e.id, role: "DRIVER" } });
    await emit("order.assigned", { orderId: o.id, employeeId: e.id, role: "DRIVER" });
    await emit("order.assigned", { orderId: o.id, employeeId: e.id, role: "HELPER" });
    const n = await prisma.notification.findMany({ where: { orderId: o.id, template: "order.driver_assigned" } });
    expect(n).toHaveLength(1);
    expect(n[0].body).toContain("Marco");
    expect(n[0].body).not.toContain(`Privacy${tag}`);
    expect(n[0].body).not.toContain("305-555-0001");
  });

  it("tells customers about delays but keeps internal exceptions internal; alerts staff on HIGH", async () => {
    const c = await newCustomer({ phone: null });
    const o = await newOrder(c.id);
    const internal = await prisma.orderException.create({ data: { orderId: o.id, type: "PAYMENT_FAILURE", severity: "HIGH", detail: `card declined ${tag}` } });
    await emit("order.exception", { orderId: o.id, exceptionId: internal.id, type: "PAYMENT_FAILURE", severity: "HIGH" });
    expect((await jobs(o.id)).filter((x) => x.template === "order.update")).toHaveLength(0);
    const staff = await prisma.notificationJob.findMany({ where: { to: alertEmail, template: "staff.exception_alert" } });
    expect(staff.length).toBeGreaterThanOrEqual(1);
    const delay = await prisma.orderException.create({ data: { orderId: o.id, type: "CARRIER_DELAY", severity: "LOW", detail: "flight late" } });
    await emit("order.exception", { orderId: o.id, exceptionId: delay.id, type: "CARRIER_DELAY", severity: "LOW" });
    const upd = await prisma.notification.findFirst({ where: { orderId: o.id, template: "order.update" } });
    expect(upd?.body).toContain("carrier reported a delay");
    expect(upd?.body).not.toContain("flight late");
  });

  it("notifies status changes, then schedules the survey after delivery", async () => {
    const c = await newCustomer({ phone: null });
    const o = await newOrder(c.id);
    await transitionOrder(o.id, "DELIVERED", { type: "system" }, { force: true });
    const j = await jobs(o.id);
    expect(j.some((x) => x.template === "order.delivered" && x.status === "LOGGED")).toBe(true);
    const survey = j.find((x) => x.template === "survey.request")!;
    expect(survey.status).toBe("PENDING");
    expect(survey.scheduledFor.getTime() - Date.now()).toBeGreaterThan(110 * 60_000);
    // The worker sends it once due
    await processDueJobs(100, new Date(Date.now() + 3 * 60 * 60_000));
    const sent = await prisma.notificationJob.findUnique({ where: { id: survey.id } });
    expect(sent?.status).toBe("LOGGED");
    expect((await prisma.surveyResponse.findUnique({ where: { orderId: o.id } }))?.sentAt).not.toBeNull();
  });

  it("routes survey answers: 5 stars → review link + consented testimonial draft; low → staff alert", async () => {
    const c = await newCustomer({ phone: null });
    const happy = await newOrder(c.id);
    const s1 = await scheduleSurvey(happy.id);
    const r1 = await request(app).post(`/v1/survey/${s1!.token}`).send({ rating: 5, comment: `Wonderful handoff ${tag}`, publishConsent: true, attribution: "Hotel operations manager, Miami Beach" });
    expect(r1.status).toBe(200);
    expect(r1.body.reviewUrl).toBe("https://g.page/r/demo-review");
    const t = await prisma.testimonial.findFirst({ where: { quote: { contains: tag } } });
    expect(t?.published).toBe(false);
    expect(t?.permissionGranted).toBe(true);
    expect((await request(app).post(`/v1/survey/${s1!.token}`).send({ rating: 4 })).status).toBe(409);
    expect((await request(app).get(`/v1/survey/${s1!.token}`)).body.survey.reviewUrl).toBe("https://g.page/r/demo-review");

    const sad = await newOrder(c.id);
    const s2 = await scheduleSurvey(sad.id);
    const r2 = await request(app).post(`/v1/survey/${s2!.token}`).send({ rating: 2, comment: "Late", publishConsent: false });
    expect(r2.body.reviewUrl).toBeNull();
    expect(await prisma.notificationJob.count({ where: { to: alertEmail, template: "staff.low_rating" } })).toBeGreaterThanOrEqual(1);
    expect(await prisma.testimonial.count({ where: { sourceSurveyId: s2!.id } })).toBe(0);

    expect((await request(app).get("/v1/survey/NOT-A-REAL-TOKEN")).status).toBe(404);
  });

  it("records SMS STOP from Twilio only with a valid signature", async () => {
    const prev = process.env.TWILIO_AUTH_TOKEN;
    process.env.TWILIO_AUTH_TOKEN = "twilio-test-token";
    try {
      const params = { From: phone, Body: "STOP", To: "+13055559999" };
      const bad = await request(app).post("/v1/webhooks/twilio").type("form").set("X-Twilio-Signature", "nope").send(params);
      expect(bad.status).toBe(403);
      // Signature is computed over the URL supertest uses (http://127.0.0.1:<port>/v1/webhooks/twilio)
      const agent = request(app);
      const server = (agent as unknown as { app: import("node:http").Server }).app;
      void server;
      process.env.PUBLIC_API_URL = "https://api.example.test";
      const url = "https://api.example.test/v1/webhooks/twilio";
      const sig = createHmac("sha1", "twilio-test-token").update(url + Object.keys(params).sort().map((k) => k + params[k as keyof typeof params]).join("")).digest("base64");
      const ok = await request(app).post("/v1/webhooks/twilio").type("form").set("X-Twilio-Signature", sig).send(params);
      expect(ok.status).toBe(200);
      expect(await prisma.contactOptOut.count({ where: { channel: "sms", address: phone } })).toBe(1);
    } finally {
      process.env.TWILIO_AUTH_TOKEN = prev;
      delete process.env.PUBLIC_API_URL;
      await prisma.contactOptOut.deleteMany({ where: { address: phone } });
    }
  });

  it("keeps ad click IDs only with marketing consent", async () => {
    const c = await newCustomer({ phone: null });
    const mk = async (reference: string) => {
      const q = await prisma.quoteRequest.create({
        data: { reference, serviceType: "airport", route: "STANDARD_QUOTE", pickupMarket: "miami", deliveryMarket: "miami", serviceDate: "2026-11-20", totalPieces: 2, leadSource: "google-search", billingType: "individual", payload: {}, customerId: c.id },
      });
      created.quotes.push(q.id);
      return q;
    };
    const suffix = randomBytes(2).toString("hex").toUpperCase().replace(/[01IO]/g, "Z");
    const q1 = await mk(`EB-Q-261015-${suffix.slice(0, 4).padEnd(4, "Z")}`);
    const touch = { source: "google", medium: "cpc", campaign: "cruise", gclid: "abc123" };
    await request(app).post("/v1/attribution").send({ reference: q1.reference, attribution: { first: touch, last: touch }, consent: { analytics: true, marketing: false } }).expect(200);
    const p1 = (await prisma.quoteRequest.findUnique({ where: { id: q1.id } }))!.payload as { attribution: { first: Record<string, string> } };
    expect(p1.attribution.first.source).toBe("google");
    expect(p1.attribution.first.gclid).toBeUndefined();
    // Second post for the same quote is ignored; unknown references still answer ok
    await request(app).post("/v1/attribution").send({ reference: q1.reference, attribution: { first: { source: "spam" } }, consent: { analytics: true, marketing: true } }).expect(200);
    expect(((await prisma.quoteRequest.findUnique({ where: { id: q1.id } }))!.payload as { attribution: { first: { source: string } } }).attribution.first.source).toBe("google");
    await request(app).post("/v1/attribution").send({ reference: "EB-Q-261015-ZZZZ", attribution: {}, consent: { analytics: false, marketing: false } }).expect(200);
  });

  it("one-click unsubscribe stops survey emails only", async () => {
    const c = await newCustomer({ phone: null });
    const link = new URL(unsubscribeUrl(c.email));
    const res = await request(app).get(`${link.pathname}${link.search}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("You are unsubscribed");
    expect((await request(app).get(`${link.pathname}?e=${encodeURIComponent(c.email)}&t=forged`)).status).toBe(400);
    const o = await newOrder(c.id);
    expect((await jobs(o.id)).find((x) => x.template === "order.confirmed")?.status).toBe("LOGGED"); // transactional still sent
    await scheduleSurvey(o.id);
    await processDueJobs(100, new Date(Date.now() + 3 * 60 * 60_000));
    expect((await jobs(o.id)).find((x) => x.template === "survey.request")?.status).toBe("SKIPPED");
  });

  it("admin endpoints require staff and render template previews", async () => {
    expect((await request(app).get("/v1/admin/notifications")).status).toBe(401);
    const agent = request.agent(app);
    await agent.post("/v1/admin/auth/login").send({ email: staffEmail, password: pw }).expect(200);
    const list = await agent.get("/v1/admin/notifications?channel=email");
    expect(list.status).toBe(200);
    const prev = await agent.get("/v1/admin/notifications/templates/order.en_route/preview?lang=es");
    expect(prev.body.subject).toMatch(/^Conductor en camino/);
    expect(prev.body.html).toContain("<table");
    expect((await agent.put("/v1/admin/notifications/settings/marketing").send({ marketing: { ga4Id: "G-TEST123" } })).status).toBe(403); // owner only
    const cfg = await request(app).get("/v1/marketing/config");
    expect(cfg.body).not.toHaveProperty("metaCapiToken");
  });
});
