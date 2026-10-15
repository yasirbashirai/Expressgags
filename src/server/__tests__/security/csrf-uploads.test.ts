/**
 * CSRF guard, upload content sniffing, CSV formula neutralization and the production config check.
 */
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../app";
import { csvSafe, productionConfigProblems, sniffKind } from "../../lib/security";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a1bb0000000049454e44ae426082", "hex");

describe("CSRF guard", () => {
  it("blocks state-changing requests from a foreign origin", async () => {
    const r = await request(app).post("/v1/contact").set("Origin", "https://evil.example").send({});
    expect(r.status).toBe(403);
  });
  it("blocks a foreign Referer when Origin is absent", async () => {
    const r = await request(app).post("/v1/account/auth/login").set("Referer", "https://evil.example/page").send({});
    expect(r.status).toBe(403);
  });
  it('blocks the opaque "null" origin (sandboxed iframes, data: pages)', async () => {
    const r = await request(app).post("/v1/admin/auth/login").set("Origin", "null").send({});
    expect(r.status).toBe(403);
  });
  it("blocks form-encoded cross-site posts (no CORS preflight) too", async () => {
    const r = await request(app).post("/v1/admin/auth/logout").set("Origin", "https://evil.example").type("form").send("a=1");
    expect(r.status).toBe(403);
  });
  it("lets the website origin through (normal validation applies)", async () => {
    const r = await request(app).post("/v1/contact").set("Origin", "http://localhost:3000").send({});
    expect(r.status).toBe(400);
  });
  it("never applies to reads", async () => {
    const r = await request(app).get("/v1/health").set("Origin", "https://evil.example");
    expect(r.status).toBe(200);
  });
  it("exempts signed provider webhooks (they verify signatures instead)", async () => {
    const r = await request(app).post("/v1/webhooks/stripe").set("Origin", "https://evil.example").set("Content-Type", "application/json").send("{}");
    expect(r.status).not.toBe(403);
  });
});

describe("upload content sniffing", () => {
  it("recognizes real file signatures", () => {
    expect(sniffKind(PNG)).toBe("png");
    expect(sniffKind(Buffer.from("%PDF-1.7\n..."))).toBe("pdf");
    expect(sniffKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("jpeg");
    expect(sniffKind(Buffer.from("name,email\nA,a@b.c\n"))).toBe("text");
    expect(sniffKind(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"))).toBe("unknown");
    expect(sniffKind(Buffer.from("<!DOCTYPE html><script>x</script>"))).toBe("unknown");
  });
  it("rejects HTML disguised as a PDF", async () => {
    const r = await request(app).post("/v1/uploads").set("Origin", "http://localhost:3000").attach("file", Buffer.from("<html><script>alert(1)</script></html>"), { filename: "invoice.pdf", contentType: "application/pdf" });
    expect(r.status).toBe(415);
  });
  it("rejects an SVG renamed to .png", async () => {
    const r = await request(app).post("/v1/uploads").set("Origin", "http://localhost:3000").attach("file", Buffer.from("<svg onload=alert(1)></svg>"), { filename: "photo.png", contentType: "image/png" });
    expect(r.status).toBe(415);
  });
  it("rejects a renamed executable", async () => {
    const r = await request(app).post("/v1/uploads").set("Origin", "http://localhost:3000").attach("file", Buffer.from("MZ\x90\x00binary"), { filename: "photo.jpg", contentType: "image/jpeg" });
    expect(r.status).toBe(415);
  });
  it("accepts a genuine PNG", async () => {
    const r = await request(app).post("/v1/uploads").set("Origin", "http://localhost:3000").attach("file", PNG, { filename: "photo.png", contentType: "image/png" });
    expect(r.status).toBe(201);
  });
});

describe("CSV formula neutralization", () => {
  it("quotes formula triggers but keeps numbers numeric", () => {
    expect(csvSafe("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvSafe("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvSafe("+1-555")).toBe("'+1-555");
    expect(csvSafe("-12.50")).toBe("-12.50");
    expect(csvSafe("Hotel, Miami")).toBe('"Hotel, Miami"');
  });
});

describe("production configuration check", () => {
  it("lists every unsafe or missing setting", () => {
    const p = productionConfigProblems({ JWT_SECRET: "short", WEB_ORIGIN: "http://www.express-bags.com", IP_HASH_SALT: "eb-local-salt", PROVIDERS_MODE: "mock" });
    expect(p.join("|")).toMatch(/DATABASE_URL is required/);
    expect(p.join("|")).toMatch(/JWT_SECRET must be at least 32/);
    expect(p.join("|")).toMatch(/WEB_ORIGIN entry must be https/);
    expect(p.join("|")).toMatch(/IP_HASH_SALT/);
    expect(p.join("|")).toMatch(/PROVIDERS_MODE=mock/);
  });
  it("passes a safe configuration", () => {
    expect(
      productionConfigProblems({
        DATABASE_URL: "postgres://u:p@db.neon.tech/eb",
        JWT_SECRET: "x9V2q7LmP4tR8wZ1cK6nB3hY5sD0fG7j",
        WEB_ORIGIN: "https://www.express-bags.com,https://express-bags.com",
        PUBLIC_WEB_URL: "https://www.express-bags.com",
        IP_HASH_SALT: "a-random-production-salt",
        UPLOAD_DIR: "/var/data/uploads",
      }),
    ).toEqual([]);
  });
});
