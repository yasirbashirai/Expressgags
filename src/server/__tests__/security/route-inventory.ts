/**
 * Test helper: records the mount path of every nested Express router so security tests can
 * enumerate ALL registered routes (Express 5 layers don't keep the mount path as a string).
 * MUST be imported before the app/modules are loaded.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RouterProto = (require("router") as any).prototype;
if (!RouterProto.__ebPatched) {
  const orig = RouterProto.use;
  RouterProto.use = function patchedUse(this: unknown, ...args: unknown[]) {
    const path = typeof args[0] === "string" ? (args[0] as string) : "";
    for (const a of args) if (typeof a === "function" && (a as { stack?: unknown }).stack) (a as { __mount?: string }).__mount = path;
    return orig.apply(this, args);
  };
  RouterProto.__ebPatched = true;
}

export type RouteInfo = { method: string; path: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function walk(router: any, base: string, out: RouteInfo[] = []): RouteInfo[] {
  for (const layer of router.stack ?? []) {
    if (layer.route) {
      for (const m of Object.keys(layer.route.methods)) out.push({ method: m.toUpperCase(), path: (base + layer.route.path).replace(/\/+$/, "") || "/" });
    } else if (layer.handle?.stack) {
      walk(layer.handle, base + (layer.handle.__mount ?? ""), out);
    }
  }
  return out;
}

export async function allRoutes(): Promise<RouteInfo[]> {
  const { platformModules } = await import("../../modules");
  const { adminRouter } = await import("../../routes/admin");
  const { publicRouter } = await import("../../routes/public");
  const out: RouteInfo[] = [];
  walk(publicRouter, "/v1", out);
  walk(adminRouter, "/v1/admin", out);
  for (const m of platformModules) for (const r of m.routes) walk(r.router, (r.scope === "admin" ? "/v1/admin" : "/v1") + r.path, out);
  return out;
}

/** Replace :params with harmless placeholder values. */
export const concrete = (p: string) => p.replace(/:[A-Za-z]+/g, "zz0000000000000000000000zz");
