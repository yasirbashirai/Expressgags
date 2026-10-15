/**
 * Module "notifications" — routes are filled in by the owning build agent.
 */
import { Router } from "express";
import type { PlatformModule } from "../types";

export const adminRouter = Router();
export const publicRouter = Router();

export const platformModule: PlatformModule = {
  name: "notifications",
  routes: [
    { scope: "admin", path: "/notifications", router: adminRouter },
    { scope: "public", path: "/survey", router: publicRouter },
  ],
};
