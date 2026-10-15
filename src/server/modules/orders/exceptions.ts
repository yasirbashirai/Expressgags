/**
 * Order exceptions (Master Requirements §9.5): the office works from exceptions that need action
 * instead of inspecting every normal order. Shared by the admin (orders module) and the driver app.
 */
import { z } from "zod";
import { prisma } from "../../db";
import type { Prisma } from "../../generated/prisma/client";
import { emit } from "../../lib/events";
import { HttpError } from "../../lib/errors";
import { addOrderEvent } from "../../services/orders";
import { orderWindow } from "../dispatch/conflicts";

export const EXCEPTION_TYPES = [
  "LATE_PICKUP", "CARRIER_DELAY", "ADDRESS_PROBLEM", "PAYMENT_FAILURE", "DESTINATION_CHANGE", "OVERSIZED_ITEM", "COUNT_MISMATCH", "DELIVERY_FAILED", "CAPACITY", "DAMAGE", "OTHER",
] as const;
export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const EXCEPTION_LABEL: Record<(typeof EXCEPTION_TYPES)[number], string> = {
  LATE_PICKUP: "Late pickup",
  CARRIER_DELAY: "Carrier delay",
  ADDRESS_PROBLEM: "Address problem",
  PAYMENT_FAILURE: "Payment failure",
  DESTINATION_CHANGE: "Destination change",
  OVERSIZED_ITEM: "Oversized item detected",
  COUNT_MISMATCH: "Bag count mismatch",
  DELIVERY_FAILED: "Delivery attempt failed",
  CAPACITY: "Capacity issue",
  DAMAGE: "Damage reported",
  OTHER: "Other order-at-risk",
};

export const createExceptionSchema = z.object({
  type: z.enum(EXCEPTION_TYPES),
  severity: z.enum(SEVERITIES).default("MEDIUM"),
  detail: z.string().trim().min(3, "Describe what happened").max(2000),
  uploadIds: z.array(z.string().max(60)).max(10).default([]),
});

export async function createException(
  orderId: string,
  input: z.infer<typeof createExceptionSchema>,
  actor: { type: string; id?: string; name?: string },
) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!order) throw new HttpError(404, "Order not found.");
  const ex = await prisma.orderException.create({
    data: { orderId, type: input.type, severity: input.severity, detail: input.detail, uploadIds: input.uploadIds, reportedBy: actor.name ?? actor.type },
  });
  await addOrderEvent({
    orderId,
    type: "EXCEPTION",
    detail: `${EXCEPTION_LABEL[input.type]}: ${input.detail}`,
    actorType: actor.type,
    actorId: actor.id,
    actorName: actor.name,
    uploadIds: input.uploadIds,
  });
  await emit("order.exception", { orderId, exceptionId: ex.id, type: ex.type, severity: ex.severity });
  return ex;
}

export async function updateException(
  id: string,
  action: { status: "ACKNOWLEDGED" | "RESOLVED" | "OPEN"; resolution?: string; severity?: (typeof SEVERITIES)[number] },
  actor: { id: string; name: string },
) {
  const ex = await prisma.orderException.findUnique({ where: { id } });
  if (!ex) throw new HttpError(404, "Exception not found.");
  if (action.status === "RESOLVED" && !action.resolution?.trim()) throw new HttpError(400, "Add a resolution note before resolving.");
  const updated = await prisma.orderException.update({
    where: { id },
    data: {
      status: action.status,
      severity: action.severity ?? ex.severity,
      ...(action.status === "RESOLVED" ? { resolution: action.resolution, resolvedBy: actor.name, resolvedAt: new Date() } : {}),
      ...(action.status === "OPEN" ? { resolvedAt: null, resolvedBy: null } : {}),
    },
  });
  await addOrderEvent({
    orderId: ex.orderId,
    type: "NOTE",
    detail: action.status === "RESOLVED" ? `Exception resolved: ${action.resolution}` : `Exception ${action.status.toLowerCase()}`,
    actorType: "user",
    actorId: actor.id,
    actorName: actor.name,
  });
  return updated;
}

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Inbox: unresolved first, by severity then age. */
export async function listExceptions(filter: { status?: string; type?: string }) {
  const where: Prisma.OrderExceptionWhereInput = {};
  if (filter.status === "open" || !filter.status) where.status = { not: "RESOLVED" };
  else if (filter.status !== "all") where.status = filter.status;
  if (filter.type) where.type = filter.type;
  const rows = await prisma.orderException.findMany({
    where,
    take: 300,
    orderBy: { createdAt: "asc" },
    include: { order: { select: { id: true, reference: true, status: true, serviceDate: true, market: true, priority: true, customer: { select: { name: true } } } } },
  });
  return rows.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * Automatic exception sweep (safe to run repeatedly; cron-ready).
 * - LATE_PICKUP: pickup window ended (plus grace) and the order hasn't been picked up.
 * - CARRIER_DELAY / stale: in transit or with a carrier for longer than `staleHours` without a new event.
 * Never duplicates an open exception of the same type for the same order.
 */
export async function sweepExceptions(opts: { now?: Date; graceMinutes?: number; staleHours?: number } = {}) {
  const now = opts.now ?? new Date();
  const grace = (opts.graceMinutes ?? 30) * 60_000;
  const staleMs = (opts.staleHours ?? 36) * 3_600_000;
  const created: { orderId: string; type: string }[] = [];

  const open = await prisma.orderException.findMany({ where: { status: { not: "RESOLVED" } }, select: { orderId: true, type: true } });
  const has = new Set(open.map((o) => `${o.orderId}:${o.type}`));

  const dayAgo = new Date(now.getTime() - 3 * 24 * 3_600_000);
  const waiting = await prisma.order.findMany({
    where: { status: { in: ["CONFIRMED", "DRIVER_ASSIGNED", "EN_ROUTE"] }, serviceDate: { lte: new Date(now.getTime() + 24 * 3_600_000), gte: dayAgo } },
    select: { id: true, reference: true, serviceDate: true, timeWindow: true, windowStart: true, windowEnd: true },
  });
  for (const o of waiting) {
    const w = orderWindow(o);
    if (w.end.getTime() + grace < now.getTime() && !has.has(`${o.id}:LATE_PICKUP`)) {
      await createException(o.id, { type: "LATE_PICKUP", severity: "HIGH", detail: `Pickup window ended at ${w.end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} and the order is not picked up.`, uploadIds: [] }, { type: "system", name: "Automatic sweep" });
      created.push({ orderId: o.id, type: "LATE_PICKUP" });
    }
  }

  const moving = await prisma.order.findMany({
    where: { status: { in: ["IN_TRANSIT", "TRANSFERRED_TO_CARRIER", "OUT_FOR_DELIVERY"] } },
    select: { id: true, status: true, events: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
  });
  for (const o of moving) {
    const last = o.events[0]?.createdAt ?? new Date(0);
    const type = o.status === "TRANSFERRED_TO_CARRIER" || o.status === "IN_TRANSIT" ? "CARRIER_DELAY" : "DELIVERY_FAILED";
    if (now.getTime() - last.getTime() > staleMs && !has.has(`${o.id}:${type}`)) {
      await createException(o.id, { type, severity: "MEDIUM", detail: `No tracking update for over ${Math.round(staleMs / 3_600_000)} hours.`, uploadIds: [] }, { type: "system", name: "Automatic sweep" });
      created.push({ orderId: o.id, type });
    }
  }
  return { created };
}
