/**
 * Extension point for additional AI providers (OpenAI, Google Gemini, Microsoft Copilot / Azure OpenAI…).
 *
 * Carlos's requirement: the platform must work with OpenAI, Copilot, Gemini, Claude and future models
 * "without rebuilding". Every AI feature calls the provider-neutral AiProvider interface
 * (src/server/providers/index.ts: chat + optional runAgent). To add a provider:
 *   1. implement AiProvider here (map AiToolSpec → that vendor's tool format inside runAgent),
 *   2. call registerProvider("ai", () => openaiProvider) when its key is present,
 *   3. import this file from src/server/modules/assistant/index.ts.
 * Nothing else in the platform changes. Not configured yet, so it is intentionally inert.
 */
import type { AiProvider } from "./index";

export const openaiProvider: AiProvider = {
  name: "openai",
  model: "not-configured",
  async chat() {
    throw new Error("OpenAI provider is not configured for Express Bags yet.");
  },
};
