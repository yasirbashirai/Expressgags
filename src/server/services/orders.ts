/**
 * Core order service shared by every module (quotation acceptance, instant booking, admin entry,
 * dispatch, driver app). Owns: order creation with piece IDs, the status state machine, and the
 * chain-of-custody event log. Emits domain events (src/server/lib/events.ts).
 */
import type { OrderStatus, Prisma } from "../generated/prisma/client";
import { prisma } from "../db";
import { emit } from "../lib/events";
import { HttpError } from "../lib/errors";
import { orderReference, pieceId } from "../lib/reference";

/** Allowed forward transitions (CANCELLED reachable from any non-final state). */
export const ORDER_FLOW: Record<OrderStatus, OrderStatus[]> = {
  CONFIRMED: ["DRIVER_ASSIGNED", "CANCELLED"],
  DRIVER_ASSIGNED: ["EN_ROUTE", "CONFIRMED", "CANCELLED"],
  EN_ROUTE: ["PICKED_UP", "DRIVER_ASSIGNED", "CANCELLED"],
  PICKED_UP: ["AT_FACILITY", "TRANSFERRED_TO_CARRIER", "OUT_FOR_DELIVERY", "IN_TRANSIT", "DELIVERED"],
  AT_FACILITY: ["TRANSFERRED_TO_CARRIER", "OUT_FOR_DELIVERY", "IN_TRANSIT", "DELIVERED"],
  TRANSFERRED_TO_CARRIER: ["IN_TRANSIT", "DELIVERED"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "AT_FACILITY", "DELIVERED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "AT_FACILITY"],
  DELIVERED: [],
  CANCELLED: [],
};

/** Customer-facing wording for each status (tracking page, notifications). */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  CONFIRMED: "Order confirmed",
  DRIVER_ASSIGNED: "Driver assigned",
  EN_ROUTE: "Driver en route",
  PICKED_UP: "Picked up",
  AT_FACILITY: "At Express Bags processing / storage",
  TRANSFERRED_TO_CARRIER: "Transferred to carrier",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered / released",
  CANCELLED: "Cancelled",
};

export type NewOrderInput = {
  customerId: string;
  companyId?: string | null;
  serviceType: string;
  fulfillment?: "local" | "nationwide" | "storage" | "custom";
  quoteId?: string | null;
  quotationId?: string | null;
  pickup: Prisma.InputJsonValue;
  delivery: Prisma.InputJsonValue;
  extraStops?: Prisma.InputJsonValue;
  serviceDate: Date;
  timeWindow?: string | null;
  market: string;
  pieces: { category: string; description?: string; weightLbs?: number; lengthIn?: number; widthIn?: number; heightIn?: number }[];
  retailCents?: number | null;
  costCents?: number | null;
  depositCents?: number | null;
  pricingBreakdown?: Prisma.InputJsonValue;
  priority?: string;
  specialHandling?: string | null;
  accessNotes?: string | null;
  customerNotes?: string | null;
  poNumber?: string | null;
  costCenter?: string | null;
  guestName?: string | null;
  guestRoom?: string | null;
  bookedByCustomerId?: string | null;
  vehicleClassCode?: string | null;
  paymentStatus?: string;
};

export async function createOrder(input: NewOrderInput, actor: { type: string; id?: string; name?: string } = { type: "system" }) {
  if (input.pieces.length === 0) throw new HttpError(400, "An order needs at least one piece.");
  if (input.pieces.length > 2000) throw new HttpError(400, "Too many pieces for one order; split it or use a custom quotation.");
  const reference = orderReference();
  const order = await prisma.order.create({
    data: {
      reference,
      serviceType: input.serviceType,
      fulfillment: input.fulfillment ?? "local",
      customerId: input.customerId,
      companyId: input.companyId ?? null,
      quoteId: input.quoteId ?? null,
      quotationId: input.quotationId ?? null,
      pickup: input.pickup,
      delivery: input.delivery,
      extraStops: input.extraStops,
      serviceDate: input.serviceDate,
      timeWindow: input.timeWindow ?? null,
      market: input.market,
      priority: input.priority ?? "NORMAL",
      retailCents: input.retailCents ?? null,
      costCents: input.costCents ?? null,
      depositCents: input.depositCents ?? null,
      pricingBreakdown: input.pricingBreakdown,
      specialHandling: input.specialHandling ?? null,
      accessNotes: input.accessNotes ?? null,
      customerNotes: input.customerNotes ?? null,
      poNumber: input.poNumber ?? null,
      costCenter: input.costCenter ?? null,
      guestName: input.guestName ?? null,
      guestRoom: input.guestRoom ?? null,
      bookedByCustomerId: input.bookedByCustomerId ?? null,
      vehicleClassCode: input.vehicleClassCode ?? null,
      paymentStatus: input.paymentStatus ?? "UNPAID",
      pieces: {
        create: input.pieces.map((p, i) => ({
          pieceId: pieceId(reference, i + 1),
          barcode: pieceId(reference, i + 1),
          category: p.category,
          description: p.description,
          weightLbs: p.weightLbs,
          lengthIn: p.lengthIn,
          widthIn: p.widthIn,
          heightIn: p.heightIn,
        })),
      },
      events: {
        create: { type: "STATUS", status: "CONFIRMED", detail: "Order confirmed", actorType: actor.type, actorId: actor.id, actorName: actor.name, customerVisible: true },
      },
    },
    include: { pieces: true },
  });
  await emit("order.created", { orderId: order.id });
  return order;
}

/** Move an order through the state machine, writing a chain-of-custody event. */
export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  actor: { type: string; id?: string; name?: string },
  opts: { detail?: string; lat?: number; lng?: number; uploadIds?: string[]; force?: boolean; reason?: string } = {},
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new HttpError(404, "Order not found.");
  if (order.status === to) return order;
  if (!opts.force && !ORDER_FLOW[order.status].includes(to)) {
    throw new HttpError(409, `Cannot move an order from ${STATUS_LABEL[order.status]} to ${STATUS_LABEL[to]}.`);
  }
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: to,
      ...(to === "DELIVERED" ? { completedAt: new Date() } : {}),
      ...(to === "CANCELLED" ? { cancelledAt: new Date(), cancelReason: opts.reason ?? null } : {}),
      events: {
        create: {
          type: "STATUS",
          status: to,
          detail: opts.detail ?? STATUS_LABEL[to],
          actorType: actor.type,
          actorId: actor.id,
          actorName: actor.name,
          lat: opts.lat,
          lng: opts.lng,
          uploadIds: opts.uploadIds ?? [],
          customerVisible: true,
        },
      },
    },
  });
  // Pieces follow the order status unless they have been individually scanned further
  await prisma.orderPiece.updateMany({ where: { orderId }, data: { status: to } });
  await emit("order.status_changed", { orderId, from: order.status, to, actorName: actor.name });
  if (to === "DELIVERED") await emit("order.delivered", { orderId });
  return updated;
}

/** Append a chain-of-custody event (scan, photo, note, handoff…). */
export function addOrderEvent(data: {
  orderId: string;
  pieceId?: string;
  type: string;
  detail?: string;
  actorType: string;
  actorId?: string;
  actorName?: string;
  lat?: number;
  lng?: number;
  uploadIds?: string[];
  customerVisible?: boolean;
}) {
  return prisma.orderEvent.create({ data: { ...data, uploadIds: data.uploadIds ?? [] } });
}
