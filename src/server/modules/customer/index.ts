/**
 * Module "customer" — routes are filled in by the owning build agent.
 */
import { Router } from "express";
import type { PlatformModule } from "../types";

export const publicRouter = Router();

export const platformModule: PlatformModule = {
  name: "customer",
  routes: [
    { scope: "public", path: "/account", router: publicRouter },
  ],
};
