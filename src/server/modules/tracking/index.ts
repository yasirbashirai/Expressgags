/**
 * Module "tracking" — routes are filled in by the owning build agent.
 */
import { Router } from "express";
import type { PlatformModule } from "../types";

export const publicRouter = Router();

export const platformModule: PlatformModule = {
  name: "tracking",
  routes: [
    { scope: "public", path: "/track", router: publicRouter },
  ],
};
