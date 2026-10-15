/**
 * Module "storage" — routes are filled in by the owning build agent.
 */
import { Router } from "express";
import type { PlatformModule } from "../types";

export const adminRouter = Router();

export const platformModule: PlatformModule = {
  name: "storage",
  routes: [
    { scope: "admin", path: "/storage", router: adminRouter },
  ],
};
