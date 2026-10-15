/**
 * Module "orders" — routes are filled in by the owning build agent.
 */
import { Router } from "express";
import type { PlatformModule } from "../types";

export const adminRouter = Router();

export const platformModule: PlatformModule = {
  name: "orders",
  routes: [
    { scope: "admin", path: "/orders", router: adminRouter },
  ],
};
