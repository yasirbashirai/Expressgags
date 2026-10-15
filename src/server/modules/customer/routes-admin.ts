/**
 * Admin: customers & business accounts (/v1/admin/customers/*).
 * Read: OWNER, STAFF, ACCOUNTING. Write: OWNER, STAFF (commercial terms also ACCOUNTING).
 * Impersonating customers is intentionally NOT possible.
 */
import { Router } from "express";
import { z } from "zod";
import { audit, requireAuth, requireRole } from "../../auth";
import { prisma } from "../../db";
import type { Prisma } from "../../generated/prisma/client";
import { brandedHtml, sendMail } from "../../lib/email";
import { asyncHandler, HttpError } from "../../lib/errors";
import { STATUS_LABEL } from "../../services/orders";
import { issueToken, siteUrl } from "./tokens";

export const customersAdminRouter = Router();
customersAdminRouter.use(requireAuth);

const ACCOUNT_TYPES = ["hotel", "resort", "dmc", "cruise", "corporate", "sports", "entertainment", "event", "university", "commercial"] as const;

/* --------------------------------- Lists --------------------------------- */
customersAdminRouter.get(
  "/",
  requireRole("STAFF", "ACCOUNTING"),
  asyncHandler(async (req, res) => {
    const q = z.object({ search: z.string().trim().max(120).optional(), hasAccount: z.enum(["yes", "no", "all"]).default("all"), page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    const where: Prisma.CustomerWhereInput = {
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: "insensitive" } }, { email: { contains: q.search, mode: "insensitive" } }, { phone: { contains: q.search } }, { company: { name: { contains: q.search, mode: "insensitive" } } }] } : {}),
      ...(q.hasAccount === "yes" ? { passwordHash: { not: null } } : q.hasAccount === "no" ? { passwordHash: null } : {}),
    };
    const take = 50;
    const [total, rows] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip: (q.page - 1) * take,
        select: { id: true, name: true, email: true, phone: true, accountRole: true, passwordHash: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true, company: { select: { id: true, name: true, accountStatus: true } }, _count: { select: { quotes: true, orders: true } } },
      }),
    ]);
    res.json({ ok: true, total, page: q.page, pages: Math.max(1, Math.ceil(total / take)), customers: rows.map(({ passwordHash, ...c }) => ({ ...c, hasPortalAccount: !!passwordHash })) });
  }),
);

customersAdminRouter.get(
  "/companies",
  requireRole("STAFF", "ACCOUNTING"),
  asyncHandler(async (req, res) => {
    const q = z.object({ search: z.string().trim().max(120).optional(), status: z.enum(["PROSPECT", "PENDING", "ACTIVE", "ON_HOLD", "all"]).default("all") }).parse(req.query);
    const rows = await prisma.company.findMany({
      where: { ...(q.search ? { name: { contains: q.search, mode: "insensitive" } } : {}), ...(q.status !== "all" ? { accountStatus: q.status } : {}) },
      orderBy: [{ accountStatus: "asc" }, { name: "asc" }],
      take: 200,
      select: { id: true, name: true, domain: true, accountType: true, accountStatus: true, paymentTermsDays: true, poRequired: true, market: true, createdAt: true, _count: { select: { customers: true, orders: true, quotes: true, invoices: true } } },
    });
    const pending = await prisma.company.count({ where: { accountStatus: "PENDING" } });
    res.json({ ok: true, companies: rows, pendingApplications: pending });
  }),
);

/* -------------------------------- Details -------------------------------- */
customersAdminRouter.get(
  "/companies/:id",
  requireRole("STAFF", "ACCOUNTING"),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params.id as string } });
    if (!company) throw new HttpError(404, "Company not found.");
    const [users, orders, quotes, invoices, openBalance] = await Promise.all([
      prisma.customer.findMany({ where: { companyId: company.id }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, accountRole: true, lastLoginAt: true, passwordHash: true } }),
      prisma.order.findMany({ where: { companyId: company.id }, orderBy: { serviceDate: "desc" }, take: 20, select: { id: true, reference: true, status: true, serviceType: true, serviceDate: true, retailCents: true } }),
      prisma.quoteRequest.findMany({ where: { companyId: company.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, reference: true, status: true, serviceType: true, createdAt: true } }),
      prisma.invoice.findMany({ where: { companyId: company.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, number: true, status: true, totalCents: true, paidCents: true, dueAt: true } }),
      prisma.invoice.aggregate({ where: { companyId: company.id, status: { in: ["SENT", "PARTIAL", "OVERDUE"] } }, _sum: { totalCents: true, paidCents: true } }),
    ]);
    const access = await prisma.customerAccess.findMany({ where: { customerId: { in: users.map((u) => u.id) } } });
    res.json({
      ok: true,
      company,
      users: users.map(({ passwordHash, ...u }) => ({ ...u, status: access.find((a) => a.customerId === u.id)?.status === "DEACTIVATED" ? "DEACTIVATED" : passwordHash ? "ACTIVE" : "INVITED" })),
      orders: orders.map((o) => ({ ...o, statusLabel: STATUS_LABEL[o.status] })),
      quotes,
      invoices,
      openBalanceCents: (openBalance._sum.totalCents ?? 0) - (openBalance._sum.paidCents ?? 0),
    });
  }),
);

customersAdminRouter.get(
  "/:id",
  requireRole("STAFF", "ACCOUNTING"),
  asyncHandler(async (req, res) => {
    const c = await prisma.customer.findUnique({
      where: { id: req.params.id as string },
      select: { id: true, name: true, email: true, phone: true, preferredContact: true, accountRole: true, language: true, marketingOptIn: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true, passwordHash: true, defaultCostCenter: true, company: { select: { id: true, name: true, accountStatus: true } } },
    });
    if (!c) throw new HttpError(404, "Customer not found.");
    const [quotes, orders, quotations, invoices, access, addresses] = await Promise.all([
      prisma.quoteRequest.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, reference: true, status: true, serviceType: true, serviceDate: true, createdAt: true } }),
      prisma.order.findMany({ where: { customerId: c.id }, orderBy: { serviceDate: "desc" }, take: 25, select: { id: true, reference: true, status: true, serviceType: true, serviceDate: true, retailCents: true } }),
      prisma.quotation.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, reference: true, status: true, totalCents: true, createdAt: true } }),
      prisma.invoice.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, number: true, status: true, totalCents: true, paidCents: true, dueAt: true } }),
      prisma.customerAccess.findUnique({ where: { customerId: c.id } }),
      prisma.savedAddress.count({ where: { customerId: c.id } }),
    ]);
    const { passwordHash, ...customer } = c;
    res.json({
      ok: true,
      customer: { ...customer, portalStatus: access?.status === "DEACTIVATED" ? "DEACTIVATED" : passwordHash ? "ACTIVE" : access?.status === "PENDING" ? "PENDING_VERIFICATION" : "NO_ACCOUNT", savedAddresses: addresses },
      quotes,
      orders: orders.map((o) => ({ ...o, statusLabel: STATUS_LABEL[o.status] })),
      quotations,
      invoices,
    });
  }),
);

/* --------------------------------- Writes -------------------------------- */
/** Negotiated pricing overrides: plain JSON object, limited size; applied by the pricing engines. */
const negotiatedRulesSchema = z
  .record(z.string(), z.unknown())
  .refine((v) => JSON.stringify(v).length <= 20000, "Negotiated rules are too large")
  .nullable();

customersAdminRouter.patch(
  "/companies/:id",
  requireRole("STAFF", "ACCOUNTING"),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const body = z
      .object({
        name: z.string().trim().min(2).max(200).optional(),
        accountType: z.enum(ACCOUNT_TYPES).nullable().optional(),
        accountStatus: z.enum(["PROSPECT", "PENDING", "ACTIVE", "ON_HOLD"]).optional(),
        billingEmail: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
        paymentTermsDays: z.coerce.number().int().min(0).max(120).optional(),
        poRequired: z.boolean().optional(),
        creditLimitCents: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
        negotiatedRules: negotiatedRulesSchema.optional(),
        taxId: z.string().trim().max(40).nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
        market: z.string().max(60).nullable().optional(),
      })
      .parse(req.body);
    const before = await prisma.company.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, "Company not found.");
    const data: Prisma.CompanyUpdateInput = {
      ...body,
      billingEmail: body.billingEmail === "" ? null : body.billingEmail,
      negotiatedRules: body.negotiatedRules === undefined ? undefined : body.negotiatedRules === null ? (null as unknown as Prisma.InputJsonValue) : (body.negotiatedRules as Prisma.InputJsonValue),
    };
    const company = await prisma.company.update({ where: { id }, data });
    await audit(req, "update", "company", id, { fields: Object.keys(body), statusFrom: before.accountStatus, statusTo: company.accountStatus });
    res.json({ ok: true, company });
  }),
);

/** Approve a business account application: activates the company and makes the applicant its administrator. */
customersAdminRouter.post(
  "/companies/:id/approve",
  requireRole("STAFF"),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const { adminCustomerId, paymentTermsDays } = z.object({ adminCustomerId: z.string().optional(), paymentTermsDays: z.coerce.number().int().min(0).max(120).optional() }).parse(req.body ?? {});
    const company = await prisma.company.findUnique({ where: { id }, include: { customers: true } });
    if (!company) throw new HttpError(404, "Company not found.");
    const admin = adminCustomerId ? company.customers.find((c) => c.id === adminCustomerId) : company.customers.find((c) => c.passwordHash) ?? company.customers[0];
    if (!admin) throw new HttpError(400, "This company has no linked customer to make administrator.");
    await prisma.company.update({ where: { id }, data: { accountStatus: "ACTIVE", ...(paymentTermsDays !== undefined ? { paymentTermsDays } : {}) } });
    await prisma.customer.update({ where: { id: admin.id }, data: { accountRole: "COMPANY_ADMIN" } });
    await sendMail({
      to: admin.email,
      subject: `Your ${company.name} business account is active | Express Bags`,
      text: `Good news: your ${company.name} business account at Express Bags is active. Sign in at ${siteUrl()}/account to invite colleagues, set PO requirements and manage bookings.`,
      html: brandedHtml("Your business account is active", [`Good news: the ${company.name} business account at Express Bags is active.`, "You can now invite colleagues, set PO requirements, save company locations and manage bookings.", `${siteUrl()}/account`]),
    });
    await audit(req, "approve", "company", id, { adminCustomerId: admin.id });
    res.json({ ok: true });
  }),
);

/** Staff can send an invite/set-password link (e.g. for an existing client who has never signed in). Never a login-as. */
customersAdminRouter.post(
  "/:id/invite",
  requireRole("STAFF"),
  asyncHandler(async (req, res) => {
    const c = await prisma.customer.findUnique({ where: { id: req.params.id as string } });
    if (!c) throw new HttpError(404, "Customer not found.");
    if (c.passwordHash) throw new HttpError(409, "This customer already has an active portal account. They can use “Forgot password” if needed.");
    await prisma.customerAccess.upsert({ where: { customerId: c.id }, update: { status: "PENDING" }, create: { customerId: c.id, status: "PENDING" } });
    const token = await issueToken("invite", c.id);
    const link = `${siteUrl()}/account/setup?token=${encodeURIComponent(token)}`;
    await sendMail({
      to: c.email,
      subject: "Your Express Bags client portal",
      text: `Set your password to access your Express Bags client portal (link valid 7 days): ${link}`,
      html: brandedHtml("Your client portal", ["Your Express Bags client portal is ready: quotes, bookings, tracking, proof of delivery and invoices in one place.", "Set your password to get started (link valid for 7 days):", link]),
    });
    await audit(req, "invite", "customer", c.id);
    res.json({ ok: true });
  }),
);

customersAdminRouter.patch(
  "/:id",
  requireRole("STAFF"),
  asyncHandler(async (req, res) => {
    const id = req.params.id as string;
    const body = z
      .object({
        companyId: z.string().nullable().optional(),
        accountRole: z.enum(["INDIVIDUAL", "COMPANY_ADMIN", "COMPANY_USER", "CONCIERGE"]).optional(),
        portalActive: z.boolean().optional(),
      })
      .parse(req.body);
    const c = await prisma.customer.findUnique({ where: { id } });
    if (!c) throw new HttpError(404, "Customer not found.");
    if (body.companyId) {
      const company = await prisma.company.findUnique({ where: { id: body.companyId } });
      if (!company) throw new HttpError(400, "Company not found.");
    }
    await prisma.customer.update({ where: { id }, data: { companyId: body.companyId === undefined ? undefined : body.companyId, accountRole: body.companyId === null ? "INDIVIDUAL" : body.accountRole } });
    if (body.portalActive !== undefined) {
      await prisma.customerAccess.upsert({
        where: { customerId: id },
        update: body.portalActive ? { status: c.passwordHash ? "ACTIVE" : "PENDING", deactivatedAt: null, deactivatedBy: null } : { status: "DEACTIVATED", deactivatedAt: new Date(), deactivatedBy: `staff:${req.user!.id}` },
        create: { customerId: id, status: body.portalActive ? "ACTIVE" : "DEACTIVATED" },
      });
    }
    await audit(req, "update", "customer", id, body);
    res.json({ ok: true });
  }),
);
