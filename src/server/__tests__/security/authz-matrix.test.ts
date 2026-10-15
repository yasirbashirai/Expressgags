/**
 * Authorization matrix: walks EVERY registered route (all modules) and checks
 *  - no admin, driver or portal data route is reachable without a session (401)
 *  - DRIVER sessions are refused on every /v1/admin route except /auth
 *  - key role separations (accounting can't dispatch, dispatchers can't touch money, only owners manage users)
 * New routes are covered automatically; anything intentionally public must be listed in PUBLIC_OK.
 */
import "./route-inventory"; // must load before the app (records nested router mount paths)
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allRoutes, concrete, type RouteInfo } from "./route-inventory";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any;
let routes: RouteInfo[] = [];
const cookies: Record<string, string> = {};
const ORIGIN = "http://localhost:3000";

/** Routes that are deliberately reachable without a session (public website, token links, auth entry points, webhooks). */
const PUBLIC_OK = [
  /^\/v1\/(health|ready|public-config|quotes|uploads|careers|contact)$/,
  /^\/v1\/admin\/auth\/(login|logout|forgot|token|reset)$/,
  /^\/v1\/account\/auth\/(register|resend-verification|verify|verify\/:token|login|logout|forgot|reset|invite|invite\/:token)$/,
  /^\/v1\/track$/,
  /^\/v1\/q\/:token(\/.*)?$/,
  /^\/v1\/pay\//,
  /^\/v1\/shipping\/(quote|book)$/,
  /^\/v1\/storage\/availability$/,
  /^\/v1\/protection\/plans$/,
  /^\/v1\/survey\/:token(\/.*)?$/,
  /^\/v1\/attribution$/,
  /^\/v1\/marketing\//,
  /^\/v1\/content\//,
  /^\/v1\/assistant\/(config|chat|handoff|search|draft\/:token)$/,
  /^\/v1\/webhooks\//,
];

const call = (r: RouteInfo, cookie?: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (request(app) as any)[r.method.toLowerCase()](concrete(r.path)).set("Origin", ORIGIN);
  if (cookie) t.set("Cookie", cookie);
  return ["POST", "PUT", "PATCH"].includes(r.method) ? t.send({}) : t;
};

/** Routes whose side effects we don't want to trigger with an empty body during the sweep. */
const SIDE_EFFECT = /(sign-out|signout|logout|revoke|jobs\/daily|reminders\/run|sweep|\/run$|\/sync$)/;

beforeAll(async () => {
  ({ app } = await import("../../app"));
  ({ prisma } = await import("../../db"));
  routes = await allRoutes();
  for (const role of ["DRIVER", "ACCOUNTING", "DISPATCHER", "STAFF"] as const) {
    const email = `authz-${role.toLowerCase()}@security-test.local`;
    const u = await prisma.user.upsert({ where: { email }, update: { role, active: true }, create: { email, role, passwordHash: "x" } });
    cookies[role] = "eb_admin=" + jwt.sign({ sub: u.id, role, tv: u.tokenVersion ?? 0 }, process.env.JWT_SECRET!, { expiresIn: 600 });
  }
}, 60_000);

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: "@security-test.local" } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: users.map((u: { id: string }) => u.id) } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@security-test.local" } } });
});

describe("route inventory", () => {
  it("enumerates the whole API (sanity check that the walker sees nested routers)", () => {
    expect(routes.length).toBeGreaterThan(300);
    expect(routes.some((r) => r.path === "/v1/account/auth/login")).toBe(true);
    expect(routes.some((r) => r.path.startsWith("/v1/admin/billing/"))).toBe(true);
  });
});

describe("unauthenticated access", () => {
  it("every non-public route answers 401 (or 404 for gated modules) without a session", async () => {
    const leaks: string[] = [];
    for (const r of routes) {
      if (PUBLIC_OK.some((re) => re.test(r.path))) continue;
      // Feature-gated public modules (protection) answer 404 while disabled — never data
      const res = await call(r);
      if (res.status !== 401 && !(res.status === 404 && r.path.startsWith("/v1/protection/"))) leaks.push(`${res.status} ${r.method} ${r.path}`);
    }
    expect(leaks, leaks.join("\n")).toEqual([]);
  }, 180_000);
});

describe("role separation", () => {
  it("DRIVER sessions are refused on every admin route except /auth", async () => {
    const leaks: string[] = [];
    for (const r of routes.filter((x) => x.path.startsWith("/v1/admin/") && !x.path.startsWith("/v1/admin/auth/"))) {
      if (SIDE_EFFECT.test(r.path) && r.method !== "GET") continue;
      const res = await call(r, cookies.DRIVER);
      if (res.status !== 403) leaks.push(`${res.status} ${r.method} ${r.path}`);
    }
    expect(leaks, leaks.join("\n")).toEqual([]);
  }, 180_000);

  const forbidden: Record<string, RegExp[]> = {
    ACCOUNTING: [/^\/v1\/admin\/dispatch\//, /^\/v1\/admin\/users(\/(?!me)|$)/, /^\/v1\/admin\/team\/.*(availability|credentials)$/, /^\/v1\/admin\/quotations/, /^\/v1\/admin\/carriers\/orders\//, /^\/v1\/admin\/storage\//, /^\/v1\/admin\/cms\//, /^\/v1\/admin\/assistant\//, /^\/v1\/admin\/reference\//],
    DISPATCHER: [/^\/v1\/admin\/billing\//, /^\/v1\/admin\/quotations/, /^\/v1\/admin\/protection\//, /^\/v1\/admin\/users(\/(?!me)|$)/, /^\/v1\/admin\/cms\//, /^\/v1\/admin\/customers/, /^\/v1\/admin\/reports\/summary/],
    STAFF: [/^\/v1\/admin\/users(\/(?!me)|$)/],
  };

  for (const [role, patterns] of Object.entries(forbidden)) {
    it(`${role} is refused on areas outside its job`, async () => {
      const leaks: string[] = [];
      for (const r of routes.filter((x) => patterns.some((p) => p.test(x.path)))) {
        if (SIDE_EFFECT.test(r.path) && r.method !== "GET") continue;
        // Read-only overviews some roles legitimately see are listed per module; writes must always be 403
        const res = await call(r, cookies[role]);
        if (res.status !== 403) leaks.push(`${res.status} ${r.method} ${r.path}`);
      }
      expect(leaks, leaks.join("\n")).toEqual([]);
    }, 180_000);
  }
});

describe("driver API", () => {
  it("staff without the DRIVER role can't use /v1/driver", async () => {
    const res = await request(app).get("/v1/driver/jobs").set("Cookie", cookies.ACCOUNTING);
    expect([401, 403]).toContain(res.status);
  });
});
