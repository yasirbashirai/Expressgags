/**
 * Module "driver" — routes are filled in by the owning build agent.
 */
import { Router } from "express";
import type { PlatformModule } from "../types";

export const publicRouter = Router();

export const platformModule: PlatformModule = {
  name: "driver",
  routes: [
    { scope: "public", path: "/driver", router: publicRouter },
  ],
};
