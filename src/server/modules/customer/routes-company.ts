/**
 * Company accounts (/v1/account/company/*) and the hotel concierge desk (/v1/account/concierge/*).
 * COMPANY_ADMIN: company profile + authorized users. CONCIERGE (and COMPANY_ADMIN of a hotel/resort):
 * fast guest luggage requests that become quote requests linked to the company.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { quoteRequestSchema, LUGGAGE_CATEGORIES, MARKET_OPTIONS, TIME_WINDOWS } from "@/lib/quote-schema";
import { airports, ports } from "@/content/site";
import { prisma } from "../../db";
import { brandedHtml, sendMail } from "../../lib/email";
import { asyncHandler, HttpError } from "../../lib/errors";
import { createQuote } from "../../services/quotes";
import { STATUS_LABEL } from "../../services/orders";
import { auditCustomer, requireAccountRole, requirePortal } from "./access";
import { issueToken, siteUrl } from "./tokens";

export const companyRouter = Router();
companyRouter.use(requirePortal);

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.PUBLIC_RATE_LIMIT || 60), standardHeaders: "draft-8", legacyHeaders: false, message: { ok: false, error: "Too many requests. Please wait a few minutes." } });

const requireCompany = (req: import("express").Request) => {
  if (!req.customer?.companyId) throw new HttpError(403, "Your profile is not linked to a business account.");
  return req.customer.companyId;
};

/* ----------------------------- Company profile --------------------------- */
companyRouter.get(
  "/company",
  requireAccountRole("COMPANY_ADMIN", "COMPANY_USER", "CONCIERGE"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { id: true, name: true, accountType: true, accountStatus: true, billingEmail: true, poRequired: true, paymentTermsDays: true, market: true },
    });
    res.json({ ok: true, company });
  }),
);

companyRouter.patch(
  "/company",
  limiter,
  requireAccountRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    // Admin-only commercial fields (terms, credit, negotiated pricing, status) are NOT editable here.
    const body = z
      .object({
        billingEmail: z.string().trim().email().max(200).optional(),
        poRequired: z.boolean().optional(),
        defaultCostCenter: z.string().trim().max(80).optional().or(z.literal("")),
      })
      .parse(req.body);
    const { defaultCostCenter, ...companyData } = body;
    await prisma.company.update({ where: { id: companyId }, data: companyData });
    if (defaultCostCenter !== undefined) await prisma.customer.updateMany({ where: { companyId, defaultCostCenter: null }, data: { defaultCostCenter: defaultCostCenter || null } });
    await auditCustomer(req.customer!, "update", "company", companyId, { fields: Object.keys(body) });
    res.json({ ok: true });
  }),
);

/* ----------------------------- Authorized users -------------------------- */
companyRouter.get(
  "/company/users",
  requireAccountRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const users = await prisma.customer.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, accountRole: true, lastLoginAt: true, passwordHash: true } });
    const access = await prisma.customerAccess.findMany({ where: { customerId: { in: users.map((u) => u.id) } } });
    res.json({
      ok: true,
      users: users.map(({ passwordHash, ...u }) => {
        const a = access.find((x) => x.customerId === u.id);
        return { ...u, status: a?.status === "DEACTIVATED" ? "DEACTIVATED" : passwordHash ? "ACTIVE" : "INVITED", isYou: u.id === req.customer!.id };
      }),
    });
  }),
);

companyRouter.post(
  "/company/users",
  limiter,
  requireAccountRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const body = z
      .object({ name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().max(200), role: z.enum(["COMPANY_USER", "CONCIERGE", "COMPANY_ADMIN"]) })
      .parse(req.body);
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    if (company.accountStatus !== "ACTIVE") throw new HttpError(409, "Users can be invited once your business account is active.");
    if ((await prisma.customer.count({ where: { companyId } })) >= 100) throw new HttpError(400, "Your account has reached the user limit. Please contact our office.");
    const existing = await prisma.customer.findUnique({ where: { email: body.email } });
    if (existing?.companyId && existing.companyId !== companyId) throw new HttpError(409, "This person is linked to another business account. Please contact our office.");
    if (existing?.passwordHash && existing.companyId !== companyId) throw new HttpError(409, "This person already has an Express Bags account. Ask them to contact our office to join your company account.");
    const invitee = existing
      ? await prisma.customer.update({ where: { id: existing.id }, data: { companyId, accountRole: body.role } })
      : await prisma.customer.create({ data: { name: body.name, email: body.email, companyId, accountRole: body.role } });
    await prisma.customerAccess.upsert({
      where: { customerId: invitee.id },
      update: { status: invitee.passwordHash ? "ACTIVE" : "PENDING", invitedByCustomerId: req.customer!.id, deactivatedAt: null },
      create: { customerId: invitee.id, status: "PENDING", invitedByCustomerId: req.customer!.id },
    });
    if (!invitee.passwordHash) {
      const token = await issueToken("invite", invitee.id);
      const link = `${siteUrl()}/account/setup?token=${encodeURIComponent(token)}`;
      await sendMail({
        to: invitee.email,
        subject: `You're invited to the ${company.name} account at Express Bags`,
        text: `${req.customer!.name} invited you to the ${company.name} business account at Express Bags.\nSet your password (link valid 7 days): ${link}`,
        html: brandedHtml("You're invited", [`${req.customer!.name} invited you to the ${company.name} business account at Express Bags.`, "Set your password to get started (link valid for 7 days):", link]),
      });
    }
    await auditCustomer(req.customer!, "invite", "customer", invitee.id, { role: body.role, companyId });
    res.status(201).json({ ok: true });
  }),
);

companyRouter.patch(
  "/company/users/:id",
  limiter,
  requireAccountRole("COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const id = req.params.id as string;
    const body = z.object({ role: z.enum(["COMPANY_USER", "CONCIERGE", "COMPANY_ADMIN"]).optional(), active: z.boolean().optional() }).parse(req.body);
    const target = await prisma.customer.findFirst({ where: { id, companyId } });
    if (!target) throw new HttpError(404, "User not found.");
    if (target.id === req.customer!.id && (body.active === false || (body.role && body.role !== "COMPANY_ADMIN"))) {
      throw new HttpError(400, "You cannot deactivate yourself or remove your own administrator role.");
    }
    if (body.role) await prisma.customer.update({ where: { id }, data: { accountRole: body.role } });
    if (body.active !== undefined) {
      await prisma.customerAccess.upsert({
        where: { customerId: id },
        update: body.active ? { status: target.passwordHash ? "ACTIVE" : "PENDING", deactivatedAt: null, deactivatedBy: null } : { status: "DEACTIVATED", deactivatedAt: new Date(), deactivatedBy: req.customer!.id },
        create: { customerId: id, status: body.active ? "ACTIVE" : "DEACTIVATED", deactivatedAt: body.active ? null : new Date(), deactivatedBy: body.active ? null : req.customer!.id },
      });
    }
    await auditCustomer(req.customer!, "update", "company-user", id, body);
    res.json({ ok: true });
  }),
);

/* --------------------------------- Concierge ----------------------------- */
const facilityChoice = z.string().max(80).optional().or(z.literal(""));
const conciergeSchema = z.object({
  guestName: z.string().trim().min(2, "Guest name").max(120),
  guestRoom: z.string().trim().max(20).optional().or(z.literal("")),
  guestPhone: z.string().trim().max(40).optional().or(z.literal("")),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  pickupTime: z.string().regex(/^\d{2}:\d{2}$/, "Choose a time").optional().or(z.literal("")),
  timeWindow: z.enum(TIME_WINDOWS),
  hotelAddressId: z.string().max(40).optional().or(z.literal("")),
  hotelAddress: z.string().trim().max(300).optional().or(z.literal("")),
  hotelMarket: z.enum(MARKET_OPTIONS).optional(),
  destinationType: z.enum(["airport", "cruise-port", "hotel", "residence", "other"]),
  destinationFacility: facilityChoice,
  destinationAddress: z.string().trim().max(300).optional().or(z.literal("")),
  destinationMarket: z.enum(MARKET_OPTIONS).optional(),
  flightOrShip: z.string().trim().max(200).optional().or(z.literal("")),
  pieces: z.array(z.object({ category: z.enum(LUGGAGE_CATEGORIES), quantity: z.coerce.number().int().min(1).max(200) })).min(1, "Add at least one bag"),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  poNumber: z.string().trim().max(60).optional().or(z.literal("")),
  acceptsProhibitedItemsPolicy: z.literal(true, { message: "Confirm the prohibited-items policy" }),
});

companyRouter.post(
  "/concierge/requests",
  limiter,
  requireAccountRole("CONCIERGE", "COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    if (!["hotel", "resort", "dmc"].includes(company.accountType ?? "") || company.accountStatus !== "ACTIVE") {
      throw new HttpError(403, "The concierge desk is available to active hotel, resort and DMC accounts.");
    }
    const b = conciergeSchema.parse(req.body);
    if (company.poRequired && !b.poNumber) throw new HttpError(400, "Your company requires a PO number on every request.", [{ path: "poNumber", message: "PO number required" }]);
    const me = await prisma.customer.findUniqueOrThrow({ where: { id: req.customer!.id } });

    // Pickup = the hotel (a shared company location, or a typed address)
    const saved = b.hotelAddressId ? await prisma.savedAddress.findFirst({ where: { id: b.hotelAddressId, companyId } }) : null;
    const pickupAddress = saved?.address || b.hotelAddress;
    const pickupMarket = (saved?.market as (typeof MARKET_OPTIONS)[number] | undefined) || b.hotelMarket;
    if (!pickupAddress || !pickupMarket) throw new HttpError(400, "Choose the hotel pickup location.", [{ path: "hotelAddress", message: "Pickup location required" }]);

    let destAddress = b.destinationAddress || "";
    let destMarket: string | undefined = b.destinationMarket;
    if (b.destinationType === "airport" && b.destinationFacility) {
      const a = airports.find((x) => x.code === b.destinationFacility);
      if (!a) throw new HttpError(400, "Unknown airport.");
      destAddress = destAddress || `${a.name} (${a.code})`;
      destMarket = destMarket || a.market;
    }
    if (b.destinationType === "cruise-port" && b.destinationFacility) {
      const p = ports.find((x) => x.slug === b.destinationFacility);
      if (!p) throw new HttpError(400, "Unknown cruise port.");
      destAddress = destAddress || p.name;
      destMarket = destMarket || p.market;
    }
    if (!destAddress || !destMarket) throw new HttpError(400, "Choose the destination.", [{ path: "destinationAddress", message: "Destination required" }]);

    const serviceType = b.destinationType === "airport" ? "airport" : b.destinationType === "cruise-port" ? "cruise" : "luggage-local";
    const guestLine = `Guest: ${b.guestName}${b.guestRoom ? `, room ${b.guestRoom}` : ""}${b.pickupTime ? `, pickup at ${b.pickupTime}` : ""}`;
    const input = quoteRequestSchema.parse({
      serviceType,
      pickup: { type: "hotel", address: pickupAddress, market: pickupMarket, notes: saved?.notes || "" },
      delivery: { type: b.destinationType, address: destAddress, facility: b.destinationFacility || "", market: destMarket },
      serviceDate: b.pickupDate,
      timeWindow: b.timeWindow,
      items: b.pieces,
      flightDetails: serviceType === "airport" ? b.flightOrShip : "",
      shipName: serviceType === "cruise" ? b.flightOrShip : "",
      contact: { name: me.name, email: me.email, phone: me.phone || b.guestPhone || "Not provided", company: company.name, preferredContact: "email" },
      onsiteContact: `${guestLine}${b.guestPhone ? ` · guest phone ${b.guestPhone}` : ""}`,
      billingType: "hotel-or-dmc",
      leadSource: "hotel-concierge",
      notes: [guestLine, b.notes].filter(Boolean).join("\n"),
      acceptsProhibitedItemsPolicy: true,
      consentToContact: true,
    });
    const result = await createQuote(input, { ip: req.ip, userAgent: req.get("user-agent") }, {
      customerId: me.id,
      companyId,
      actor: "concierge",
      extraPayload: { concierge: { guestName: b.guestName, guestRoom: b.guestRoom || null, pickupTime: b.pickupTime || null, bookedBy: me.name }, poNumber: b.poNumber || undefined },
    });
    await auditCustomer(me, "concierge-request", "quote-request", result.reference, { companyId });
    res.status(201).json({ ok: true, ...result });
  }),
);

/** Guest requests for a day (default today) with live status (request + linked order). */
companyRouter.get(
  "/concierge/requests",
  requireAccountRole("CONCIERGE", "COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.query);
    const day = date ?? new Date().toISOString().slice(0, 10);
    const rows = await prisma.quoteRequest.findMany({
      where: { companyId, leadSource: "hotel-concierge", OR: [{ serviceDate: day }, { createdAt: { gte: new Date(`${day}T00:00:00`), lt: new Date(new Date(`${day}T00:00:00`).getTime() + 86400000) } }] },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, reference: true, status: true, serviceType: true, serviceDate: true, totalPieces: true, payload: true, createdAt: true, order: { select: { id: true, reference: true, status: true } } },
    });
    res.json({
      ok: true,
      date: day,
      requests: rows.map(({ payload, order, ...r }) => {
        const p = payload as { concierge?: { guestName?: string; guestRoom?: string; pickupTime?: string; bookedBy?: string }; delivery?: { address?: string }; timeWindow?: string };
        return { ...r, guest: p.concierge ?? null, destination: p.delivery?.address ?? "", timeWindow: p.timeWindow, order: order ? { ...order, statusLabel: STATUS_LABEL[order.status] } : null };
      }),
    });
  }),
);

/** Printable request slip. */
companyRouter.get(
  "/concierge/requests/:id",
  requireAccountRole("CONCIERGE", "COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const q = await prisma.quoteRequest.findFirst({
      where: { id: req.params.id as string, companyId, leadSource: "hotel-concierge" },
      select: { id: true, reference: true, status: true, serviceType: true, serviceDate: true, totalPieces: true, payload: true, createdAt: true, company: { select: { name: true } } },
    });
    if (!q) throw new HttpError(404, "Request not found.");
    const p = q.payload as Record<string, unknown>;
    res.json({ ok: true, request: { ...q, payload: { pickup: p.pickup, delivery: p.delivery, items: p.items, timeWindow: p.timeWindow, flightDetails: p.flightDetails, shipName: p.shipName, notes: p.notes, concierge: p.concierge, poNumber: p.poNumber } } });
  }),
);
