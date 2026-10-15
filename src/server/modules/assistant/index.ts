/**
 * Module "assistant" — bilingual website assistant, AI search, lead qualification and AI business reports.
 *
 * Public (/v1/assistant):
 *   GET  /config                 → { enabled, spanishEnabled, mode }
 *   POST /chat                   { sessionId, message, lang? } → JSON reply, or SSE stream when Accept: text/event-stream
 *   POST /handoff                { sessionId, name, email?, phone?, message } → passes the customer to the office team
 *   GET  /search?q=              → public knowledge search results (AI site search)
 *   GET  /draft/:token           → quote draft created in chat (opened by the quote wizard via ?draft=)
 * Admin (/v1/admin/assistant, OWNER/STAFF):
 *   GET /stats · GET /conversations · GET /conversations/:id · GET|PUT /settings
 *   GET /reports · POST /reports · GET|POST /quotes/:id/summary
 */
import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { audit, requireAuth, requireRole } from "../../auth";
import { prisma } from "../../db";
import { asyncHandler, HttpError } from "../../lib/errors";
import "../../providers/anthropic"; // registers the Claude adapter when ANTHROPIC_API_KEY is set
import { ALLOWED_MODELS } from "../../providers/anthropic";
import { ai } from "../../providers/registry";
import type { PlatformModule } from "../types";
import { runChat, type StoredMessage } from "./chat";
import { searchKnowledge } from "./knowledge";
import { subscribeLeadQualification, summarizeQuote } from "./leads";
import { generateWeeklyReport } from "./reports";
import { getAssistantSettings, saveAssistantSettings } from "./settings";
import { createLead } from "./tools";

export const adminRouter = Router();
export const publicRouter = Router();

subscribeLeadQualification();

const limiter = (limit: number, windowMinutes = 10) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: Number(process.env.ASSISTANT_RATE_LIMIT || limit),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { ok: false, error: "Too many messages. Please wait a few minutes or call our office at (305) 783-2860." },
  });

const sessionId = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "Invalid session");

async function assertEnabled() {
  const s = await getAssistantSettings();
  if (!s.enabled) throw new HttpError(404, "The assistant is not available right now.");
  return s;
}

// ---------------------------------------------------------------- public

publicRouter.get(
  "/config",
  asyncHandler(async (_req, res) => {
    const s = await getAssistantSettings();
    res.json({ ok: true, enabled: s.enabled, spanishEnabled: s.spanishEnabled, mode: ai().name === "scripted" ? "scripted" : "ai" });
  }),
);

const chatBody = z.object({ sessionId, message: z.string().trim().min(1).max(1500), lang: z.enum(["en", "es", "auto"]).optional() });

publicRouter.post(
  "/chat",
  limiter(40),
  asyncHandler(async (req: Request, res) => {
    await assertEnabled();
    const body = chatBody.parse(req.body);
    const wantsStream = (req.get("accept") ?? "").includes("text/event-stream");
    if (!wantsStream) {
      const r = await runChat({ ...body, ip: req.ip });
      return res.json({ ok: true, reply: r.reply, lang: r.lang, mode: r.mode, links: r.links });
    }
    // Server-sent events: "delta" events with text pieces, then one "done" event with the final payload
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const keepAlive = setInterval(() => res.write(": ping\n\n"), 15000);
    try {
      const r = await runChat({ ...body, ip: req.ip }, (delta) => send("delta", { text: delta }));
      send("done", { reply: r.reply, lang: r.lang, mode: r.mode, links: r.links });
    } catch (e) {
      send("error", { error: e instanceof HttpError ? e.message : "The assistant is unavailable. Please call (305) 783-2860." });
    } finally {
      clearInterval(keepAlive);
      res.end();
    }
  }),
);

const handoffBody = z
  .object({ sessionId, name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(200).optional().or(z.literal("")), phone: z.string().trim().max(40).optional().or(z.literal("")), message: z.string().trim().min(1).max(2000), website: z.string().max(0).optional().or(z.literal("")) })
  .refine((b) => !!b.email || (b.phone && b.phone.replace(/\D/g, "").length >= 7), { message: "Add a phone number or email so we can reach you", path: ["phone"] });

publicRouter.post(
  "/handoff",
  limiter(8, 30),
  asyncHandler(async (req, res) => {
    await assertEnabled();
    const b = handoffBody.parse(req.body);
    if (b.website) return res.status(201).json({ ok: true }); // honeypot
    const conv =
      (await prisma.aiConversation.findUnique({ where: { sessionId: b.sessionId } })) ??
      (await prisma.aiConversation.create({ data: { sessionId: b.sessionId, messages: [] } }));
    const transcript = ((conv.messages ?? []) as unknown as StoredMessage[]).slice(-6).map((m) => `${m.role === "user" ? "Customer" : "Assistant"}: ${m.content}`).join("\n");
    const r = await createLead({ name: b.name, email: b.email || undefined, phone: b.phone || undefined, topic: "talk to a person", summary: `${b.message}${transcript ? `\n\nRecent chat:\n${transcript}` : ""}`.slice(0, 2000) }, { conversationId: conv.id, lang: (conv.language as "en" | "es") ?? "en" });
    if (!r.ok) throw new HttpError(400, r.error);
    res.status(201).json({ ok: true });
  }),
);

publicRouter.get(
  "/search",
  limiter(60),
  asyncHandler(async (req, res) => {
    const q = z.string().trim().min(1).max(200).parse(req.query.q);
    res.json({ ok: true, results: searchKnowledge(q, 8).map((r) => ({ title: r.title, url: r.url, snippet: r.text.slice(0, 220) + (r.text.length > 220 ? "…" : ""), kind: r.kind })) });
  }),
);

publicRouter.get(
  "/draft/:token",
  limiter(30),
  asyncHandler(async (req, res) => {
    const token = z.string().regex(/^[A-Za-z0-9]{16,64}$/).parse(req.params.token);
    const d = await prisma.aiQuoteDraft.findUnique({ where: { token } });
    if (!d || d.expiresAt < new Date()) throw new HttpError(404, "This quote link has expired. Please start a new request.");
    if (!d.openedAt) await prisma.aiQuoteDraft.update({ where: { id: d.id }, data: { openedAt: new Date() } });
    res.json({ ok: true, draft: d.data });
  }),
);

// ---------------------------------------------------------------- admin

adminRouter.use(requireAuth, requireRole("OWNER", "STAFF"));

adminRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const since = new Date(Date.now() - 30 * 86400000);
    const [conversations, handoffs, openHandoffs, drafts, opened, summaries] = await Promise.all([
      prisma.aiConversation.count({ where: { createdAt: { gte: since } } }),
      prisma.aiConversation.count({ where: { createdAt: { gte: since }, handoffRequested: true } }),
      prisma.contactMessage.count({ where: { topic: { startsWith: "assistant-handoff" }, status: "NEW" } }),
      prisma.aiQuoteDraft.count({ where: { createdAt: { gte: since } } }),
      prisma.aiQuoteDraft.count({ where: { createdAt: { gte: since }, openedAt: { not: null } } }),
      prisma.quoteEvent.count({ where: { createdAt: { gte: since }, type: "ai_summary" } }),
    ]);
    const s = await getAssistantSettings();
    res.json({ ok: true, stats: { conversations, handoffs, openHandoffs, drafts, draftsOpened: opened, summaries }, provider: ai().name, settings: s, allowedModels: ALLOWED_MODELS });
  }),
);

adminRouter.get(
  "/conversations",
  asyncHandler(async (req, res) => {
    const q = z.object({ handoff: z.enum(["1", "0"]).optional(), page: z.coerce.number().int().min(1).max(500).default(1), lang: z.enum(["en", "es"]).optional() }).parse(req.query);
    const where = { ...(q.handoff === "1" ? { handoffRequested: true } : {}), ...(q.lang ? { language: q.lang } : {}) };
    const take = 25;
    const [rows, total] = await Promise.all([
      prisma.aiConversation.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (q.page - 1) * take, take }),
      prisma.aiConversation.count({ where }),
    ]);
    res.json({
      ok: true,
      total,
      page: q.page,
      conversations: rows.map((c) => {
        const msgs = (c.messages ?? []) as unknown as StoredMessage[];
        const firstUser = msgs.find((m) => m.role === "user");
        return { id: c.id, language: c.language, messages: msgs.length, preview: firstUser?.content.slice(0, 140) ?? "", handoffRequested: c.handoffRequested, leadEmail: c.leadEmail, provider: c.provider, model: c.model, updatedAt: c.updatedAt, createdAt: c.createdAt, usedTools: [...new Set(msgs.flatMap((m) => m.tools ?? []))] };
      }),
    });
  }),
);

adminRouter.get(
  "/conversations/:id",
  asyncHandler(async (req, res) => {
    const c = await prisma.aiConversation.findUnique({ where: { id: String(req.params.id) } });
    if (!c) throw new HttpError(404, "Conversation not found.");
    const drafts = await prisma.aiQuoteDraft.findMany({ where: { conversationId: c.id }, select: { token: true, createdAt: true, openedAt: true } });
    res.json({ ok: true, conversation: { id: c.id, language: c.language, handoffRequested: c.handoffRequested, leadEmail: c.leadEmail, provider: c.provider, model: c.model, createdAt: c.createdAt, updatedAt: c.updatedAt, messages: c.messages, drafts } });
  }),
);

adminRouter.get(
  "/settings",
  asyncHandler(async (_req, res) => res.json({ ok: true, settings: await getAssistantSettings(), allowedModels: ALLOWED_MODELS, provider: ai().name })),
);

adminRouter.put(
  "/settings",
  requireRole("OWNER"),
  asyncHandler(async (req, res) => {
    const settings = await saveAssistantSettings(req.body, req.user?.email);
    await audit(req, "update", "assistant-settings", undefined, settings);
    res.json({ ok: true, settings });
  }),
);

adminRouter.get(
  "/reports",
  asyncHandler(async (_req, res) => {
    const reports = await prisma.aiReport.findMany({ where: { kind: "weekly-summary" }, orderBy: { createdAt: "desc" }, take: 12 });
    res.json({ ok: true, reports: reports.map((r) => ({ id: r.id, periodStart: r.periodStart, periodEnd: r.periodEnd, content: r.content, createdAt: r.createdAt, narrated: (r.data as { narrated?: boolean } | null)?.narrated ?? false })) });
  }),
);

adminRouter.post(
  "/reports",
  limiter(10, 60),
  asyncHandler(async (req, res) => {
    const r = await generateWeeklyReport();
    await audit(req, "create", "ai-report", r.id);
    res.status(201).json({ ok: true, report: { id: r.id, periodStart: r.periodStart, periodEnd: r.periodEnd, content: r.content, createdAt: r.createdAt, narrated: (r.data as { narrated?: boolean } | null)?.narrated ?? false } });
  }),
);

adminRouter.get(
  "/quotes/:id/summary",
  asyncHandler(async (req, res) => {
    const q = await prisma.quoteRequest.findUnique({ where: { id: String(req.params.id) }, select: { aiSummary: true } });
    if (!q) throw new HttpError(404, "Quote request not found.");
    res.json({ ok: true, summary: q.aiSummary, available: ai().name !== "scripted" });
  }),
);

adminRouter.post(
  "/quotes/:id/summary",
  limiter(30, 60),
  asyncHandler(async (req, res) => {
    if (ai().name === "scripted") throw new HttpError(409, "AI lead summaries need an AI provider key (ANTHROPIC_API_KEY).");
    const summary = await summarizeQuote(String(req.params.id));
    if (!summary) throw new HttpError(502, "The AI summary could not be generated. Try again later.");
    await audit(req, "create", "ai-lead-summary", String(req.params.id));
    res.json({ ok: true, summary });
  }),
);

export const platformModule: PlatformModule = {
  name: "assistant",
  routes: [
    { scope: "admin", path: "/assistant", router: adminRouter },
    { scope: "public", path: "/assistant", router: publicRouter },
  ],
};
