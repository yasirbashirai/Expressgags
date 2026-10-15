/**
 * Module "team" — routes are filled in by the owning build agent.
 */
import { Router } from "express";
import type { PlatformModule } from "../types";

export const adminRouter = Router();

export const platformModule: PlatformModule = {
  name: "team",
  routes: [
    { scope: "admin", path: "/team", router: adminRouter },
  ],
};
