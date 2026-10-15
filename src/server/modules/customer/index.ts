/**
 * Module "customer": customer / business / concierge portal + admin customer & account management.
 *   /v1/account/auth/*        register, verify, login, logout, forgot/reset, invite acceptance, change password
 *   /v1/account/company/*     company profile + authorized users (COMPANY_ADMIN)
 *   /v1/account/concierge/*   hotel bell-desk guest requests (CONCIERGE / COMPANY_ADMIN of hotel, resort, DMC)
 *   /v1/account/*             me, dashboard, orders, quotes, invoices, receipts, addresses, documents, business application
 *   /v1/admin/customers/*     staff: customers, companies, approvals, account terms (no impersonation)
 */
import { Router } from "express";
import type { PlatformModule } from "../types";
import { accountRouter } from "./routes-account";
import { customersAdminRouter } from "./routes-admin";
import { authRouter } from "./routes-auth";
import { companyRouter } from "./routes-company";

export const publicRouter = Router();
publicRouter.use("/auth", authRouter);
publicRouter.use(companyRouter);
publicRouter.use(accountRouter);

export const platformModule: PlatformModule = {
  name: "customer",
  routes: [
    { scope: "public", path: "/account", router: publicRouter },
    { scope: "admin", path: "/customers", router: customersAdminRouter },
  ],
};
