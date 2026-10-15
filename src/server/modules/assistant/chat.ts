/**
 * Conversation orchestrator for the website assistant.
 * Order of operations per user message:
 *   1. language detection (or the user's manual toggle)
 *   2. deterministic prohibited-request check (moving / food / hazardous → polite decline, no model call)
 *   3. AI provider tool loop (Claude by default) — or the scripted fallback when no provider is configured
 *   4. output filter (no prices, no banned claims, no private contact details)
 *   5. persist the transcript (AiConversation; IP stored only as a salted hash)
 */
import { createHash } from "node:crypto";
import { prisma } from "../../db";
import { env } from "../../lib/env";
import { ai } from "../../providers/registry";
import type { AiMessage } from "../../providers";
import { detectLanguage, detectProhibited, PROHIBITED_REPLY, sanitizeReply, type Lang } from "./guardrails";
import { systemPrompt } from "./prompt";
import { scriptedReply } from "./scripted";
import { getAssistantSettings } from "./settings";
import { executeTool, TOOL_SPECS } from "./tools";

export type StoredMessage = { role: "user" | "assistant"; content: string; at: string; tools?: string[]; lang?: Lang };

export const MAX_TURNS_PER_CONVERSATION = 40;
const HISTORY_WINDOW = 16; // last N messages sent to the model

export type ChatInput = { sessionId: string; message: string; lang?: Lang | "auto"; ip?: string };
export type ChatResult = { reply: string; lang: Lang; conversationId: string; mode: "ai" | "scripted" | "guardrail"; toolsUsed: string[]; links: string[] };

const hashIp = (ip?: string) => (ip ? createHash("sha256").update(env.ipHashSalt + ip).digest("hex").slice(0, 32) : undefined);

/** Paths the assistant mentioned, turned into tappable buttons in the widget. */
export function extractLinks(text: string): string[] {
  const found = text.match(/(?<![\w.])\/(?:request-a-quote(?:\?draft=[A-Za-z0-9]+)?|track|services(?:\/[a-z-]+)?|service-areas(?:\/[a-z-]+)?|airports\/[a-z-]+|ports\/[a-z-]+|faq|business-accounts|contact|terms#prohibited-items|fleet|about|account\/login)/g) ?? [];
  return [...new Set(found)].slice(0, 3);
}

export async function runChat(input: ChatInput, onText?: (delta: string) => void): Promise<ChatResult> {
  const settings = await getAssistantSettings();
  const conv =
    (await prisma.aiConversation.findUnique({ where: { sessionId: input.sessionId } })) ??
    (await prisma.aiConversation.create({ data: { sessionId: input.sessionId, messages: [], ipHash: hashIp(input.ip) } }));
  const history = (Array.isArray(conv.messages) ? conv.messages : []) as unknown as StoredMessage[];
  if (history.filter((m) => m.role === "user").length >= MAX_TURNS_PER_CONVERSATION) {
    const lang = (conv.language as Lang) ?? "en";
    const text = lang === "es" ? "Esta conversación es bastante larga. Para continuar, llame a nuestra oficina al (305) 783-2860 o inicie una cotización en /request-a-quote." : "This conversation is getting long. To continue, please call our office at (305) 783-2860 or start a quote at /request-a-quote.";
    return { reply: text, lang, conversationId: conv.id, mode: "guardrail", toolsUsed: [], links: extractLinks(text) };
  }

  const previous = (conv.language as Lang) || "en";
  let lang: Lang = input.lang && input.lang !== "auto" ? input.lang : detectLanguage(input.message, previous);
  if (lang === "es" && !settings.spanishEnabled) lang = "en";

  let reply: string;
  let mode: ChatResult["mode"];
  let toolsUsed: string[] = [];

  const prohibited = detectProhibited(input.message);
  const provider = ai();
  if (prohibited) {
    reply = PROHIBITED_REPLY[lang][prohibited];
    mode = "guardrail";
    onText?.(reply);
  } else if (provider.runAgent) {
    const model: AiMessage[] = [...history.slice(-HISTORY_WINDOW).map((m) => ({ role: m.role, content: m.content })), { role: "user", content: languageHint(lang) + input.message }];
    try {
      const result = await provider.runAgent({
        system: systemPrompt(),
        history: model,
        tools: TOOL_SPECS,
        executeTool: (name, raw) => executeTool(name, raw, { conversationId: conv.id, lang }),
        onText: undefined, // streamed text is filtered first, see below
        model: settings.model,
        maxTokens: 1500,
        maxRounds: 4,
      });
      toolsUsed = result.toolsUsed;
      reply = result.stopReason === "refusal" || !result.text.trim() ? scriptedReply(input.message, lang).text : result.text;
      mode = "ai";
      await prisma.aiConversation.update({ where: { id: conv.id }, data: { provider: provider.name, model: result.model } });
    } catch (e) {
      console.error("[assistant] provider failed, using scripted reply:", (e as Error).message);
      reply = scriptedReply(input.message, lang).text;
      mode = "scripted";
    }
    // Output filter runs BEFORE anything is shown, then the safe text is streamed to the widget
    reply = sanitizeReply(reply, lang).text;
    if (onText) for (const piece of chunkForStream(reply)) onText(piece);
  } else {
    reply = sanitizeReply(scriptedReply(input.message, lang).text, lang).text;
    mode = "scripted";
    if (onText) for (const piece of chunkForStream(reply)) onText(piece);
  }

  const now = new Date().toISOString();
  const updated: StoredMessage[] = [...history, { role: "user", content: input.message.slice(0, 4000), at: now, lang }, { role: "assistant", content: reply, at: now, tools: toolsUsed.length ? toolsUsed : undefined, lang }];
  const draft = reply.match(/request-a-quote\?draft=([A-Za-z0-9]+)/)?.[1];
  await prisma.aiConversation.update({ where: { id: conv.id }, data: { messages: updated as object[], language: lang } });
  if (draft) await prisma.aiQuoteDraft.updateMany({ where: { token: draft }, data: { conversationId: conv.id } });

  return { reply, lang, conversationId: conv.id, mode, toolsUsed, links: extractLinks(reply) };
}

/** A short system-style hint so the model answers in the chosen language without editing the cached system prompt. */
function languageHint(lang: Lang) {
  return lang === "es" ? "[Responder en español]\n" : "";
}

/** Splits text into word-sized pieces for the SSE stream (keeps the typing effect after filtering). */
export function chunkForStream(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text];
}
