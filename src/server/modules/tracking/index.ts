/**
 * Module "tracking" — public delivery tracking (/v1/track).
 *   POST /v1/track   { reference, verifier }  → customer-safe tracking view
 *
 * Privacy & safety rules (Carlos's form A15/B13, Master §3.4):
 *  - A reference alone is never enough: the caller must also give the booking email, the last 4 digits
 *    of the booking phone, or the delivery ZIP code. Failures return one generic "not found" (no enumeration).
 *  - Only customer-visible events are returned; internal notes, costs and staff identities never are.
 *  - The assigned driver's FIRST name (and the dispatch office line) appear only after a driver is assigned.
 *  - Express Bags references and carrier tracking numbers are always shown separately and labeled.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { airports, contact, ports } from "@/content/site";
import { prisma } from "../../db";
import type { OrderStatus } from "../../generated/prisma/client";
import { asyncHandler, HttpError } from "../../lib/errors";
import { STATUS_LABEL } from "../../services/orders";
import type { PlatformModule } from "../types";

export const publicRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.TRACK_RATE_LIMIT || 40),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { ok: false, error: "Too many tracking attempts. Please wait a few minutes or call our office." },
});

/** The customer-facing progress line (cancelled is shown separately). */
export const TRACK_STEPS: OrderStatus[] = ["CONFIRMED", "DRIVER_ASSIGNED", "EN_ROUTE", "PICKED_UP", "AT_FACILITY", "TRANSFERRED_TO_CARRIER", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];

const NOT_FOUND = "We couldn't find a delivery with those details. Check the reference and the email, phone or ZIP you booked with.";

const digits = (s: string) => s.replace(/\D/g, "");
const zipOf = (stop: unknown) => {
  const s = (stop ?? {}) as { address?: string; zip?: string };
  const m = (s.zip || s.address || "").match(/\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/);
  return m?.[1] ?? null;
};

/** True when the verifier matches the booking email, phone last-4 or delivery ZIP. */
export function verifierMatches(verifier: string, booking: { email: string; phone: string | null; delivery: unknown }) {
  const v = verifier.trim().toLowerCase();
  if (!v) return false;
  if (v.includes("@")) return v === booking.email.toLowerCase();
  const d = digits(v);
  if (d.length === 4 && booking.phone && digits(booking.phone).slice(-4) === d) return true;
  if (d.length === 5 && zipOf(booking.delivery) === d) return true;
  return false;
}

/** Customer-safe description of a stop: type + facility/area, never internal notes or access codes. */
function publicStop(stop: unknown) {
  const s = (stop ?? {}) as { type?: string; address?: string; facility?: string; market?: string };
  const fac = s.facility ? (airports.find((a) => a.code === s.facility)?.code ?? ports.find((p) => p.slug === s.facility)?.name ?? s.facility) : "";
  const addr = s.address ?? "";
  const parts = fac && !addr.toLowerCase().includes(fac.toLowerCase()) ? [fac, addr] : [addr];
  return { type: s.type ?? null, label: parts.filter(Boolean).join(" · ") || null, market: s.market ?? null };
}

publicRouter.post(
  "/",
  limiter,
  asyncHandler(async (req, res) => {
    const { reference, verifier } = z
      .object({ reference: z.string().trim().min(6).max(40), verifier: z.string().trim().min(4).max(200) })
      .parse(req.body);
    const ref = reference.toUpperCase().replace(/\s+/g, "");
    // Accept a piece ID (EB-YYMMDD-XXXX-NN) as well as the order reference
    const orderRef = /^EB-\d{6}-[A-Z0-9]{4}-\d{2,4}$/.test(ref) ? ref.replace(/-\d{2,4}$/, "") : ref;

    const order = await prisma.order.findUnique({
      where: { reference: orderRef },
      include: {
        customer: { select: { email: true, phone: true } },
        pieces: { select: { status: true } },
        events: { where: { customerVisible: true }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, type: true, status: true, detail: true, createdAt: true } },
        proofs: { where: { kind: { in: ["DELIVERY", "RELEASE"] } }, orderBy: { capturedAt: "desc" }, take: 1, select: { capturedAt: true, recipientName: true, pieceCount: true, kind: true } },
        shipments: { select: { carrier: true, trackingNumber: true, status: true, ebServiceLevel: true } },
        assignments: { where: { role: "DRIVER", status: { not: "REMOVED" } }, take: 1, select: { employee: { select: { firstName: true } } } },
      },
    });
    if (!order || !verifierMatches(verifier, { email: order.customer.email, phone: order.customer.phone, delivery: order.delivery })) {
      throw new HttpError(404, NOT_FOUND);
    }

    const driverAssigned = order.status !== "CONFIRMED" && order.status !== "CANCELLED" && !!order.assignedDriverRef && order.assignments.length > 0;
    const delivered = order.pieces.filter((p) => p.status === "DELIVERED").length;
    res.json({
      ok: true,
      tracking: {
        reference: order.reference,
        status: order.status,
        statusLabel: STATUS_LABEL[order.status],
        steps: TRACK_STEPS.filter((s) => order.fulfillment === "nationwide" || s !== "TRANSFERRED_TO_CARRIER").map((s) => ({ status: s, label: STATUS_LABEL[s] })),
        cancelled: order.status === "CANCELLED",
        serviceDate: order.serviceDate,
        timeWindow: order.timeWindow,
        pickup: publicStop(order.pickup),
        delivery: publicStop(order.delivery),
        pieces: { total: order.pieces.length, delivered },
        events: order.events.map((e) => ({ id: e.id, label: e.status ? STATUS_LABEL[e.status] : e.detail, detail: e.status ? e.detail : null, at: e.createdAt })),
        proof: order.proofs[0] ? { at: order.proofs[0].capturedAt, recipientName: order.proofs[0].recipientName, pieceCount: order.proofs[0].pieceCount } : null,
        // Carrier numbers are a separate list, clearly labeled — never mixed with Express Bags references
        carrierTracking: order.shipments.filter((s) => s.trackingNumber).map((s) => ({ carrier: s.carrier, trackingNumber: s.trackingNumber, status: s.status, serviceLevel: s.ebServiceLevel })),
        driver: driverAssigned ? { firstName: order.assignments[0].employee.firstName, contact: `Dispatch ${contact.phoneDisplay}`, contactHref: contact.phoneHref } : null,
      },
    });
  }),
);

export const platformModule: PlatformModule = {
  name: "tracking",
  routes: [{ scope: "public", path: "/track", router: publicRouter }],
};
