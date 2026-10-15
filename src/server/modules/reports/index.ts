/**
 * Module "reports" — routes are filled in by the owning build agent.
 */
import { Router } from "express";
import type { PlatformModule } from "../types";

export const adminRouter = Router();

export const platformModule: PlatformModule = {
  name: "reports",
  routes: [
    { scope: "admin", path: "/reports", router: adminRouter },
  ],
};
