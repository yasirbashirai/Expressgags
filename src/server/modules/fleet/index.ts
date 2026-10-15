/**
 * Module "fleet" — routes are filled in by the owning build agent.
 */
import { Router } from "express";
import type { PlatformModule } from "../types";

export const adminRouter = Router();

export const platformModule: PlatformModule = {
  name: "fleet",
  routes: [
    { scope: "admin", path: "/fleet", router: adminRouter },
  ],
};
