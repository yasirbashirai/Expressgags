/**
 * Module "assistant" — routes are filled in by the owning build agent.
 */
import { Router } from "express";
import type { PlatformModule } from "../types";

export const adminRouter = Router();
export const publicRouter = Router();

export const platformModule: PlatformModule = {
  name: "assistant",
  routes: [
    { scope: "admin", path: "/assistant", router: adminRouter },
    { scope: "public", path: "/assistant", router: publicRouter },
  ],
};
