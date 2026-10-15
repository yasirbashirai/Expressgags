/**
 * Carrier shipments for nationwide orders: staff rate-shopping (with internal cost/margin), label
 * purchase (one label + tracking number per bag), void, tracking refresh, and carrier-event handling
 * that moves the Express Bags order through the state machine (services/orders.ts).
 *
 * Carrier tracking numbers are stored separately from Express Bags references (Carlos's rule:
 * never mix the two) and are shown labeled as carrier tracking in the tracking page and portal.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { OrderStatus, Prisma } from "../../generated/prisma/client";
import { prisma } from "../../db";
import { on } from "../../lib/events";
import { fetchProviderFile } from "../../lib/security";
import { HttpError } from "../../lib/errors";
import { storeUpload } from "../../lib/multipart";
import { carriers } from "../../providers/registry";
import { addOrderEvent, ORDER_FLOW, transitionOrder } from "../../services/orders";
import { parseAddress } from "./address";
import { quoteNationwide, type PieceInput } from "./quote";

type Loc = { type?: string; address?: string; facility?: string; market?: string };

/** Destination address of an order (from its delivery JSON). */
export function orderDestination(order: { delivery: Prisma.JsonValue }) {
  const d = (order.delivery ?? {}) as Loc;
  return parseAddress(d.address ?? "");
}

const SYSTEM = { type: "system", name: "Carrier shipping" };

/** Staff rate shop for an order's pieces (internal: costs and margins included). */
export async function rateShopOrder(orderId: string, opts: { processingPoint?: string; destination?: string } = {}) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { pieces: { orderBy: { pieceId: "asc" } }, shipments: true } });
  if (!order) throw new HttpError(404, "Order not found.");
  const active = order.shipments.filter((s) => s.status !== "VOIDED");
  if (active.length) throw new HttpError(409, "This order already has carrier labels. Void them before buying new ones.");
  const destination = opts.destination ? parseAddress(opts.destination) : orderDestination(order);
  if (!destination.zip && destination.country === "US") throw new HttpError(400, "The delivery address needs a 5-digit ZIP code before rates can be shopped. Edit the order's delivery address.");
  const pickupType = ((order.pickup ?? {}) as Loc).type;
  const pieces: PieceInput[] = order.pieces.map((p) => ({
    category: p.category as PieceInput["category"],
    weightLbs: p.weightLbs ?? undefined,
    lengthIn: p.lengthIn ?? undefined,
    widthIn: p.widthIn ?? undefined,
    heightIn: p.heightIn ?? undefined,
  }));
  const result = await quoteNationwide({ destination, includePickup: pickupType !== "storage", pieces, processingPoint: opts.processingPoint });
  return { order, destination, result };
}

/** Stores a label file as a private Upload (kind=label). Mock provider → generated sample label PDF. */
async function storeLabel(labelUrl: string, trackingNumber: string, carrier: string, service: string, orderId: string, pieceLabel: string) {
  let bytes: Uint8Array;
  let type = "application/pdf";
  let ext = "pdf";
  if (/^https?:\/\//.test(labelUrl)) {
    // SSRF guard: only https label files hosted by EasyPost (lib/security.ts)
    const file = await fetchProviderFile(labelUrl, ["easypost.com", /^easypost-files\.s3[.-][a-z0-9.-]*amazonaws\.com$/]);
    bytes = file.bytes;
    type = file.contentType === "application/octet-stream" ? "application/pdf" : file.contentType;
    ext = type.includes("png") ? "png" : "pdf";
  } else {
    bytes = await mockLabelPdf(trackingNumber, carrier, service, pieceLabel);
  }
  const id = await storeUpload(new File([Buffer.from(bytes)], `label-${trackingNumber}.${ext}`, { type }));
  await prisma.upload.update({ where: { id }, data: { kind: "label", ownerType: "order", ownerId: orderId } });
  return id;
}

/** Clearly-marked sample label for mock mode (never valid for shipping). */
async function mockLabelPdf(tracking: string, carrier: string, service: string, piece: string) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([288, 432]); // 4x6 in
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 10, y: 10, width: 268, height: 412, borderColor: rgb(0, 0.16, 0.35), borderWidth: 2 });
  page.drawText("SAMPLE LABEL", { x: 24, y: 388, size: 20, font: bold, color: rgb(0.88, 0.38, 0.06) });
  page.drawText("Test mode, not valid for shipping", { x: 24, y: 370, size: 9, font });
  page.drawText(`${carrier} ${service}`, { x: 24, y: 330, size: 14, font: bold });
  page.drawText("Tracking", { x: 24, y: 300, size: 9, font });
  page.drawText(tracking, { x: 24, y: 282, size: 16, font: bold });
  page.drawText(`Piece ${piece}`, { x: 24, y: 250, size: 11, font });
  for (let i = 0; i < 40; i++) page.drawRectangle({ x: 24 + i * 6, y: 120, width: i % 3 === 0 ? 3 : 1.5, height: 90, color: rgb(0, 0, 0) });
  page.drawText("Express Bags, Inc.", { x: 24, y: 40, size: 10, font: bold, color: rgb(0, 0.16, 0.35) });
  return doc.save();
}

/** Buy one label per piece for the chosen Express Bags service level (re-shops to get fresh rates). */
export async function buyLabels(orderId: string, level: string, actor: { id: string; name: string }, opts: { processingPoint?: string; destination?: string } = {}) {
  const { order, result } = await rateShopOrder(orderId, opts);
  if (result.status !== "priced") throw new HttpError(409, `No carrier rates: ${result.reason}`);
  const offer = result.offers.find((o) => o.level === level);
  const refs = result.rateRefs[level];
  if (!offer || !refs || refs.length !== order.pieces.length) throw new HttpError(409, "That service level is no longer available. Refresh the rates.");
  const provider = carriers();
  const created = [];
  for (let i = 0; i < order.pieces.length; i++) {
    const piece = order.pieces[i];
    const ref = refs[i];
    const bought = await provider.buyLabel(ref.providerRateId, ref.shipmentRef);
    const labelUploadId = await storeLabel(bought.labelUrl, bought.trackingNumber, offer.carrier, offer.carrierService, order.id, `${i + 1} of ${order.pieces.length}`);
    const parcel = result.parcels[i];
    // Retail is allocated to pieces in proportion to carrier cost (for per-piece reporting)
    const share = result.offers.length ? ref.costCents / Math.max(1, refs.reduce((s, r) => s + r.costCents, 0)) : 1 / order.pieces.length;
    const shipment = await prisma.carrierShipment.create({
      data: {
        orderId: order.id,
        pieceId: piece.id,
        provider: provider.name,
        carrier: offer.carrier,
        service: offer.carrierService,
        ebServiceLevel: offer.level,
        providerShipmentId: bought.providerShipmentId,
        trackingNumber: bought.trackingNumber,
        labelUploadId,
        costCents: ref.costCents,
        retailCents: Math.round(offer.retailCents * share),
        billableWeightLbs: parcel.billableWeightLbs,
        transitDays: offer.transitDays,
        status: "LABELED",
        events: [{ at: new Date().toISOString(), status: "LABELED", detail: "Label purchased" }],
      },
    });
    await prisma.orderPiece.update({ where: { id: piece.id }, data: { custodyLocation: `Labeled ${offer.carrier} ${bought.trackingNumber}` } });
    created.push(shipment);
  }
  await prisma.order.update({ where: { id: order.id }, data: { fulfillment: "nationwide" } });
  await addOrderEvent({
    orderId: order.id,
    type: "CARRIER",
    detail: `${created.length} carrier label(s) purchased: ${offer.levelName} (${offer.carrier} ${offer.carrierService})`,
    actorType: "user",
    actorId: actor.id,
    actorName: actor.name,
    customerVisible: false,
  });
  return { offer, shipments: created };
}

/** Void every active label on an order (carrier refund handled by the provider when supported). */
export async function voidShipment(shipmentId: string, actor: { id: string; name: string }) {
  const s = await prisma.carrierShipment.findUnique({ where: { id: shipmentId } });
  if (!s) throw new HttpError(404, "Shipment not found.");
  if (!["CREATED", "LABELED"].includes(s.status)) throw new HttpError(409, "Only labels that have not been handed to the carrier can be voided.");
  const provider = carriers() as ReturnType<typeof carriers> & { voidLabel?: (id: string) => Promise<{ ok: boolean }> };
  if (provider.voidLabel && s.providerShipmentId) {
    const r = await provider.voidLabel(s.providerShipmentId);
    if (!r.ok) throw new HttpError(502, "The carrier refused to void this label.");
  }
  const updated = await prisma.carrierShipment.update({
    where: { id: s.id },
    data: { status: "VOIDED", events: appendEvent(s.events, { status: "VOIDED", detail: "Label voided" }) },
  });
  await addOrderEvent({ orderId: s.orderId, type: "CARRIER", detail: `Carrier label ${s.trackingNumber} voided`, actorType: "user", actorId: actor.id, actorName: actor.name });
  return updated;
}

type TrackEvent = { at: string; status: string; detail?: string; location?: string };
function appendEvent(events: Prisma.JsonValue | null, e: Omit<TrackEvent, "at"> & { at?: string }): Prisma.InputJsonValue {
  const list = Array.isArray(events) ? (events as TrackEvent[]) : [];
  return [...list, { at: e.at ?? new Date().toISOString(), status: e.status, ...(e.detail ? { detail: e.detail } : {}), ...(e.location ? { location: e.location } : {}) }] as Prisma.InputJsonValue;
}

/** Map a carrier/provider status to our shipment status. */
export function mapCarrierStatus(s: string): string {
  const v = s.toLowerCase().replace(/[\s-]/g, "_");
  if (v === "delivered") return "DELIVERED";
  if (["in_transit", "out_for_delivery", "available_for_pickup", "transit"].includes(v)) return "IN_TRANSIT";
  if (["pre_transit", "unknown"].includes(v)) return "LABELED";
  if (["failure", "return_to_sender", "error", "cancelled", "exception"].includes(v)) return "EXCEPTION";
  return "IN_TRANSIT";
}

/**
 * Apply a carrier tracking update to one shipment, then move the order:
 *  - first in-transit scan → TRANSFERRED_TO_CARRIER (if still with Express Bags) → IN_TRANSIT
 *  - all active shipments delivered → DELIVERED
 *  - exception → open an order exception for the office
 * Only legal transitions are applied; anything else is recorded on the timeline.
 */
export async function applyTrackingUpdate(trackingNumber: string, providerStatus: string, events: { at: string; status: string; location?: string; message?: string }[] = []) {
  const shipment = await prisma.carrierShipment.findFirst({ where: { trackingNumber }, orderBy: { createdAt: "desc" } });
  if (!shipment) return { updated: false as const, reason: "unknown tracking number" };
  if (shipment.status === "VOIDED") return { updated: false as const, reason: "voided" };
  let next = mapCarrierStatus(providerStatus);
  // Never move a shipment backwards (a late "pre_transit" event after pickup keeps the newer status)
  const RANK: Record<string, number> = { CREATED: 0, LABELED: 1, TENDERED: 2, IN_TRANSIT: 3, EXCEPTION: 3, DELIVERED: 4 };
  if ((RANK[next] ?? 0) < (RANK[shipment.status] ?? 0)) next = shipment.status;
  const latest = events[events.length - 1];
  await prisma.carrierShipment.update({
    where: { id: shipment.id },
    data: { status: next, events: appendEvent(shipment.events, { status: next, detail: latest?.message ?? providerStatus, location: latest?.location, at: latest?.at }) },
  });

  const order = await prisma.order.findUnique({ where: { id: shipment.orderId }, include: { shipments: true } });
  if (!order) return { updated: true as const };
  const step = async (to: OrderStatus, detail: string) => {
    const cur = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
    if (cur && ORDER_FLOW[cur.status].includes(to)) await transitionOrder(order.id, to, SYSTEM, { detail });
  };
  if (next === "IN_TRANSIT") {
    await step("TRANSFERRED_TO_CARRIER", `Handed to ${shipment.carrier}`);
    await step("IN_TRANSIT", `In transit with ${shipment.carrier}`);
  } else if (next === "DELIVERED") {
    const active = order.shipments.filter((s) => s.status !== "VOIDED");
    const allDelivered = active.every((s) => (s.id === shipment.id ? true : s.status === "DELIVERED"));
    await step("TRANSFERRED_TO_CARRIER", `Handed to ${shipment.carrier}`);
    await step("IN_TRANSIT", `In transit with ${shipment.carrier}`);
    if (allDelivered) await step("DELIVERED", `Delivered by ${shipment.carrier}`);
    else await addOrderEvent({ orderId: order.id, type: "CARRIER", detail: `${shipment.carrier} delivered ${trackingNumber}`, actorType: "carrier", actorName: shipment.carrier, customerVisible: true });
  } else if (next === "EXCEPTION") {
    await prisma.orderException.create({
      data: { orderId: order.id, type: "CARRIER_DELAY", severity: "HIGH", detail: `${shipment.carrier} reported "${providerStatus}" for ${trackingNumber}`, reportedBy: "carrier" },
    });
    await addOrderEvent({ orderId: order.id, type: "EXCEPTION", detail: `Carrier exception on ${trackingNumber}`, actorType: "carrier", actorName: shipment.carrier });
  }
  return { updated: true as const, status: next };
}

/** Manual "refresh tracking" for one shipment (pulls the latest status from the provider). */
export async function refreshTracking(shipmentId: string) {
  const s = await prisma.carrierShipment.findUnique({ where: { id: shipmentId } });
  if (!s?.trackingNumber) throw new HttpError(404, "Shipment not found.");
  const t = await carriers().track(s.trackingNumber, s.carrier);
  return applyTrackingUpdate(s.trackingNumber, t.status, t.events);
}

/** When a driver/dispatcher hands the bags to the carrier, labeled shipments become TENDERED. */
on("order.status_changed", async ({ orderId, to }) => {
  if (to !== "TRANSFERRED_TO_CARRIER") return;
  const list = await prisma.carrierShipment.findMany({ where: { orderId, status: "LABELED" } });
  for (const s of list) {
    await prisma.carrierShipment.update({ where: { id: s.id }, data: { status: "TENDERED", events: appendEvent(s.events, { status: "TENDERED", detail: "Handed to carrier" }) } });
  }
});
