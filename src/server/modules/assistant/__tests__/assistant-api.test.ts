/**
 * Assistant API integration tests (supertest + real dev Postgres). The AI provider is replaced by a fake
 * (no network calls): it scripts tool calls so we can verify routing, validation and privacy end to end.
 */
import request from "supertest";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiAgentRequest, AiProvider } from "../../../providers";

const hasDb = !!process.env.DATABASE_URL || (() => { try { process.loadEnvFile(".env"); return !!process.env.DATABASE_URL; } catch { return false; } })();

/** Swappable provider used by the mocked registry. null → registry default (scripted mock). */
const state = vi.hoisted(() => ({ provider: null as AiProvider | null }));
vi.mock("../../../providers/registry", async (orig) => {
  const actual = await orig<typeof import("../../../providers/registry")>();
  return { ...actual, ai: () => state.provider ?? actual.ai() };
});

const sid = () => `test${randomBytes(12).toString("hex")}`;
const tag = randomBytes(3).toString("hex");

/** A fake Claude that runs a fixed list of tool calls, then answers with fixed text. */
function fakeAgent(calls: { name: string; input: unknown }[], answer: string | ((results: string[]) => string)): AiProvider & { seen: AiAgentRequest[] } {
  const seen: AiAgentRequest[] = [];
  return {
    name: "anthropic",
    model: "claude-opus-5-5",
    seen,
    async chat() {
      return { text: "" };
    },
    async runAgent(req) {
      seen.push(req);
      const results: string[] = [];
      for (const c of calls) {
        try {
          results.push(await req.executeTool(c.name, c.input));
        } catch (e) {
          results.push(`ERROR:${(e as Error).message}`);
        }
      }
      return { text: typeof answer === "function" ? answer(results) : answer, toolsUsed: calls.map((c) => c.name), stopReason: "end_turn", model: "claude-opus-5-5" };
    },
  };
}

describe.skipIf(!hasDb)("assistant API", async () => {
  const { app } = await import("../../../app");
  const { prisma } = await import("../../../db");
  const { hashPassword } = await import("../../../auth");
  const pw = "Test-Password-123!x";
  const emails = { owner: `as-owner-${tag}@test.local`, staff: `as-staff-${tag}@test.local`, disp: `as-disp-${tag}@test.local` };
  const sessions: string[] = [];
  const newSid = () => {
    const s = sid();
    sessions.push(s);
    return s;
  };

  beforeAll(async () => {
    const passwordHash = await hashPassword(pw);
    await prisma.user.createMany({ data: [{ email: emails.owner, role: "OWNER", passwordHash }, { email: emails.staff, role: "STAFF", passwordHash }, { email: emails.disp, role: "DISPATCHER", passwordHash }] });
  });
  beforeEach(() => {
    state.provider = null;
  });
  afterAll(async () => {
    const convs = await prisma.aiConversation.findMany({ where: { sessionId: { in: sessions } }, select: { id: true } });
    await prisma.aiQuoteDraft.deleteMany({ where: { OR: [{ conversationId: { in: convs.map((c) => c.id) } }, { data: { path: ["notes"], string_contains: tag } }] } });
    await prisma.aiConversation.deleteMany({ where: { sessionId: { in: sessions } } });
    await prisma.contactMessage.deleteMany({ where: { name: { contains: tag } } });
    await prisma.auditLog.deleteMany({ where: { user: { email: { in: Object.values(emails) } } } });
    await prisma.aiReport.deleteMany({ where: { content: { contains: "Period:" }, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  });

  const login = async (email: string) => {
    const agent = request.agent(app);
    const res = await agent.post("/v1/admin/auth/login").send({ email, password: pw });
    expect(res.status).toBe(200);
    return agent;
  };

  it("config reports scripted mode without a key", async () => {
    const r = await request(app).get("/v1/assistant/config");
    expect(r.body).toMatchObject({ ok: true, enabled: true, mode: "scripted" });
  });

  it("scripted chat answers, stores the conversation and never states a price", async () => {
    const s = newSid();
    const r = await request(app).post("/v1/assistant/chat").send({ sessionId: s, message: "How much does it cost to take 3 bags from my hotel to PortMiami?" });
    expect(r.status).toBe(200);
    expect(r.body.reply).not.toMatch(/\$\s?\d/);
    expect(r.body.reply).toMatch(/quote/i);
    const conv = await prisma.aiConversation.findUnique({ where: { sessionId: s } });
    expect((conv?.messages as unknown[]).length).toBe(2);
    expect(conv?.ipHash).toMatch(/^[a-f0-9]{32}$/);
  });

  it("streams the reply as server-sent events", async () => {
    const r = await request(app).post("/v1/assistant/chat").set("Accept", "text/event-stream").send({ sessionId: newSid(), message: "Do you cover Key West?" }).buffer(true).parse((res, cb) => {
      let data = "";
      res.on("data", (c: Buffer) => (data += c.toString()));
      res.on("end", () => cb(null, data));
    });
    expect(r.headers["content-type"]).toMatch(/text\/event-stream/);
    const body = r.body as string;
    const deltas = [...body.matchAll(/event: delta\ndata: (.+)/g)].map((m) => JSON.parse(m[1]).text).join("");
    const done = JSON.parse(body.match(/event: done\ndata: (.+)/)![1]);
    expect(deltas).toBe(done.reply);
    expect(done.reply.length).toBeGreaterThan(20);
  });

  it("declines moving and food requests without calling the model", async () => {
    const fake = fakeAgent([], "should not be used");
    state.provider = fake;
    const r = await request(app).post("/v1/assistant/chat").send({ sessionId: newSid(), message: "Can you move my apartment furniture next week?" });
    expect(r.body.mode).toBe("guardrail");
    expect(r.body.reply).toMatch(/does not offer household or local moving/);
    expect(fake.seen).toHaveLength(0);
    const es = await request(app).post("/v1/assistant/chat").send({ sessionId: newSid(), message: "¿Pueden entregar comida para una fiesta?" });
    expect(es.body.lang).toBe("es");
    expect(es.body.reply).toMatch(/no entrega comida/);
  });

  it("answers in Spanish when the visitor writes in Spanish", async () => {
    const r = await request(app).post("/v1/assistant/chat").send({ sessionId: newSid(), message: "Hola, ¿cuánto cuesta llevar maletas al aeropuerto?" });
    expect(r.body.lang).toBe("es");
    expect(r.body.reply).toMatch(/cotiz/i);
    expect(r.body.reply).not.toMatch(/\$\s?\d/);
  });

  it("filters a price out of an AI reply before it is shown", async () => {
    state.provider = fakeAgent([], "For 2 bags it's $90. Our team confirms timing.");
    const r = await request(app).post("/v1/assistant/chat").send({ sessionId: newSid(), message: "price for 2 bags?" });
    expect(r.body.mode).toBe("ai");
    expect(r.body.reply).not.toMatch(/\$90|90/);
    expect(r.body.reply).toMatch(/quote-based/);
  });

  it("routes start_quote to a draft the wizard can open", async () => {
    const fake = fakeAgent(
      [{ name: "start_quote", input: { serviceType: "cruise", pickup: { type: "hotel", address: "Brickell hotel", market: "miami" }, delivery: { type: "cruise-port", facility: "portmiami", market: "miami" }, serviceDate: "2026-12-05", items: [{ category: "large", quantity: 4 }], notes: `test ${tag}` } }],
      (res) => `Here is your prefilled quote: ${JSON.parse(res[0]).link}`,
    );
    state.provider = fake;
    const r = await request(app).post("/v1/assistant/chat").send({ sessionId: newSid(), message: "Quote for 4 bags from Brickell to PortMiami on Dec 5" });
    expect(fake.seen[0].tools.map((t) => t.name)).toEqual(["search_knowledge", "get_tracking_status", "start_quote", "create_lead"]);
    const link = r.body.links.find((l: string) => l.includes("draft="));
    expect(link).toMatch(/^\/request-a-quote\?draft=[A-Za-z0-9]{24}$/);
    const token = link.split("=")[1];
    const d = await request(app).get(`/v1/assistant/draft/${token}`);
    expect(d.body.draft).toMatchObject({ serviceType: "cruise", serviceDate: "2026-12-05", delivery: { address: "PortMiami", facility: "portmiami" } });
    expect((await request(app).get("/v1/assistant/draft/notarealtoken123456789")).status).toBe(404);
  });

  it("validates tool input and requires a verifier for tracking", async () => {
    const fake = fakeAgent([{ name: "get_tracking_status", input: { reference: "EB-261015-ABCD" } }, { name: "start_quote", input: { serviceType: "teleport" } }], (res) => res.join(" | "));
    state.provider = fake;
    const r = await request(app).post("/v1/assistant/chat").send({ sessionId: newSid(), message: "track EB-261015-ABCD" });
    expect(r.body.reply).toMatch(/ERROR:/); // zod rejected both inputs; nothing ran
  });

  it("tracking via the assistant only works with a matching verifier and never exposes staff", async () => {
    const { createOrder } = await import("../../../services/orders");
    const cust = await prisma.customer.create({ data: { name: `Track ${tag}`, email: `track-${tag}@example.org`, phone: "305-555-0177" } });
    const order = await createOrder({ customerId: cust.id, serviceType: "airport", pickup: { type: "airport", address: "MIA" }, delivery: { type: "hotel", address: "Hotel, Miami Beach FL 33139" }, serviceDate: new Date("2026-12-01"), market: "miami", pieces: [{ category: "large" }, { category: "large" }] });
    try {
      state.provider = fakeAgent(
        [{ name: "get_tracking_status", input: { reference: order.reference, verifier: "0177" } }, { name: "get_tracking_status", input: { reference: order.reference, verifier: "9999" } }],
        (res) => res.join(" || "),
      );
      const r = await request(app).post("/v1/assistant/chat").send({ sessionId: newSid(), message: `status of ${order.reference}?` });
      const [ok, bad] = r.body.reply.split(" || ");
      expect(ok).toContain(order.reference);
      expect(ok).toContain("Order confirmed");
      expect(ok).not.toMatch(/firstName|driver|employee/i);
      expect(bad).toContain("No delivery matched");
    } finally {
      await prisma.order.delete({ where: { id: order.id } });
      await prisma.customer.delete({ where: { id: cust.id } });
    }
  });

  it("handoff creates a lead for the office (and needs a way to contact)", async () => {
    const s = newSid();
    await request(app).post("/v1/assistant/chat").send({ sessionId: s, message: "hello" });
    const bad = await request(app).post("/v1/assistant/handoff").send({ sessionId: s, name: `Lead ${tag}`, message: "Call me" });
    expect(bad.status).toBe(400);
    const ok = await request(app).post("/v1/assistant/handoff").send({ sessionId: s, name: `Lead ${tag}`, phone: "305 555 0199", message: "Need a group quote" });
    expect(ok.status).toBe(201);
    const msg = await prisma.contactMessage.findFirst({ where: { name: `Lead ${tag}` } });
    expect(msg?.topic).toMatch(/^assistant-handoff/);
    expect(msg?.message).toMatch(/Recent chat/);
    expect((await prisma.aiConversation.findUnique({ where: { sessionId: s } }))?.handoffRequested).toBe(true);
  });

  it("site search returns ranked public results", async () => {
    const r = await request(app).get("/v1/assistant/search").query({ q: "Port Canaveral cruise luggage" });
    expect(r.body.results[0].url).toMatch(/canaveral/);
  });

  it("stores an AI lead summary on new quote requests (fake provider, JSON output)", async () => {
    const summary = { segment: "hotel-resort", size: "small-group", urgency: "planned", valueBand: "strategic", recurringPotential: true, summary: "Hotel group transfer.", nextAction: "Call the hotel.", missingInfo: ["flight numbers"] };
    let sentToModel = "";
    state.provider = { name: "anthropic", model: "claude-opus-5-5", async chat(_s, m) { sentToModel = m[0].content; return { text: JSON.stringify(summary) }; } };
    const email = `lead-${tag}@example.org`;
    const q = await request(app).post("/v1/quotes").send({
      serviceType: "luggage-local", pickup: { type: "hotel", address: "Hotel in Miami Beach", market: "miami" }, delivery: { type: "airport", address: "MIA", facility: "MIA", market: "miami" },
      serviceDate: "2026-11-20", timeWindow: "morning", items: [{ category: "standard-checked", quantity: 6 }], contact: { name: "Lead Test", email, phone: "305-555-0111", company: "Demo Hotel" },
      leadSource: "referral", acceptsProhibitedItemsPolicy: true, consentToContact: true,
    });
    expect(q.status).toBe(201);
    const quote = await prisma.quoteRequest.findUnique({ where: { reference: q.body.reference } });
    let stored = quote?.aiSummary;
    for (let i = 0; i < 20 && !stored; i++) {
      await new Promise((r) => setTimeout(r, 100));
      stored = (await prisma.quoteRequest.findUnique({ where: { id: quote!.id } }))?.aiSummary;
    }
    expect(stored).toMatchObject({ segment: "hotel-resort", valueBand: "strategic" });
    expect(sentToModel).not.toContain(email); // contact details are redacted before the model sees them
    expect(sentToModel).not.toContain("305-555-0111");
    await prisma.quoteEvent.deleteMany({ where: { quoteId: quote!.id } });
    await prisma.quoteRequest.delete({ where: { id: quote!.id } });
    await prisma.customer.deleteMany({ where: { email } });
  });

  it("admin: roles, conversations, settings and weekly report", async () => {
    const disp = await login(emails.disp);
    expect((await disp.get("/v1/admin/assistant/stats")).status).toBe(403);
    const staff = await login(emails.staff);
    const stats = await staff.get("/v1/admin/assistant/stats");
    expect(stats.status).toBe(200);
    expect(stats.body.allowedModels).toContain("claude-opus-5-5");
    expect((await staff.put("/v1/admin/assistant/settings").send({ spanishEnabled: false })).status).toBe(403);
    const list = await staff.get("/v1/admin/assistant/conversations");
    expect(list.body.total).toBeGreaterThan(0);
    const detail = await staff.get(`/v1/admin/assistant/conversations/${list.body.conversations[0].id}`);
    expect(Array.isArray(detail.body.conversation.messages)).toBe(true);

    const owner = await login(emails.owner);
    const bad = await owner.put("/v1/admin/assistant/settings").send({ model: "gpt-something" });
    expect(bad.status).toBe(400);
    const saved = await owner.put("/v1/admin/assistant/settings").send({ model: "claude-sonnet-5-5", leadSummaries: true });
    expect(saved.body.settings.model).toBe("claude-sonnet-5-5");
    await owner.put("/v1/admin/assistant/settings").send({ model: "claude-opus-5-5" });

    const rep = await owner.post("/v1/admin/assistant/reports");
    expect(rep.status).toBe(201);
    expect(rep.body.report.content).toMatch(/Quote requests:/);
    expect(rep.body.report.content).toMatch(/6–12 months/);
  });
});
