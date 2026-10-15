/**
 * Assistant settings (Setting key "assistant"), editable by OWNER/STAFF in /admin/assistant.
 * The global on/off switch is features.aiAssistantEnabled (shared feature flags).
 */
import { z } from "zod";
import { prisma } from "../../db";
import { ALLOWED_MODELS, DEFAULT_MODEL } from "../../providers/anthropic";
import { getSetting, updateSetting } from "../../settings";

export const assistantSettingsSchema = z.object({
  model: z.enum(ALLOWED_MODELS),
  spanishEnabled: z.boolean(),
  /** Run AI lead qualification on new quote requests (needs a provider key) */
  leadSummaries: z.boolean(),
});
export type AssistantSettings = z.infer<typeof assistantSettingsSchema>;
export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = { model: DEFAULT_MODEL, spanishEnabled: true, leadSummaries: true };

export async function getAssistantSettings(): Promise<AssistantSettings & { enabled: boolean }> {
  const row = await prisma.setting.findUnique({ where: { key: "assistant" } });
  const parsed = assistantSettingsSchema.partial().safeParse(row?.value ?? {});
  const features = await getSetting("features");
  return { ...DEFAULT_ASSISTANT_SETTINGS, ...(parsed.success ? parsed.data : {}), enabled: features.aiAssistantEnabled !== false };
}

export async function saveAssistantSettings(input: unknown, userEmail?: string) {
  const { enabled, ...rest } = z.object({ enabled: z.boolean().optional() }).passthrough().parse(input) as { enabled?: boolean } & Record<string, unknown>;
  const current = await getAssistantSettings();
  const next = assistantSettingsSchema.parse({ model: current.model, spanishEnabled: current.spanishEnabled, leadSummaries: current.leadSummaries, ...rest });
  await prisma.setting.upsert({ where: { key: "assistant" }, update: { value: next, updatedBy: userEmail }, create: { key: "assistant", value: next, updatedBy: userEmail } });
  if (typeof enabled === "boolean") await updateSetting("features", { aiAssistantEnabled: enabled }, userEmail);
  return getAssistantSettings();
}
