/**
 * Staff security tests: password policy, lockout, TOTP enroll/verify/login, recovery codes,
 * reset/invite tokens (single use, expiry), session invalidation, owner-only user management.
 */
process.env.LOGIN_RATE_LIMIT = "10000";
import request from "supertest";
import { generateSync } from "otplib";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL || (() => { try { process.loadEnvFile(".env"); return !!process.env.DATABASE_URL; } catch { return false; } })();

describe.skipIf(!hasDb)("staff security", async () => {
  const { app } = await import("../../../app");
  const { prisma } = await import("../../../db");
  const auth = await import("../../../auth");
  const tag = randomBytes(3).toString("hex");
  const pw = `Strong-Pass-${tag}-2026!`;
  const mk = (p: string) => `sec-${p}-${tag}@test.local`;
  const emails = { owner: mk("owner"), staff: mk("staff"), lock: mk("lock"), totp: mk("totp"), reset: mk("reset"), invitee: mk("invitee") };
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const passwordHash = await auth.hashPassword(pw);
    for (const [k, email] of Object.entries(emails)) {
      if (k === "invitee") continue;
      const u = await prisma.user.create({ data: { email, passwordHash, role: k === "owner" ? "OWNER" : "STAFF" } });
      ids[k] = u.id;
    }
  });
  afterAll(async () => {
    const all = await prisma.user.findMany({ where: { email: { in: Object.values(emails) } } });
    const uids = all.map((u) => u.id);
    await prisma.authToken.deleteMany({ where: { subjectId: { in: uids } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: uids } }, { entityId: { in: uids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: uids } } });
  });

  const login = async (email: string, extra: object = {}) => {
    const agent = request.agent(app);
    const res = await agent.post("/v1/admin/auth/login").send({ email, password: pw, ...extra });
    return { agent, res };
  };

  it("password policy rejects short or email-containing passwords", () => {
    expect(auth.passwordProblem("short", "a@b.com")).toMatch(/12/);
    expect(auth.passwordProblem("carlosmiami-2026-xyz", "carlosmiami@x.com")).toMatch(/email/);
    expect(auth.passwordProblem("A-very-good-passphrase", "ops@x.com")).toBeNull();
  });

  it("locks the account after 5 wrong passwords", async () => {
    for (let i = 0; i < 4; i++) {
      const r = await request(app).post("/v1/admin/auth/login").send({ email: emails.lock, password: "wrong-password!!" });
      expect(r.status).toBe(401);
    }
    const fifth = await request(app).post("/v1/admin/auth/login").send({ email: emails.lock, password: "wrong-password!!" });
    expect(fifth.status).toBe(423);
    const right = await request(app).post("/v1/admin/auth/login").send({ email: emails.lock, password: pw });
    expect(right.status).toBe(423); // still locked even with the right password
    // Owner can unlock
    const { agent } = await login(emails.owner);
    expect((await agent.post(`/v1/admin/users/${ids.lock}/unlock`)).status).toBe(200);
    expect((await login(emails.lock)).res.status).toBe(200);
  });

  it("enrolls TOTP, requires it at login, rejects replay, accepts a recovery code once", async () => {
    const { agent } = await login(emails.totp);
    const setup = await agent.post("/v1/admin/users/me/2fa/setup");
    expect(setup.status).toBe(200);
    expect(setup.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    const secret = setup.body.secret as string;
    // stored encrypted, never plain
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: ids.totp } });
    expect(stored.totpSecret).toMatch(/^enc:/);
    expect((await agent.post("/v1/admin/users/me/2fa/enable").send({ code: "000000" })).status).toBe(400);
    const enable = await agent.post("/v1/admin/users/me/2fa/enable").send({ code: generateSync({ secret }) });
    expect(enable.status).toBe(200);
    expect(enable.body.recoveryCodes).toHaveLength(10);
    // The enabling device keeps a valid (re-issued) session
    expect((await agent.get("/v1/admin/auth/me")).status).toBe(200);

    const step1 = await request(app).post("/v1/admin/auth/login").send({ email: emails.totp, password: pw });
    expect(step1.body.twoFactorRequired).toBe(true);
    expect(step1.headers["set-cookie"]).toBeUndefined();
    const bad = await request(app).post("/v1/admin/auth/login").send({ email: emails.totp, password: pw, totp: "123456" });
    expect(bad.status).toBe(401);
    // Same-step code was already used for enabling → replay rejected; next step is accepted
    const now = Date.now();
    const next = generateSync({ secret, epoch: Math.floor(now / 1000) + 30 });
    const ok = await request(app).post("/v1/admin/auth/login").send({ email: emails.totp, password: pw, totp: next });
    expect(ok.status).toBe(200);
    const replay = await request(app).post("/v1/admin/auth/login").send({ email: emails.totp, password: pw, totp: next });
    expect(replay.status).toBe(401);

    const code = enable.body.recoveryCodes[0];
    const rc = await request(app).post("/v1/admin/auth/login").send({ email: emails.totp, password: pw, recoveryCode: code });
    expect(rc.status).toBe(200);
    expect(rc.body.recoveryCodesLeft).toBe(9);
    expect((await request(app).post("/v1/admin/auth/login").send({ email: emails.totp, password: pw, recoveryCode: code })).status).toBe(401);
    await prisma.user.update({ where: { id: ids.totp }, data: { failedLogins: 0, lockedUntil: null } });
  });

  it("reset tokens are single use, expire, and end old sessions", async () => {
    const { agent: oldSession } = await login(emails.reset);
    expect((await oldSession.get("/v1/admin/auth/me")).status).toBe(200);
    const forgot = await request(app).post("/v1/admin/auth/forgot").send({ email: emails.reset });
    expect(forgot.status).toBe(200);
    const unknown = await request(app).post("/v1/admin/auth/forgot").send({ email: `nobody-${tag}@test.local` });
    expect(unknown.body.message).toBe(forgot.body.message); // no account enumeration

    const raw = await auth.createAuthToken("password-reset", "user", ids.reset, 60);
    expect((await request(app).get("/v1/admin/auth/token").query({ token: raw })).body.email).toBe(emails.reset);
    expect((await request(app).post("/v1/admin/auth/reset").send({ token: raw, password: "short" })).status).toBe(400);
    const newPw = `Brand-New-Pass-${tag}!`;
    expect((await request(app).post("/v1/admin/auth/reset").send({ token: raw, password: newPw })).status).toBe(200);
    expect((await request(app).post("/v1/admin/auth/reset").send({ token: raw, password: newPw })).status).toBe(400); // used
    expect((await oldSession.get("/v1/admin/auth/me")).status).toBe(401); // old session invalidated
    expect((await request(app).post("/v1/admin/auth/login").send({ email: emails.reset, password: newPw })).status).toBe(200);

    const expired = await auth.createAuthToken("password-reset", "user", ids.reset, 60);
    await prisma.authToken.updateMany({ where: { subjectId: ids.reset, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).post("/v1/admin/auth/reset").send({ token: expired, password: `Another-Pass-${tag}!` })).status).toBe(400);
  });

  it("owner-only user management with last-owner guard", async () => {
    const { agent: staff } = await login(emails.staff);
    expect((await staff.get("/v1/admin/users")).status).toBe(403);
    expect((await staff.get("/v1/admin/users/audit")).status).toBe(403);
    expect((await staff.get("/v1/admin/users/me/security")).status).toBe(200); // self-service allowed

    const { agent: owner } = await login(emails.owner);
    const inv = await owner.post("/v1/admin/users").send({ email: emails.invitee, role: "DISPATCHER", name: "Invite Test" });
    expect(inv.status).toBe(201);
    expect((await owner.post("/v1/admin/users").send({ email: emails.invitee, role: "STAFF" })).status).toBe(409);
    expect((await owner.patch(`/v1/admin/users/${ids.owner}`).send({ role: "STAFF" })).status).toBe(400); // self-demotion
    const list = await owner.get("/v1/admin/users");
    expect(list.body.users.some((u: { email: string }) => u.email === emails.invitee)).toBe(true);
    const audit = await owner.get("/v1/admin/users/audit").query({ entity: "user" });
    expect(audit.status).toBe(200);
    expect(audit.body.entries.length).toBeGreaterThan(0);
  });

  it("change own password keeps this session but ends others", async () => {
    const { agent: a } = await login(emails.staff);
    const { agent: b } = await login(emails.staff);
    const newPw = `Changed-Pass-${tag}-x!`;
    const r = await a.post("/v1/admin/users/me/password").send({ currentPassword: pw, newPassword: newPw });
    expect(r.status).toBe(200);
    expect((await a.get("/v1/admin/auth/me")).status).toBe(200);
    expect((await b.get("/v1/admin/auth/me")).status).toBe(401);
    await prisma.user.update({ where: { id: ids.staff }, data: { passwordHash: await auth.hashPassword(pw) } });
  });

  it("drivers cannot use the office admin API", async () => {
    await prisma.user.update({ where: { id: ids.staff }, data: { role: "DRIVER" } });
    const { agent, res } = await login(emails.staff);
    expect(res.status).toBe(200);
    expect((await agent.get("/v1/admin/auth/me")).status).toBe(200);
    expect((await agent.get("/v1/admin/team")).status).toBe(403);
    await prisma.user.update({ where: { id: ids.staff }, data: { role: "STAFF" } });
  });
});
