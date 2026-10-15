/**
 * Module "quotations" — routes are filled in by the owning build agent.
 */
import { Router } from "express";
import type { PlatformModule } from "../types";

export const adminRouter = Router();
export const publicRouter = Router();

export const platformModule: PlatformModule = {
  name: "quotations",
  routes: [
    { scope: "admin", path: "/quotations", router: adminRouter },
    { scope: "public", path: "/q", router: publicRouter },
  ],
};
