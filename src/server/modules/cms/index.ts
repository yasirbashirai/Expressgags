/**
 * Module "cms" — routes are filled in by the owning build agent.
 */
import { Router } from "express";
import type { PlatformModule } from "../types";

export const adminRouter = Router();
export const publicRouter = Router();

export const platformModule: PlatformModule = {
  name: "cms",
  routes: [
    { scope: "admin", path: "/cms", router: adminRouter },
    { scope: "public", path: "/content", router: publicRouter },
  ],
};
