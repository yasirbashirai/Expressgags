/**
 * Status-based cancellation / refund rules (Master Requirements §17.1).
 * Stored in Setting "cancellationRules". The defaults below are PLACEHOLDERS for Carlos to set:
 * the platform only SUGGESTS a refund amount; staff always confirms the actual refund.
 */
import { z } from "zod";
import type { OrderStatus } from "../../generated/prisma/client";
import { prisma } from "../../db";

export const CANCELLATION_STAGES = ["before-dispatch", "driver-dispatched", "after-pickup", "label-purchased", "storage-started"] as const;
export type CancellationStage = (typeof CANCELLATION_STAGES)[number];

export const cancellationRulesSchema = z.object({
  /** % of the amount paid that is refundable at each stage */
  refundPercent: z.record(z.enum(CANCELLATION_STAGES), z.number().min(0).max(100)),
  /** Flat fee kept at each stage (cents), applied after the percentage */
  feeCents: z.record(z.enum(CANCELLATION_STAGES), z.number().int().min(0)),
  note: z.string().max(500).optional(),
});
export type CancellationRules = z.infer<typeof cancellationRulesSchema>;

export const DEFAULT_CANCELLATION_RULES: CancellationRules = {
  refundPercent: { "before-dispatch": 100, "driver-dispatched": 50, "after-pickup": 0, "label-purchased": 0, "storage-started": 0 },
  feeCents: { "before-dispatch": 0, "driver-dispatched": 0, "after-pickup": 0, "label-purchased": 0, "storage-started": 0 },
  note: "Placeholder rules. Express Bags must confirm its cancellation policy before launch.",
};

export async function getCancellationRules(): Promise<CancellationRules> {
  const row = await prisma.setting.findUnique({ where: { key: "cancellationRules" } });
  const parsed = cancellationRulesSchema.safeParse(row?.value);
  return parsed.success ? { ...DEFAULT_CANCELLATION_RULES, ...parsed.data } : DEFAULT_CANCELLATION_RULES;
}

export async function saveCancellationRules(value: unknown, by: string) {
  const rules = cancellationRulesSchema.parse(value);
  await prisma.setting.upsert({ where: { key: "cancellationRules" }, update: { value: rules, updatedBy: by }, create: { key: "cancellationRules", value: rules, updatedBy: by } });
  return rules;
}

/** Which stage an order is in, for refund purposes. */
export function cancellationStage(o: { status: OrderStatus; hasCarrierLabel: boolean; storageStarted: boolean }): CancellationStage {
  if (o.storageStarted) return "storage-started";
  if (o.hasCarrierLabel) return "label-purchased";
  if (["PICKED_UP", "AT_FACILITY", "TRANSFERRED_TO_CARRIER", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"].includes(o.status)) return "after-pickup";
  if (["DRIVER_ASSIGNED", "EN_ROUTE"].includes(o.status)) return "driver-dispatched";
  return "before-dispatch";
}

export function suggestRefundCents(paidCents: number, stage: CancellationStage, rules: CancellationRules) {
  const pct = rules.refundPercent[stage] ?? 0;
  const fee = rules.feeCents[stage] ?? 0;
  return Math.max(0, Math.round((paidCents * pct) / 100) - fee);
}

/** Suggestion for a specific order (staff confirms before any refund is issued). */
export async function refundSuggestion(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true, shipments: true, storage: true } });
  if (!order) return null;
  const paid = order.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + (p.kind === "REFUND" ? -p.amountCents : p.amountCents), 0);
  const stage = cancellationStage({
    status: order.status,
    hasCarrierLabel: order.shipments.some((s) => !!s.trackingNumber && s.status !== "VOIDED"),
    storageStarted: order.storage.some((s) => s.status === "CHECKED_IN" || s.status === "OVERSTAY"),
  });
  const rules = await getCancellationRules();
  return { stage, paidCents: paid, suggestedRefundCents: suggestRefundCents(paid, stage, rules), rules };
}
