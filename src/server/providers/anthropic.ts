/**
 * Anthropic (Claude) adapter for the provider-agnostic AiProvider interface.
 * Registered when ANTHROPIC_API_KEY is set (ASSISTANT_MODEL optional, default claude-opus-5-5).
 *
 * - Streaming manual tool loop (client.beta.messages.stream + finalMessage), tool inputs streamed eagerly
 *   and validated by the caller's executeTool before anything runs.
 * - Static system prompt is prompt-cached (cache_control on the system block).
 * - Server-side refusal fallback ("default" routing) enabled for models that support it.
 * - Effort "low" for chat-style turns (fast, short answers); thinking stays adaptive (always on for Opus 5.5).
 * The account and key belong to Express Bags, Inc.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AiAgentRequest, AiAgentResult, AiMessage, AiProvider } from "./index";
import { registerProvider } from "./registry";

/** Models the owner may pick in admin settings. Default is the current Opus. */
export const ALLOWED_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];
export const DEFAULT_MODEL: AllowedModel = "claude-opus-5-5";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** Haiku 5.5 has no server-side fallback; Opus 5.5 and Sonnet 5.5 accept fallbacks: "default" on the Claude API. */
const supportsFallback = (model: string) => model !== "claude-haiku-5-5";

export function resolveModel(requested?: string | null): AllowedModel {
  const m = requested ?? process.env.ASSISTANT_MODEL ?? DEFAULT_MODEL;
  return (ALLOWED_MODELS as readonly string[]).includes(m) ? (m as AllowedModel) : DEFAULT_MODEL;
}

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ timeout: 60_000, maxRetries: 2 }));

function fallbackParams(model: string) {
  return supportsFallback(model) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {};
}

const toParams = (history: AiMessage[]): Anthropic.Beta.BetaMessageParam[] => history.map((m) => ({ role: m.role, content: m.content }));

export const anthropicProvider: AiProvider = {
  name: "anthropic",
  model: resolveModel(),

  /** Single non-tool call (lead summaries, report narration). jsonSchema → structured output. */
  async chat(system, messages, opts = {}) {
    const model = resolveModel(opts.model);
    const response = await getClient().beta.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 4000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: toParams(messages),
      output_config: { effort: "low", ...(opts.jsonSchema ? { format: { type: "json_schema", schema: opts.jsonSchema } } : {}) },
      ...fallbackParams(model),
    });
    if (response.stop_reason === "refusal") return { text: "" };
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return { text, usage: { input: response.usage.input_tokens, output: response.usage.output_tokens } };
  },

  /** Streaming, tool-using conversation turn. */
  async runAgent(req: AiAgentRequest): Promise<AiAgentResult> {
    const model = resolveModel(req.model);
    const tools: Anthropic.Beta.BetaTool[] = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
      eager_input_streaming: true,
    }));
    const messages: Anthropic.Beta.BetaMessageParam[] = toParams(req.history);
    const toolsUsed: string[] = [];
    let finalText = "";
    let stopReason = "end_turn";
    const usage = { input: 0, output: 0, cacheRead: 0 };
    const maxRounds = req.maxRounds ?? 4;

    for (let round = 0; round < maxRounds; round++) {
      const stream = getClient().beta.messages.stream(
        {
          model,
          max_tokens: req.maxTokens ?? 2000,
          system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
          tools,
          messages,
          output_config: { effort: "low" },
          ...fallbackParams(model),
        },
        { signal: req.signal },
      );
      stream.on("text", (delta) => req.onText?.(delta));

      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await stream.finalMessage();
      } catch (err) {
        // Only an unparseable streamed tool input is retried once; API errors propagate to the caller
        if (err instanceof Anthropic.APIError || round === maxRounds - 1) throw err;
        continue;
      }
      usage.input += message.usage.input_tokens;
      usage.output += message.usage.output_tokens;
      usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
      stopReason = message.stop_reason ?? "end_turn";

      const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      if (text) finalText += (finalText ? "\n\n" : "") + text;

      if (stopReason === "refusal") break; // never run tools from a refused turn
      if (stopReason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }
      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (!toolUses.length) break;
      if (stopReason === "max_tokens") break; // truncated tool input: do not execute it

      messages.push({ role: "assistant", content: message.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const call of toolUses) {
        toolsUsed.push(call.name);
        try {
          results.push({ type: "tool_result", tool_use_id: call.id, content: await req.executeTool(call.name, call.input) });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: (e as Error).message.slice(0, 500) });
        }
      }
      // All tool results for one assistant turn go back in a single user message
      messages.push({ role: "user", content: results });
    }
    return { text: finalText, toolsUsed, stopReason, model, usage };
  },
};

if (process.env.ANTHROPIC_API_KEY) registerProvider("ai", () => anthropicProvider);
