/**
 * Module "carriers" — routes are filled in by the owning build agent.
 */
import { Router } from "express";
import type { PlatformModule } from "../types";

export const adminRouter = Router();
export const webhookRouter = Router();

export const platformModule: PlatformModule = {
  name: "carriers",
  routes: [
    { scope: "admin", path: "/carriers", router: adminRouter },
    { scope: "webhook", path: "/webhooks/carriers", router: webhookRouter },
  ],
};
