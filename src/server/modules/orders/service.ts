/**
 * Orders module service: admin listing/search, detail assembly, manual creation, quote-request
 * conversion and group-manifest CSV parsing. Status changes always go through services/orders.ts.
 */
import { z } from "zod";
import type { QuoteRequest } from "@/lib/quote-schema";
import { prisma } from "../../db";
import type { OrderStatus, Prisma } from "../../generated/prisma/client";
import { HttpError } from "../../lib/errors";
import { createOrder, type NewOrderInput } from "../../services/orders";

export const ORDER_STATUSES = [
  "CONFIRMED", "DRIVER_ASSIGNED", "EN_ROUTE", "PICKED_UP", "AT_FACILITY", "TRANSFERRED_TO_CARRIER", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED",
] as const satisfies readonly OrderStatus[];

/** Statuses that count as "active" (on the road or in custody). */
export const ACTIVE_STATUSES: OrderStatus[] = ["DRIVER_ASSIGNED", "EN_ROUTE", "PICKED_UP", "AT_FACILITY", "TRANSFERRED_TO_CARRIER", "IN_TRANSIT", "OUT_FOR_DELIVERY"];

/* -------------------------------- Listing -------------------------------- */

export const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.string().optional(), // comma list or "active" / "open"
  market: z.string().max(60).optional(),
  service: z.string().max(60).optional(),
  priority: z.enum(["NORMAL", "RUSH", "VIP"]).optional(),
  paymentStatus: z.string().max(30).optional(),
  companyId: z.string().max(40).optional(),
  customerId: z.string().max(40).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(200).default(50),
});

export function buildOrderWhere(q: z.infer<typeof listQuerySchema>): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  if (q.status) {
    if (q.status === "active") where.status = { in: ACTIVE_STATUSES };
    else if (q.status === "open") where.status = { notIn: ["DELIVERED", "CANCELLED"] };
    else {
      const list = q.status.split(",").filter((s): s is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(s));
      if (list.length) where.status = { in: list };
    }
  }
  if (q.market) where.market = q.market;
  if (q.service) where.serviceType = q.service;
  if (q.priority) where.priority = q.priority;
  if (q.paymentStatus) where.paymentStatus = q.paymentStatus;
  if (q.companyId) where.companyId = q.companyId;
  if (q.customerId) where.customerId = q.customerId;
  if (q.from || q.to) {
    where.serviceDate = {
      ...(q.from ? { gte: new Date(`${q.from}T00:00:00`) } : {}),
      ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999`) } : {}),
    };
  }
  if (q.q) {
    const term = q.q;
    where.OR = [
      { reference: { contains: term, mode: "insensitive" } },
      { guestName: { contains: term, mode: "insensitive" } },
      { poNumber: { contains: term, mode: "insensitive" } },
      { customer: { name: { contains: term, mode: "insensitive" } } },
      { customer: { email: { contains: term, mode: "insensitive" } } },
      { company: { name: { contains: term, mode: "insensitive" } } },
      { pieces: { some: { pieceId: { contains: term, mode: "insensitive" } } } },
    ];
  }
  return where;
}

export async function listOrders(q: z.infer<typeof listQuerySchema>) {
  const where = buildOrderWhere(q);
  const [total, rows, counts] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ serviceDate: "asc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        customer: { select: { name: true, email: true } },
        company: { select: { name: true } },
        _count: { select: { pieces: true, exceptions: { where: { status: { not: "RESOLVED" } } } } },
        assignments: { where: { status: { not: "REMOVED" } }, select: { role: true, employee: { select: { firstName: true, lastName: true } } } },
      },
    }),
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return {
    total,
    page: q.page,
    pageSize: q.pageSize,
    statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    orders: rows.map((o) => ({
      id: o.id,
      reference: o.reference,
      status: o.status,
      serviceType: o.serviceType,
      fulfillment: o.fulfillment,
      market: o.market,
      priority: o.priority,
      paymentStatus: o.paymentStatus,
      serviceDate: o.serviceDate,
      timeWindow: o.timeWindow,
      pickup: o.pickup,
      delivery: o.delivery,
      guestName: o.guestName,
      customer: o.customer,
      company: o.company,
      pieces: o._count.pieces,
      openExceptions: o._count.exceptions,
      crew: o.assignments.map((a) => `${a.employee.firstName} ${a.employee.lastName.slice(0, 1)}. (${a.role.toLowerCase()})`),
      retailCents: o.retailCents,
    })),
  };
}

/* --------------------------------- Detail -------------------------------- */

export async function orderDetail(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true, accountRole: true } },
      company: { select: { id: true, name: true, accountType: true, poRequired: true, paymentTermsDays: true } },
      quote: { select: { id: true, reference: true } },
      quotation: { select: { id: true, reference: true, status: true } },
      pieces: { orderBy: { pieceId: "asc" } },
      events: { orderBy: { createdAt: "desc" }, include: { piece: { select: { pieceId: true } } } },
      assignments: {
        orderBy: [{ status: "asc" }, { sequence: "asc" }],
        include: { employee: { select: { id: true, firstName: true, lastName: true, role: true, phone: true } }, vehicle: { select: { id: true, unitNumber: true, vehicleClassCode: true } } },
      },
      proofs: { orderBy: { capturedAt: "desc" } },
      exceptions: { orderBy: { createdAt: "desc" } },
      shipments: { select: { id: true, carrier: true, service: true, trackingNumber: true, status: true, ebServiceLevel: true } },
      storage: { select: { id: true, reference: true, status: true, startsAt: true, endsAt: true, pieces: true } },
    },
  });
  if (!order) throw new HttpError(404, "Order not found.");
  // Resolve upload metadata referenced by events/proofs/exceptions so the UI can link private downloads
  const uploadIds = new Set<string>();
  for (const e of order.events) e.uploadIds.forEach((u) => uploadIds.add(u));
  for (const p of order.proofs) {
    p.photoUploadIds.forEach((u) => uploadIds.add(u));
    if (p.signatureUploadId) uploadIds.add(p.signatureUploadId);
  }
  for (const x of order.exceptions) x.uploadIds.forEach((u) => uploadIds.add(u));
  const uploads = uploadIds.size
    ? await prisma.upload.findMany({ where: { id: { in: [...uploadIds] } }, select: { id: true, originalName: true, mimeType: true, kind: true, sizeBytes: true } })
    : [];
  return { order, uploads };
}

/* -------------------------------- Creation ------------------------------- */

const stopSchema = z.object({
  type: z.string().min(2).max(40),
  address: z.string().trim().min(3).max(300),
  facility: z.string().max(80).optional().or(z.literal("")),
  market: z.string().min(2).max(60),
  contact: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const pieceInputSchema = z.object({
  category: z.string().min(2).max(40),
  description: z.string().max(200).optional(),
  weightLbs: z.coerce.number().min(0).max(20000).optional(),
  lengthIn: z.coerce.number().min(0).max(600).optional(),
  widthIn: z.coerce.number().min(0).max(600).optional(),
  heightIn: z.coerce.number().min(0).max(600).optional(),
});

export const createOrderSchema = z.object({
  customer: z.union([
    z.object({ id: z.string().min(1) }),
    z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(200), phone: z.string().max(40).optional() }),
  ]),
  companyId: z.string().nullable().optional(),
  serviceType: z.string().min(2).max(40),
  fulfillment: z.enum(["local", "nationwide", "storage", "custom"]).default("local"),
  pickup: stopSchema,
  delivery: stopSchema,
  extraStops: z.array(stopSchema).max(20).default([]),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  timeWindow: z.string().max(40).optional(),
  windowStart: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  windowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  priority: z.enum(["NORMAL", "RUSH", "VIP"]).default("NORMAL"),
  pieces: z.array(pieceInputSchema.extend({ quantity: z.coerce.number().int().min(1).max(2000).default(1) })).min(1),
  retailCents: z.coerce.number().int().min(0).optional(),
  costCents: z.coerce.number().int().min(0).optional(),
  specialHandling: z.string().max(1000).optional(),
  accessNotes: z.string().max(1000).optional(),
  customerNotes: z.string().max(2000).optional(),
  internalNotes: z.string().max(4000).optional(),
  poNumber: z.string().max(80).optional(),
  costCenter: z.string().max(80).optional(),
  guestName: z.string().max(120).optional(),
  guestRoom: z.string().max(40).optional(),
  vehicleClassCode: z.string().max(40).optional(),
});

/** Combines a YYYY-MM-DD date with HH:mm (local time). */
export const atTime = (date: string, hhmm?: string) => (hhmm ? new Date(`${date}T${hhmm}:00`) : null);

/** Expands quantity lines into one row per physical piece (each gets its own piece ID/tag). */
export const expandPieces = (lines: (z.infer<typeof pieceInputSchema> & { quantity?: number })[]) =>
  lines.flatMap((l) => Array.from({ length: l.quantity ?? 1 }, () => ({ category: l.category, description: l.description, weightLbs: l.weightLbs, lengthIn: l.lengthIn, widthIn: l.widthIn, heightIn: l.heightIn })));

export async function createManualOrder(input: z.infer<typeof createOrderSchema>, actor: { id: string; name: string }) {
  let customerId: string;
  let companyId = input.companyId ?? null;
  if ("id" in input.customer) {
    const c = await prisma.customer.findUnique({ where: { id: input.customer.id } });
    if (!c) throw new HttpError(404, "Customer not found.");
    customerId = c.id;
    companyId ??= c.companyId;
  } else {
    const email = input.customer.email.toLowerCase();
    const c = await prisma.customer.upsert({
      where: { email },
      update: { name: input.customer.name, phone: input.customer.phone || undefined },
      create: { name: input.customer.name, email, phone: input.customer.phone || null, companyId },
    });
    customerId = c.id;
    companyId ??= c.companyId;
  }
  const order = await createOrder(
    {
      customerId,
      companyId,
      serviceType: input.serviceType,
      fulfillment: input.fulfillment,
      pickup: input.pickup,
      delivery: input.delivery,
      extraStops: input.extraStops,
      serviceDate: new Date(`${input.serviceDate}T12:00:00`),
      timeWindow: input.timeWindow ?? null,
      market: input.pickup.market,
      pieces: expandPieces(input.pieces),
      retailCents: input.retailCents ?? null,
      costCents: input.costCents ?? null,
      priority: input.priority,
      specialHandling: input.specialHandling ?? null,
      accessNotes: input.accessNotes ?? null,
      customerNotes: input.customerNotes ?? null,
      poNumber: input.poNumber ?? null,
      costCenter: input.costCenter ?? null,
      guestName: input.guestName ?? null,
      guestRoom: input.guestRoom ?? null,
      vehicleClassCode: input.vehicleClassCode ?? null,
    },
    { type: "user", id: actor.id, name: actor.name },
  );
  const windowStart = atTime(input.serviceDate, input.windowStart || undefined);
  const windowEnd = atTime(input.serviceDate, input.windowEnd || undefined);
  if (windowStart || windowEnd || input.internalNotes) {
    await prisma.order.update({ where: { id: order.id }, data: { windowStart, windowEnd, internalNotes: input.internalNotes ?? null } });
  }
  return order;
}

/** Window defaults by named slot (used when converting a quote request). */
const TIME_WINDOW_LABEL: Record<string, string> = {
  "early-morning": "early-morning",
  morning: "morning",
  midday: "midday",
  afternoon: "afternoon",
  evening: "evening",
  "after-hours": "after-hours",
  flexible: "flexible",
};

/** Converts a stored website quote request into a confirmed order (pieces expanded from item lines). */
export async function convertQuoteToOrder(quoteId: string, actor: { id: string; name: string }, overrides: { retailCents?: number; serviceDate?: string } = {}) {
  const quote = await prisma.quoteRequest.findUnique({ where: { id: quoteId }, include: { order: { select: { id: true, reference: true } } } });
  if (!quote) throw new HttpError(404, "Quote request not found.");
  if (quote.order) throw new HttpError(409, `This request already became order ${quote.order.reference}.`, { orderId: quote.order.id });
  const p = quote.payload as unknown as QuoteRequest;
  const fulfillment: NewOrderInput["fulfillment"] =
    quote.route === "CUSTOM_QUOTE" ? "custom" : p.serviceType === "nationwide-shipping" ? "nationwide" : p.serviceType === "storage" ? "storage" : "local";
  const date = overrides.serviceDate ?? p.serviceDate;
  const order = await createOrder(
    {
      customerId: quote.customerId,
      companyId: quote.companyId,
      serviceType: p.serviceType,
      fulfillment,
      quoteId: quote.id,
      pickup: { ...p.pickup, contact: p.onsiteContact || "" },
      delivery: p.delivery,
      extraStops: p.extraStops ?? [],
      serviceDate: new Date(`${date}T12:00:00`),
      timeWindow: TIME_WINDOW_LABEL[p.timeWindow] ?? "flexible",
      market: p.pickup.market,
      pieces: p.items.flatMap((it) =>
        Array.from({ length: Math.min(it.quantity, 2000) }, () => ({
          category: it.category,
          description: it.description || undefined,
          weightLbs: it.weightLbs,
          lengthIn: it.lengthIn,
          widthIn: it.widthIn,
          heightIn: it.heightIn,
        })),
      ).slice(0, 2000),
      retailCents: overrides.retailCents ?? null,
      priority: p.speed === "urgent" || p.speed === "same-day" ? "RUSH" : "NORMAL",
      specialHandling: p.specialHandling || null,
      accessNotes: p.accessNotes || null,
      customerNotes: [p.notes, p.flightDetails && `Flight: ${p.flightDetails}`, p.cruiseLine && `Cruise: ${p.cruiseLine} ${p.shipName ?? ""} ${p.sailingDate ?? ""}`, p.eventName && `Event: ${p.eventName}`]
        .filter(Boolean)
        .join("\n") || null,
    },
    { type: "user", id: actor.id, name: actor.name },
  );
  await prisma.quoteRequest.update({ where: { id: quote.id }, data: { status: "WON" } });
  await prisma.quoteEvent.create({ data: { quoteId: quote.id, type: "converted", detail: `Converted to order ${order.reference}`, actor: actor.name } });
  return order;
}

/* ----------------------------- Manifest import ---------------------------- */

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const CATEGORY_ALIASES: Record<string, string> = {
  "carry-on": "carry-on", carryon: "carry-on", carry: "carry-on",
  standard: "standard-checked", "standard-checked": "standard-checked", checked: "standard-checked", suitcase: "standard-checked",
  large: "large", oversized: "oversized", oversize: "oversized",
  special: "special", golf: "special", instrument: "special", equipment: "special", gear: "special", cargo: "cargo",
};

export type ManifestRow = { category: string; description?: string; guestName?: string; room?: string; notes?: string; quantity: number };

/**
 * Parses a group manifest. Header row required; recognized columns (any order, case-insensitive):
 * category | description | guest (or guest name / name) | room | notes | quantity (or qty / bags).
 */
export function parseManifest(csv: string): { rows: ManifestRow[]; errors: string[] } {
  const table = parseCsv(csv.trim());
  if (table.length < 2) return { rows: [], errors: ["The manifest needs a header row and at least one data row."] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const ci = { category: col("category", "type", "bag type"), description: col("description", "item"), guest: col("guest", "guest name", "name", "passenger"), room: col("room", "room number", "cabin"), notes: col("notes", "note"), qty: col("quantity", "qty", "bags", "pieces") };
  const rows: ManifestRow[] = [];
  const errors: string[] = [];
  table.slice(1).forEach((r, i) => {
    const get = (k: number) => (k >= 0 ? (r[k] ?? "").trim() : "");
    const rawCat = get(ci.category).toLowerCase();
    const category = CATEGORY_ALIASES[rawCat] ?? (rawCat ? null : "standard-checked");
    const qty = ci.qty >= 0 && get(ci.qty) ? Number(get(ci.qty)) : 1;
    if (!category) { errors.push(`Row ${i + 2}: unknown category "${get(ci.category)}".`); return; }
    if (!Number.isInteger(qty) || qty < 1 || qty > 200) { errors.push(`Row ${i + 2}: quantity must be a whole number from 1 to 200.`); return; }
    rows.push({ category, description: get(ci.description) || undefined, guestName: get(ci.guest) || undefined, room: get(ci.room) || undefined, notes: get(ci.notes) || undefined, quantity: qty });
  });
  if (rows.reduce((s, r) => s + r.quantity, 0) > 2000) errors.push("A single order is limited to 2,000 pieces.");
  return { rows, errors };
}

/** Appends manifest pieces to an order, continuing the piece numbering (EB-…-NN). */
export async function importManifest(orderId: string, csv: string, actor: { id: string; name: string }) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { pieces: { select: { pieceId: true } } } });
  if (!order) throw new HttpError(404, "Order not found.");
  if (order.status === "DELIVERED" || order.status === "CANCELLED") throw new HttpError(409, "Pieces can't be added to a closed order.");
  const { rows, errors } = parseManifest(csv);
  if (errors.length) throw new HttpError(400, "The manifest has problems. Nothing was imported.", errors);
  let n = order.pieces.reduce((max, p) => Math.max(max, Number(p.pieceId.split("-").pop()) || 0), 0);
  const data = rows.flatMap((r) =>
    Array.from({ length: r.quantity }, () => {
      n += 1;
      const pid = `${order.reference}-${String(n).padStart(2, "0")}`;
      const desc = [r.description, r.guestName && `Guest: ${r.guestName}`, r.room && `Room ${r.room}`, r.notes].filter(Boolean).join(" · ");
      return { orderId, pieceId: pid, barcode: pid, category: r.category, description: desc || null, status: order.status };
    }),
  );
  if (n > 2000) throw new HttpError(400, "A single order is limited to 2,000 pieces.");
  await prisma.orderPiece.createMany({ data });
  await prisma.orderEvent.create({ data: { orderId, type: "NOTE", detail: `Manifest imported: ${data.length} piece(s) added`, actorType: "user", actorId: actor.id, actorName: actor.name } });
  return { added: data.length };
}

