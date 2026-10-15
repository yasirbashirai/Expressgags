/**
 * Production-mode behavior (this file runs with NODE_ENV=production in its own module scope):
 * cookie-carrying requests without an Origin are refused, local dev origins aren't trusted,
 * mock checkout is disabled, and error responses never leak internals.
 */
// Production mode never reads .env, so load the local dev database settings explicitly for this test
try {
  process.loadEnvFile(".env");
} catch {
  /* CI provides env */
}
(process.env as Record<string, string>).NODE_ENV = "production";
process.env.WEB_ORIGIN = "https://www.express-bags.com";

import request from "supertest";
import { describe, expect, it } from "vitest";

describe("production mode", async () => {
  const { app } = await import("../../app");

  it("refuses cookie-authenticated writes that carry no Origin/Referer", async () => {
    const r = await request(app).post("/v1/admin/auth/logout").set("Cookie", "eb_admin=anything").send({});
    expect(r.status).toBe(403);
  });
  it("does not trust localhost dev origins", async () => {
    const r = await request(app).post("/v1/contact").set("Origin", "http://localhost:3000").send({});
    expect(r.status).toBe(403);
  });
  it("trusts the configured website origin", async () => {
    const r = await request(app).post("/v1/contact").set("Origin", "https://www.express-bags.com").send({});
    expect(r.status).toBe(400);
  });
  it("disables the mock checkout completion endpoint", async () => {
    const r = await request(app).post("/v1/pay/mock/mock_cs_test/complete").set("Origin", "https://www.express-bags.com").send({});
    expect([403, 404]).toContain(r.status);
  });
  it("returns generic errors without stack traces", async () => {
    const r = await request(app).post("/v1/quotes").set("Origin", "https://www.express-bags.com").set("Content-Type", "application/json").send("{bad json");
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toMatch(/at \w+ \(|node_modules|prisma|stack/i);
  });
});
