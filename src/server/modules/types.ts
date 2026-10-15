import type { Router } from "express";

/**
 * A platform module mounts one or more routers under /v1.
 * scope:
 *  - "public"  : unauthenticated website/customer-facing endpoints (apply rate limits yourself)
 *  - "admin"   : staff endpoints — mounted under /v1/admin/<path>; apply requireAuth/requireRole yourself
 *  - "webhook" : provider webhooks — mounted BEFORE express.json so handlers can read the raw body (use express.raw)
 */
export type ModuleRoute = { scope: "public" | "admin" | "webhook"; path: string; router: Router };
export type PlatformModule = { name: string; routes: ModuleRoute[] };
