/**
 * Module "billing" — routes are filled in by the owning build agent.
 */
import { Router } from "express";
import type { PlatformModule } from "../types";

export const adminRouter = Router();
export const publicRouter = Router();
export const webhookRouter = Router();

export const platformModule: PlatformModule = {
  name: "billing",
  routes: [
    { scope: "admin", path: "/billing", router: adminRouter },
    { scope: "public", path: "/pay", router: publicRouter },
    { scope: "webhook", path: "/webhooks/stripe", router: webhookRouter },
  ],
};
