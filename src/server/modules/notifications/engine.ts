/**
 * Notification engine: subscribes to domain events and turns them into queued messages.
 * Other modules never call this directly — they emit events (src/server/lib/events.ts).
 *
 *  event → which template(s) → which channels (settings + feature flags + contact prefs)
 *        → NotificationJob rows (dedupe key, quiet hours, delay) → worker sends them.
 *
 * Privacy: the only staff identity that ever reaches a customer is the assigned DRIVER's first name,
 * and only for that customer's own booking.
 */
import type { OrderStatus } from "../../generated/prisma/client";
import { prisma } from "../../db";
import { on } from "../../lib/events";
import { env } from "../../lib/env";
import { publicToken } from "../../lib/reference";
import { siteUrl } from "../../lib/templates/layout";
import { STAFF_TEMPLATES, type Lang, type TemplateData, type TemplateKey } from "../../lib/templates";
import { getSetting } from "../../settings";
import { getNotificationSettings } from "./settings";
import { formatMiamiDate, formatMiamiTime, nextAllowedTime, toE164 } from "./time";
import { processJob } from "./worker";
import { unsubscribeUrl } from "./unsubscribe";

const WINDOW: Record<string, { en: string; es: string }> = {
  "early-morning": { en: "Early morning (before 8 AM)", es: "Temprano (antes de las 8 AM)" },
  morning: { en: "Morning (8 AM – 12 PM)", es: "Mañana (8 AM – 12 PM)" },
  midday: { en: "Midday (11 AM – 2 PM)", es: "Mediodía (11 AM – 2 PM)" },
  afternoon: { en: "Afternoon (12 PM – 5 PM)", es: "Tarde (12 PM – 5 PM)" },
  evening: { en: "Evening (5 PM – 9 PM)", es: "Noche (5 PM – 9 PM)" },
  "after-hours": { en: "After hours", es: "Fuera de horario" },
  flexible: { en: "Flexible", es: "Flexible" },
};

/** Exceptions a customer should hear about (internal ones like payment/capacity stay internal). */
export const CUSTOMER_EXCEPTIONS: Record<string, { en: string; es: string }> = {
  LATE_PICKUP: { en: "Your pickup is running later than planned", es: "Su recogida va más tarde de lo previsto" },
  CARRIER_DELAY: { en: "The carrier reported a delay", es: "El transportista reportó un retraso" },
  DESTINATION_CHANGE: { en: "We received a destination change", es: "Recibimos un cambio de destino" },
  DELIVERY_FAILED: { en: "We could not complete the delivery attempt", es: "No pudimos completar el intento de entrega" },
};

const STATUS_TEMPLATE: Partial<Record<OrderStatus, TemplateKey>> = {
  EN_ROUTE: "order.en_route",
  PICKED_UP: "order.picked_up",
  AT_FACILITY: "order.at_facility",
  TRANSFERRED_TO_CARRIER: "order.transferred_to_carrier",
  IN_TRANSIT: "order.in_transit",
  OUT_FOR_DELIVERY: "order.out_for_delivery",
  DELIVERED: "order.delivered",
  CANCELLED: "order.cancelled",
};

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const firstName = (name?: string | null) => (name ?? "").trim().split(/\s+/)[0] || undefined;
const langOf = (l?: string | null): Lang => (l === "es" ? "es" : "en");
const loc = (j: unknown) => {
  const a = (j as { address?: string } | null)?.address;
  return a ? a.slice(0, 120) : undefined;
};

type Recipient = { customerId?: string; email?: string | null; phone?: string | null; preferredContact?: string | null; language?: string | null; name?: string | null };

/** Snapshot of an order for templates (assigned driver first name only). */
export async function orderTemplateData(orderId: string, langHint?: Lang): Promise<{ data: TemplateData; recipient: Recipient } | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      _count: { select: { pieces: true } },
      assignments: { where: { role: "DRIVER", status: { not: "REMOVED" } }, include: { employee: { select: { firstName: true } } }, orderBy: { assignedAt: "desc" }, take: 1 },
      shipments: { where: { trackingNumber: { not: null } }, select: { carrier: true, trackingNumber: true } },
      proofs: { where: { kind: { in: ["DELIVERY", "RELEASE"] } }, orderBy: { capturedAt: "desc" }, take: 1 },
    },
  });
  if (!order) return null;
  const lang = langHint ?? langOf(order.customer.language);
  const pod = order.proofs[0];
  const data: TemplateData = {
    customerName: firstName(order.customer.name),
    reference: order.reference,
    trackUrl: `${siteUrl()}/track?ref=${encodeURIComponent(order.reference)}`,
    serviceDate: formatMiamiDate(order.serviceDate, lang),
    window: order.timeWindow ? WINDOW[order.timeWindow]?.[lang] ?? order.timeWindow : undefined,
    pickup: loc(order.pickup),
    delivery: loc(order.delivery),
    pieces: order._count.pieces,
    driverFirstName: order.assignments[0]?.employee.firstName || undefined,
    carrierTracking: order.shipments.map((s) => ({ carrier: s.carrier, number: s.trackingNumber! })),
    podTime: pod ? formatMiamiTime(pod.capturedAt, lang) : undefined,
    podRecipient: pod?.recipientName ?? undefined,
    podPieces: pod?.pieceCount,
    accountUrl: `${siteUrl()}/account`,
  };
  return { data, recipient: { customerId: order.customerId, email: order.customer.email, phone: order.customer.phone, preferredContact: order.customer.preferredContact, language: order.customer.language, name: order.customer.name } };
}

export type EnqueueOptions = {
  template: TemplateKey;
  data: TemplateData;
  recipient: Recipient;
  /** Stable subject for de-duplication, e.g. "order:<id>" or "payment:<id>" */
  subject: string;
  orderId?: string;
  /** Delay before sending (survey) */
  delayMinutes?: number;
  /** Force channels (admin test sends, staff alerts) instead of settings */
  channels?: ("email" | "sms" | "whatsapp")[];
};

/**
 * Queue a customer message on every allowed channel. Returns the job ids created
 * (existing dedupe keys are skipped silently: the same template never goes twice).
 */
export async function enqueue(opts: EnqueueOptions) {
  const settings = await getNotificationSettings();
  const features = await getSetting("features");
  const lang = langOf(opts.recipient.language);
  const toggle = settings.events[opts.template] ?? { email: true, sms: false };
  const wanted: ("email" | "sms" | "whatsapp")[] = opts.channels ?? [];
  if (!opts.channels) {
    if (toggle.email && opts.recipient.email) wanted.push("email");
    const phone = toE164(opts.recipient.phone);
    const pref = (opts.recipient.preferredContact ?? "").toLowerCase();
    // SMS/WhatsApp only when the feature is on, the customer gave a phone and didn't ask for email-only contact
    if (toggle.sms && features.smsEnabled && phone && pref !== "email") wanted.push(pref === "whatsapp" ? "whatsapp" : "sms");
  }
  const base = new Date(Date.now() + (opts.delayMinutes ?? 0) * 60_000);
  const created: string[] = [];
  for (const channel of wanted) {
    const to = channel === "email" ? (opts.recipient.email ?? "").trim().toLowerCase() : toE164(opts.recipient.phone);
    if (!to) continue;
    const scheduledFor = channel === "email" ? base : nextAllowedTime(base, settings.quietHours);
    const data = channel === "email" && (opts.template === "survey.request") ? { ...opts.data, unsubscribeUrl: unsubscribeUrl(to) } : opts.data;
    try {
      const job = await prisma.notificationJob.create({
        data: {
          dedupeKey: `${opts.subject}:${opts.template}:${channel}`,
          channel,
          to,
          template: opts.template,
          language: lang,
          data: data as object,
          orderId: opts.orderId ?? null,
          customerId: opts.recipient.customerId ?? null,
          scheduledFor,
        },
      });
      created.push(job.id);
    } catch (e) {
      // Unique violation on dedupeKey → already queued/sent: that's the de-duplication working.
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  // Send anything that is due right away (keeps the request path simple and tests deterministic)
  for (const id of created) {
    const job = await prisma.notificationJob.findUnique({ where: { id } });
    if (job && job.scheduledFor.getTime() <= Date.now()) await processJob(job.id);
  }
  return created;
}

/** Staff alert email to contact.notifyEmail + configured staff recipients (deduped per subject). */
export async function alertStaff(template: TemplateKey, subject: string, data: TemplateData) {
  if (!STAFF_TEMPLATES.includes(template)) throw new Error(`${template} is not a staff template`);
  const contact = await getSetting("contact");
  const settings = await getNotificationSettings();
  const recipients = [...new Set([contact.notifyEmail, ...settings.staffRecipients].filter(Boolean).map((e) => e.toLowerCase()))];
  for (const email of recipients) {
    await enqueue({ template, data, subject: `${subject}:${email}`, recipient: { email, language: "en" }, channels: ["email"] });
  }
  return recipients.length;
}

/* ------------------------------------------------------------------ */
/* Event subscriptions                                                  */
/* ------------------------------------------------------------------ */

let registered = false;

/** Idempotent: wires all domain-event handlers once per process. */
export function registerNotificationHandlers() {
  if (registered) return;
  registered = true;

  on("order.created", async ({ orderId }) => {
    const o = await orderTemplateData(orderId);
    if (o) await enqueue({ template: "order.confirmed", data: o.data, recipient: o.recipient, subject: `order:${orderId}`, orderId });
  });

  on("order.assigned", async ({ orderId, role }) => {
    if (role !== "DRIVER") return;
    const o = await orderTemplateData(orderId);
    if (o) await enqueue({ template: "order.driver_assigned", data: o.data, recipient: o.recipient, subject: `order:${orderId}`, orderId });
  });

  on("order.status_changed", async ({ orderId, to }) => {
    const template = STATUS_TEMPLATE[to];
    if (!template) return;
    const o = await orderTemplateData(orderId);
    if (o) await enqueue({ template, data: o.data, recipient: o.recipient, subject: `order:${orderId}`, orderId });
  });

  on("order.delivered", async ({ orderId }) => {
    await scheduleSurvey(orderId);
  });

  on("order.exception", async ({ orderId, exceptionId, type, severity }) => {
    const o = await orderTemplateData(orderId);
    if (!o) return;
    const customerFacing = CUSTOMER_EXCEPTIONS[type];
    if (customerFacing) {
      const lang = langOf(o.recipient.language);
      await enqueue({ template: "order.update", data: { ...o.data, exceptionLabel: customerFacing[lang] }, recipient: o.recipient, subject: `exception:${exceptionId}`, orderId });
    }
    if (severity === "HIGH" || severity === "CRITICAL") {
      const ex = await prisma.orderException.findUnique({ where: { id: exceptionId }, select: { detail: true } });
      await alertStaff("staff.exception_alert", `exception:${exceptionId}`, {
        reference: o.data.reference,
        severity,
        exceptionLabel: type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
        exceptionDetail: ex?.detail ?? undefined,
        adminUrl: `${siteUrl()}/admin/exceptions`,
      });
    }
  });

  on("quotation.sent", async ({ quotationId }) => {
    const q = await prisma.quotation.findUnique({ where: { id: quotationId }, include: { customer: true } });
    if (!q) return;
    await enqueue({
      template: "quotation.sent",
      data: { customerName: firstName(q.customer.name), quotationRef: q.reference, quotationUrl: `${siteUrl()}/q/${q.publicToken}` },
      recipient: q.customer,
      subject: `quotation:${q.id}:${q.publicToken}`,
    });
  });

  on("quotation.accepted", async ({ quotationId, orderId }) => {
    const q = await prisma.quotation.findUnique({ where: { id: quotationId }, include: { customer: true, order: { select: { reference: true } } } });
    if (!q) return;
    const reference = q.order?.reference;
    await enqueue({
      template: "quotation.accepted",
      data: {
        customerName: firstName(q.customer.name),
        quotationRef: q.reference,
        quotationUrl: `${siteUrl()}/q/${q.publicToken}`,
        reference,
        trackUrl: reference ? `${siteUrl()}/track?ref=${encodeURIComponent(reference)}` : undefined,
      },
      recipient: q.customer,
      subject: `quotation:${q.id}`,
      orderId,
    });
  });

  on("invoice.issued", async ({ invoiceId }) => {
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true } });
    if (!inv) return;
    await enqueue({
      template: "invoice.issued",
      data: {
        customerName: firstName(inv.customer.name),
        invoiceNumber: inv.number,
        invoiceUrl: `${siteUrl()}/invoice/${inv.publicToken}`,
        amount: money(inv.totalCents - inv.paidCents),
        dueDate: inv.dueAt ? formatMiamiDate(inv.dueAt, langOf(inv.customer.language)) : undefined,
      },
      recipient: inv.customer,
      subject: `invoice:${inv.id}`,
    });
  });

  on("payment.succeeded", async ({ paymentId }) => {
    const p = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: { select: { reference: true, customer: true } },
        invoice: { select: { number: true, customer: true } },
        quotation: { select: { reference: true, customer: true } },
      },
    });
    if (!p || p.kind === "REFUND") return;
    const customer = p.order?.customer ?? p.invoice?.customer ?? p.quotation?.customer;
    if (!customer) return;
    await enqueue({
      template: "payment.receipt",
      data: { customerName: firstName(customer.name), amount: money(p.amountCents), reference: p.order?.reference, invoiceNumber: p.invoice?.number, quotationRef: p.quotation?.reference, accountUrl: `${siteUrl()}/account` },
      recipient: customer,
      subject: `payment:${p.id}`,
      orderId: p.orderId ?? undefined,
    });
  });

  on("customer.registered", async ({ customerId }) => {
    const c = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!c) return;
    await enqueue({ template: "customer.welcome", data: { customerName: firstName(c.name), accountUrl: `${siteUrl()}/account` }, recipient: c, subject: `customer:${c.id}` });
  });

  on("claim.submitted", async ({ claimId }) => {
    const claim = await prisma.claim.findUnique({ where: { id: claimId }, include: { order: { select: { reference: true } } } });
    if (!claim) return;
    await alertStaff("staff.claim_submitted", `claim:${claimId}`, { claimRef: claim.reference, reference: claim.order.reference, adminUrl: `${siteUrl()}/admin/claims` });
  });

  // Storage reminders: the STORAGE module may emit "storage.reminder" (not yet in DomainEvents).
  // Subscribe defensively through the untyped bus so it works as soon as the event exists.
  (on as unknown as (e: string, h: (p: { bookingId?: string; orderId?: string; message?: string; kind?: string }) => Promise<void>) => void)(
    "storage.reminder",
    async (p) => {
      const orderId = p.orderId ?? (p.bookingId ? (await prisma.storageBooking.findUnique({ where: { id: p.bookingId }, select: { orderId: true } }))?.orderId : undefined);
      if (!orderId) return;
      const o = await orderTemplateData(orderId);
      if (o) await enqueue({ template: "storage.reminder", data: { ...o.data, storageMessage: p.message }, recipient: o.recipient, subject: `storage:${p.bookingId ?? orderId}:${p.kind ?? "reminder"}`, orderId });
    },
  );
}

/** Create the survey for a delivered order and queue its invitation after the configured delay. */
export async function scheduleSurvey(orderId: string) {
  const features = await getSetting("features");
  if (!features.surveysEnabled) return null;
  const existing = await prisma.surveyResponse.findUnique({ where: { orderId } });
  if (existing) return existing;
  const o = await orderTemplateData(orderId);
  if (!o) return null;
  const survey = await prisma.surveyResponse.create({ data: { orderId, token: publicToken(32) } });
  const settings = await getNotificationSettings();
  await enqueue({
    template: "survey.request",
    data: { ...o.data, surveyUrl: `${siteUrl()}/survey/${survey.token}` },
    recipient: o.recipient,
    subject: `survey:${survey.id}`,
    orderId,
    delayMinutes: settings.surveyDelayMinutes,
  });
  return survey;
}

/** Exposed for diagnostics/tests. */
export const _internal = { WINDOW, STATUS_TEMPLATE, isTest: () => env.nodeEnv === "test" };
