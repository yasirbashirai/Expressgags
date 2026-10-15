/**
 * Session invalidation: changing a customer's password signs out every other device
 * (sessions carry a fingerprint of the current password hash).
 */
import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../app";
import { hashPassword } from "../../auth";
import { prisma } from "../../db";

const ORIGIN = "http://localhost:3000";
const email = `session-${randomBytes(3).toString("hex")}@security-test.local`;
const cookieOf = (r: request.Response) => ([] as string[]).concat(r.headers["set-cookie"] ?? []).find((c) => c.startsWith("eb_customer="))!.split(";")[0];

afterAll(async () => {
  await prisma.customer.deleteMany({ where: { email } });
});

describe("customer sessions", () => {
  it("old sessions stop working after a password change; the new one works", async () => {
    await prisma.customer.create({ data: { name: "Session Test", email, passwordHash: await hashPassword("Original-Pass-2026"), emailVerifiedAt: new Date() } });
    const login1 = await request(app).post("/v1/account/auth/login").set("Origin", ORIGIN).send({ email, password: "Original-Pass-2026" });
    expect(login1.status).toBe(200);
    const deviceA = cookieOf(login1);
    const login2 = await request(app).post("/v1/account/auth/login").set("Origin", ORIGIN).send({ email, password: "Original-Pass-2026" });
    const deviceB = cookieOf(login2);

    const change = await request(app).post("/v1/account/auth/change-password").set("Origin", ORIGIN).set("Cookie", deviceA).send({ currentPassword: "Original-Pass-2026", newPassword: "Brand-New-Pass-2026" });
    expect(change.status).toBe(200);
    const deviceANew = cookieOf(change);

    expect((await request(app).get("/v1/account/me").set("Cookie", deviceB)).status).toBe(401);
    expect((await request(app).get("/v1/account/me").set("Cookie", deviceA)).status).toBe(401);
    expect((await request(app).get("/v1/account/me").set("Cookie", deviceANew)).status).toBe(200);
  });
});
