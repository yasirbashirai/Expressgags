/**
 * Module "users" — staff accounts & security (Carlos req. #10). Mounted at /v1/admin/users
 * (the admin router has already authenticated the session).
 *  - /me/*   : every signed-in staff member — change password, TOTP two-factor, recovery codes, sign out everywhere
 *  - others  : OWNER only — list, invite, change role, deactivate, reset password, force sign-out, unlock,
 *              reset lost 2FA, audit-log viewer
 */
import { Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import {
  audit, checkTotp, createAuthToken, hashPassword, issueSession, newRecoveryCodes, newTotpSecret, requireRole,
  sealTotpSecret, setUserPassword, totpUri, verifyPassword, webBaseUrl,
} from "../../auth";
import { prisma } from "../../db";
import type { Prisma, Role } from "../../generated/prisma/client";
import { brandedHtml, sendMail } from "../../lib/email";
import { asyncHandler, HttpError } from "../../lib/errors";
import type { PlatformModule } from "../types";
import { randomBytes } from "node:crypto";

export const adminRouter = Router();

const OWNER = requireRole(); // OWNER only
export const STAFF_ROLES = ["OWNER", "STAFF", "DISPATCHER", "DRIVER", "ACCOUNTING"] as const;

const publicUser = (u: { id: string; email: string; name: string | null; role: Role; active: boolean; totpEnabled: boolean; lastLoginAt: Date | null; lockedUntil: Date | null; mustChangePassword: boolean; createdAt: Date }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  active: u.active,
  totpEnabled: u.totpEnabled,
  lastLoginAt: u.lastLoginAt,
  locked: !!u.lockedUntil && u.lockedUntil > new Date(),
  mustChangePassword: u.mustChangePassword,
  createdAt: u.createdAt,
});

/** Re-issue the caller's session after their tokenVersion changed (so they stay signed in on this device). */
async function refreshOwnSession(res: Parameters<typeof issueSession>[0], userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  issueSession(res, { id: u.id, email: u.email, role: u.role, name: u.name, tokenVersion: u.tokenVersion });
}

/* -------------------------------- My account -------------------------------- */

adminRouter.get(
  "/me/security",
  asyncHandler(async (req, res) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    res.json({
      ok: true,
      security: {
        email: u.email,
        totpEnabled: u.totpEnabled,
        recoveryCodesLeft: u.totpRecoveryCodes.length,
        passwordChangedAt: u.passwordChangedAt,
        lastLoginAt: u.lastLoginAt,
        mustChangePassword: u.mustChangePassword,
      },
    });
  }),
);

adminRouter.post(
  "/me/password",
  asyncHandler(async (req, res) => {
    const b = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) }).parse(req.body);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await verifyPassword(b.currentPassword, u.passwordHash))) throw new HttpError(400, "Your current password is incorrect.", [{ path: "currentPassword", message: "Incorrect" }]);
    if (b.currentPassword === b.newPassword) throw new HttpError(400, "Choose a password you have not used here.", [{ path: "newPassword", message: "Same as current" }]);
    await setUserPassword(u.id, u.email, b.newPassword); // ends every other session
    await refreshOwnSession(res, u.id);
    await audit(req, "password-change", "user", u.id);
    res.json({ ok: true });
  }),
);

/** Step 1: create a pending secret + QR code (2FA stays off until a code is verified). */
adminRouter.post(
  "/me/2fa/setup",
  asyncHandler(async (req, res) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (u.totpEnabled) throw new HttpError(409, "Two-factor sign-in is already on. Turn it off first to re-enroll.");
    const secret = newTotpSecret();
    await prisma.user.update({ where: { id: u.id }, data: { totpSecret: sealTotpSecret(secret), totpLastStep: null } });
    const uri = totpUri(u.email, secret);
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240, color: { dark: "#002858", light: "#ffffff" } });
    res.json({ ok: true, secret, otpauthUri: uri, qrDataUrl: qr });
  }),
);

/** Step 2: verify a code from the app → enable 2FA and show recovery codes once. */
adminRouter.post(
  "/me/2fa/enable",
  asyncHandler(async (req, res) => {
    const { code } = z.object({ code: z.string().min(6).max(12) }).parse(req.body);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (u.totpEnabled) throw new HttpError(409, "Two-factor sign-in is already on.");
    if (!u.totpSecret) throw new HttpError(400, "Start the setup first.");
    const step = checkTotp(u.totpSecret, code, null);
    if (step === null) throw new HttpError(400, "That code is not valid. Check the time on your phone and try again.", [{ path: "code", message: "Invalid code" }]);
    const { codes, hashes } = newRecoveryCodes();
    await prisma.user.update({ where: { id: u.id }, data: { totpEnabled: true, totpLastStep: step, totpRecoveryCodes: hashes, tokenVersion: { increment: 1 } } });
    await refreshOwnSession(res, u.id);
    await audit(req, "2fa-enable", "user", u.id);
    res.json({ ok: true, recoveryCodes: codes });
  }),
);

adminRouter.post(
  "/me/2fa/disable",
  asyncHandler(async (req, res) => {
    const b = z.object({ password: z.string().min(1).max(200), code: z.string().min(6).max(12) }).parse(req.body);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!u.totpEnabled || !u.totpSecret) throw new HttpError(409, "Two-factor sign-in is not on.");
    if (!(await verifyPassword(b.password, u.passwordHash))) throw new HttpError(400, "Your password is incorrect.", [{ path: "password", message: "Incorrect" }]);
    if (checkTotp(u.totpSecret, b.code, u.totpLastStep) === null) throw new HttpError(400, "That code is not valid.", [{ path: "code", message: "Invalid code" }]);
    await prisma.user.update({ where: { id: u.id }, data: { totpEnabled: false, totpSecret: null, totpRecoveryCodes: [], totpLastStep: null, tokenVersion: { increment: 1 } } });
    await refreshOwnSession(res, u.id);
    await audit(req, "2fa-disable", "user", u.id);
    res.json({ ok: true });
  }),
);

adminRouter.post(
  "/me/2fa/recovery-codes",
  asyncHandler(async (req, res) => {
    const { code } = z.object({ code: z.string().min(6).max(12) }).parse(req.body);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!u.totpEnabled || !u.totpSecret) throw new HttpError(409, "Two-factor sign-in is not on.");
    const step = checkTotp(u.totpSecret, code, u.totpLastStep);
    if (step === null) throw new HttpError(400, "That code is not valid.", [{ path: "code", message: "Invalid code" }]);
    const { codes, hashes } = newRecoveryCodes();
    await prisma.user.update({ where: { id: u.id }, data: { totpRecoveryCodes: hashes, totpLastStep: step } });
    await audit(req, "2fa-recovery-regenerate", "user", u.id);
    res.json({ ok: true, recoveryCodes: codes });
  }),
);

/** Ends every session of the current user (all devices), then signs this device back in. */
adminRouter.post(
  "/me/sign-out-everywhere",
  asyncHandler(async (req, res) => {
    await prisma.user.update({ where: { id: req.user!.id }, data: { tokenVersion: { increment: 1 } } });
    await refreshOwnSession(res, req.user!.id);
    await audit(req, "sign-out-everywhere", "user", req.user!.id);
    res.json({ ok: true });
  }),
);

/* ------------------------------ Audit log viewer ---------------------------- */

adminRouter.get(
  "/audit",
  OWNER,
  asyncHandler(async (req, res) => {
    const f = z
      .object({
        userId: z.string().max(40).optional(),
        entity: z.string().max(60).optional(),
        action: z.string().max(60).optional(),
        from: z.string().max(10).optional(),
        to: z.string().max(10).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);
    const where: Prisma.AuditLogWhereInput = {};
    if (f.userId) where.userId = f.userId;
    if (f.entity) where.entity = f.entity;
    if (f.action) where.action = { contains: f.action };
    if (f.from || f.to) where.createdAt = { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lte: new Date(`${f.to}T23:59:59Z`) } : {}) };
    const [total, rows, entities] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * f.pageSize, take: f.pageSize, include: { user: { select: { email: true } } } }),
      prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
    ]);
    res.json({
      ok: true,
      total,
      page: f.page,
      pageSize: f.pageSize,
      entities: entities.map((e) => e.entity),
      entries: rows.map((r) => ({ id: r.id, at: r.createdAt, user: r.user?.email ?? null, action: r.action, entity: r.entity, entityId: r.entityId, detail: r.detail })),
    });
  }),
);

/* ------------------------------ User management ----------------------------- */

adminRouter.get(
  "/",
  OWNER,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: [{ active: "desc" }, { role: "asc" }, { email: "asc" }], include: { employee: { select: { id: true, firstName: true, lastName: true } } } });
    res.json({ ok: true, users: users.map((u) => ({ ...publicUser(u), employee: u.employee })) });
  }),
);

/** Invite a new staff member: account created inactive-password, invite email to set one (72 h, single use). */
adminRouter.post(
  "/",
  OWNER,
  asyncHandler(async (req, res) => {
    const b = z.object({ email: z.string().trim().email(), name: z.string().trim().max(120).optional(), role: z.enum(STAFF_ROLES) }).parse(req.body);
    const email = b.email.toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(409, "A user with that email already exists.", [{ path: "email", message: "Already exists" }]);
    const user = await prisma.user.create({
      data: { email, name: b.name || null, role: b.role, passwordHash: await hashPassword(randomBytes(24).toString("hex")), mustChangePassword: true },
    });
    const token = await createAuthToken("invite", "user", user.id, 60 * 72);
    const link = `${webBaseUrl()}/admin/reset-password?token=${encodeURIComponent(token)}`;
    const mail = await sendMail({
      to: email,
      subject: "You're invited to the Express Bags admin",
      text: `You have been invited to the Express Bags ${b.role === "DRIVER" ? "driver app" : "admin"}.\n\nSet your password (valid for 72 hours, single use):\n${link}`,
      html: brandedHtml("You're invited", [`You have been invited to the Express Bags ${b.role === "DRIVER" ? "driver app" : "admin"}.`, `Set your password here (valid for 72 hours, single use): ${link}`]),
    });
    await audit(req, "invite", "user", user.id, { role: b.role });
    res.status(201).json({ ok: true, user: publicUser(user), emailStatus: mail });
  }),
);

/** Guard: the platform must always keep at least one active OWNER. */
async function assertKeepsAnOwner(userId: string, nextRole?: Role, nextActive?: boolean) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new HttpError(404, "User not found.");
  const losingOwner = u.role === "OWNER" && u.active && ((nextRole && nextRole !== "OWNER") || nextActive === false);
  if (losingOwner) {
    const owners = await prisma.user.count({ where: { role: "OWNER", active: true } });
    if (owners <= 1) throw new HttpError(409, "There must always be at least one active owner.");
  }
  return u;
}

adminRouter.patch(
  "/:id",
  OWNER,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const b = z.object({ name: z.string().trim().max(120).optional(), role: z.enum(STAFF_ROLES).optional(), active: z.boolean().optional() }).parse(req.body);
    if (id === req.user!.id && (b.active === false || (b.role && b.role !== "OWNER"))) throw new HttpError(400, "You cannot demote or deactivate your own account.");
    const before = await assertKeepsAnOwner(id, b.role, b.active);
    const permissionChange = (b.role && b.role !== before.role) || b.active === false;
    const u = await prisma.user.update({ where: { id }, data: { ...b, ...(permissionChange ? { tokenVersion: { increment: 1 } } : {}) } });
    await audit(req, "update", "user", id, { ...b, previousRole: before.role });
    res.json({ ok: true, user: publicUser(u) });
  }),
);

/** Email a password-reset link to the user (owner-initiated). */
adminRouter.post(
  "/:id/reset-password",
  OWNER,
  asyncHandler(async (req, res) => {
    const u = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
    if (!u || !u.active) throw new HttpError(404, "Active user not found.");
    const token = await createAuthToken("password-reset", "user", u.id, 60);
    const link = `${webBaseUrl()}/admin/reset-password?token=${encodeURIComponent(token)}`;
    const mail = await sendMail({
      to: u.email,
      subject: "Reset your Express Bags password",
      text: `An administrator sent you a password reset link (valid for 1 hour, single use):\n${link}`,
      html: brandedHtml("Reset your password", ["An administrator sent you a password reset link.", `Set a new password here (valid for 1 hour, single use): ${link}`]),
    });
    await audit(req, "password-reset-sent", "user", u.id);
    res.json({ ok: true, emailStatus: mail });
  }),
);

adminRouter.post(
  "/:id/force-sign-out",
  OWNER,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    await prisma.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } }).catch(() => {
      throw new HttpError(404, "User not found.");
    });
    if (id === req.user!.id) await refreshOwnSession(res, id);
    await audit(req, "force-sign-out", "user", id);
    res.json({ ok: true });
  }),
);

adminRouter.post(
  "/:id/unlock",
  OWNER,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    await prisma.user.update({ where: { id }, data: { lockedUntil: null, failedLogins: 0 } }).catch(() => {
      throw new HttpError(404, "User not found.");
    });
    await audit(req, "unlock", "user", id);
    res.json({ ok: true });
  }),
);

/** For a lost phone: owner turns off another user's 2FA (they must re-enroll). */
adminRouter.post(
  "/:id/reset-2fa",
  OWNER,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    if (id === req.user!.id) throw new HttpError(400, "Use My security to change your own two-factor settings.");
    await prisma.user.update({ where: { id }, data: { totpEnabled: false, totpSecret: null, totpRecoveryCodes: [], totpLastStep: null, tokenVersion: { increment: 1 } } }).catch(() => {
      throw new HttpError(404, "User not found.");
    });
    await audit(req, "2fa-reset-by-owner", "user", id);
    res.json({ ok: true });
  }),
);


export const platformModule: PlatformModule = {
  name: "users",
  routes: [{ scope: "admin", path: "/users", router: adminRouter }],
};
