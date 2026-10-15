/**
 * Portal access guard: valid customer session (auth-customer.ts) + an ACTIVE, email-verified account.
 * Every data endpoint uses requirePortal; scoping helpers keep each customer (or company) to its own records.
 */
import type { NextFunction, Request, Response } from "express";
import { requireCustomer, type AuthCustomer } from "../../auth-customer";
import { prisma } from "../../db";
import { HttpError } from "../../lib/errors";

export async function requirePortal(req: Request, res: Response, next: NextFunction) {
  await requireCustomer(req, res, async (err?: unknown) => {
    if (err) return next(err);
    try {
      const access = await prisma.customerAccess.findUnique({ where: { customerId: req.customer!.id } });
      if (access?.status === "DEACTIVATED") throw new HttpError(401, "This account has been deactivated. Please contact your company administrator.");
      next();
    } catch (e) {
      next(e);
    }
  });
}

/** Role guard for company features. */
export const requireAccountRole =
  (...roles: string[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.customer) return next(new HttpError(401, "Please sign in."));
    if (!roles.includes(req.customer.accountRole)) return next(new HttpError(403, "Your account role does not allow this action."));
    next();
  };

/** True when the customer may see every record of their company (company admins, hotel concierge desks). */
export const seesCompany = (c: AuthCustomer) => !!c.companyId && (c.accountRole === "COMPANY_ADMIN" || c.accountRole === "CONCIERGE");

/** Where-clause for models that carry customerId + companyId (Order, Invoice, QuoteRequest). */
export const ownedWhere = (c: AuthCustomer) => (seesCompany(c) ? { companyId: c.companyId! } : { customerId: c.id });

/** Where-clause for Quotation (customerId only): company scope goes through the customer's company. */
export const quotationWhere = (c: AuthCustomer) => (seesCompany(c) ? { customer: { companyId: c.companyId! } } : { customerId: c.id });

/** Audit helper for customer-initiated changes (AuditLog.userId stays null; detail.customerId identifies the actor). */
export function auditCustomer(c: AuthCustomer | { id: string }, action: string, entity: string, entityId?: string, detail: object = {}) {
  return prisma.auditLog.create({ data: { action, entity, entityId, detail: { ...detail, customerId: c.id, actor: "customer" } } });
}
