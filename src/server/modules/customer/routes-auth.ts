/**
 * Customer portal authentication: /v1/account/auth/*
 *
 * Registration never activates a password directly. The chosen password is stored as "pending" and only
 * becomes the login password after the email link is opened AND the same password is re-entered.
 * That proves the person owns both the inbox and the password, so nobody can pre-claim someone else's
 * email (customers created earlier by quote requests keep their history safe until they verify).
 * Responses never reveal whether an email already has an account.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { contact } from "@/content/site";
import { clearCustomerSession, issueCustomerSession, requireCustomer } from "../../auth-customer";
import { hashPassword, verifyPassword } from "../../auth";
import { prisma } from "../../db";
import { brandedHtml, sendMail } from "../../lib/email";
import { emit } from "../../lib/events";
import { asyncHandler, HttpError } from "../../lib/errors";
import { auditCustomer } from "./access";
import { consumeToken, issueToken, peekToken, siteUrl } from "./tokens";

export const authRouter = Router();

const limiter = (limit: number, minutes = 15) =>
  rateLimit({
    windowMs: minutes * 60 * 1000,
    limit: Number(process.env.LOGIN_RATE_LIMIT || limit),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { ok: false, error: "Too many attempts. Please wait a few minutes and try again." },
  });
const loginLimiter = limiter(10);
const emailLimiter = limiter(8);

/** Password policy: 10+ characters, not purely letters or digits, not the email itself. */
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /[^A-Za-z]/.test(p), "Mix letters with numbers or symbols");

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email").max(200);
const GENERIC_SENT = "If that email can be used, we just sent a link. Please check your inbox (and spam folder).";

async function sendVerifyEmail(customer: { id: string; email: string; name: string }) {
  const token = await issueToken("email-verify", customer.id);
  const link = `${siteUrl()}/account/verify?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: customer.email,
    subject: "Confirm your Express Bags account",
    text: `Hello ${customer.name},\n\nConfirm your email to activate your Express Bags account:\n${link}\n\nThe link expires in 24 hours. If you did not request this, you can ignore this email.\n\nExpress Bags, Inc. · ${contact.phoneDisplay}`,
    html: brandedHtml("Confirm your account", [
      `Hello ${customer.name},`,
      "Confirm your email to activate your Express Bags account. You will be asked to enter the password you chose.",
      link,
      "The link expires in 24 hours. If you did not request this, you can ignore this email.",
    ]),
  });
  return token;
}

/* ------------------------------- Register -------------------------------- */
authRouter.post(
  "/register",
  emailLimiter,
  asyncHandler(async (req, res) => {
    if (typeof req.body?.website === "string" && req.body.website) return res.status(201).json({ ok: true, message: GENERIC_SENT });
    const body = z
      .object({
        name: z.string().trim().min(2, "Enter your name").max(120),
        email: emailSchema,
        phone: z.string().trim().min(7, "Enter a phone number").max(40),
        password: passwordSchema,
        companyName: z.string().trim().max(200).optional().or(z.literal("")),
        marketingOptIn: z.boolean().optional(),
      })
      .parse(req.body);
    if (body.password.toLowerCase().includes(body.email.split("@")[0])) throw new HttpError(400, "Please choose a password that does not contain your email.", [{ path: "password", message: "Too similar to your email" }]);

    const existing = await prisma.customer.findUnique({ where: { email: body.email } });
    if (existing?.passwordHash) {
      // Account already active: tell the owner, not the requester.
      await sendMail({
        to: existing.email,
        subject: "Express Bags account sign-in",
        text: `Someone tried to create an Express Bags account with this email. You already have one: sign in at ${siteUrl()}/account/login or reset your password at ${siteUrl()}/account/forgot.`,
        html: brandedHtml("You already have an account", [
          "Someone tried to create an Express Bags account with this email address. You already have an account.",
          `Sign in: ${siteUrl()}/account/login`,
          `Forgot your password? ${siteUrl()}/account/forgot`,
        ]),
      });
      return res.status(201).json({ ok: true, message: GENERIC_SENT });
    }

    const customer = existing
      ? existing // created earlier by a quote request: keep its name/history, do not overwrite until verified
      : await prisma.customer.create({ data: { email: body.email, name: body.name, phone: body.phone, marketingOptIn: !!body.marketingOptIn } });
    await prisma.customerAccess.upsert({
      where: { customerId: customer.id },
      update: { pendingPasswordHash: await hashPassword(body.password), status: "PENDING" },
      create: { customerId: customer.id, pendingPasswordHash: await hashPassword(body.password), status: "PENDING" },
    });
    await sendVerifyEmail({ id: customer.id, email: customer.email, name: existing ? existing.name : body.name });
    await auditCustomer(customer, "register", "customer", customer.id, { companyName: body.companyName || undefined });
    res.status(201).json({ ok: true, message: GENERIC_SENT });
  }),
);

authRouter.post(
  "/resend-verification",
  emailLimiter,
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    const c = await prisma.customer.findUnique({ where: { email } });
    const access = c ? await prisma.customerAccess.findUnique({ where: { customerId: c.id } }) : null;
    if (c && !c.passwordHash && access?.pendingPasswordHash) await sendVerifyEmail(c);
    res.json({ ok: true, message: GENERIC_SENT });
  }),
);

/** Shows whether a verification link is still valid (for the verify page). */
authRouter.get(
  "/verify/:token",
  asyncHandler(async (req, res) => {
    const t = await peekToken("email-verify", req.params.token as string);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: t.subjectId } });
    res.json({ ok: true, email: c.email.replace(/^(.).*(@.*)$/, "$1•••$2") });
  }),
);

/** Completes verification: token + the password chosen at registration. */
authRouter.post(
  "/verify",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { token, password } = z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(200) }).parse(req.body);
    const t = await peekToken("email-verify", token);
    const access = await prisma.customerAccess.findUnique({ where: { customerId: t.subjectId } });
    if (!access?.pendingPasswordHash || !(await verifyPassword(password, access.pendingPasswordHash))) {
      throw new HttpError(400, "That password does not match the one you chose when registering.", [{ path: "password", message: "Password does not match" }]);
    }
    await consumeToken("email-verify", token);
    const customer = await prisma.customer.update({
      where: { id: t.subjectId },
      data: { passwordHash: access.pendingPasswordHash, emailVerifiedAt: new Date(), lastLoginAt: new Date() },
    });
    await prisma.customerAccess.update({ where: { customerId: customer.id }, data: { status: "ACTIVE", pendingPasswordHash: null } });
    await auditCustomer(customer, "verify-email", "customer", customer.id);
    await emit("customer.registered", { customerId: customer.id });
    issueCustomerSession(res, customer);
    res.json({ ok: true });
  }),
);

/* -------------------------------- Login --------------------------------- */
authRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = z.object({ email: emailSchema, password: z.string().min(1).max(200) }).parse(req.body);
    const c = await prisma.customer.findUnique({ where: { email } });
    const access = c ? await prisma.customerAccess.findUnique({ where: { customerId: c.id } }) : null;
    const ok = !!c?.passwordHash && (await verifyPassword(password, c.passwordHash));
    if (!ok) {
      // Pending (unverified) accounts get a hint only when the pending password is correct
      if (c && access?.pendingPasswordHash && (await verifyPassword(password, access.pendingPasswordHash))) {
        throw new HttpError(403, "Please confirm your email first. Use the link we sent you, or request a new one.", { code: "EMAIL_NOT_VERIFIED" });
      }
      throw new HttpError(401, "Email or password is incorrect.");
    }
    if (access?.status === "DEACTIVATED") throw new HttpError(401, "Email or password is incorrect.");
    await prisma.customer.update({ where: { id: c!.id }, data: { lastLoginAt: new Date() } });
    issueCustomerSession(res, c!);
    res.json({ ok: true });
  }),
);

authRouter.post("/logout", (_req, res) => {
  clearCustomerSession(res);
  res.json({ ok: true });
});

/* ---------------------------- Password reset ----------------------------- */
authRouter.post(
  "/forgot",
  emailLimiter,
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    const c = await prisma.customer.findUnique({ where: { email } });
    const access = c ? await prisma.customerAccess.findUnique({ where: { customerId: c.id } }) : null;
    if (c?.passwordHash && access?.status !== "DEACTIVATED") {
      const token = await issueToken("password-reset", c.id);
      const link = `${siteUrl()}/account/reset?token=${encodeURIComponent(token)}`;
      await sendMail({
        to: c.email,
        subject: "Reset your Express Bags password",
        text: `Reset your password (link valid for 1 hour, single use):\n${link}\n\nIf you did not request this, ignore this email; your password stays the same.`,
        html: brandedHtml("Reset your password", ["Use this link to choose a new password. It is valid for 1 hour and can be used once.", link, "If you did not request this, ignore this email; your password stays the same."]),
      });
    }
    res.json({ ok: true, message: GENERIC_SENT });
  }),
);

authRouter.post(
  "/reset",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { token, password } = z.object({ token: z.string().min(10).max(200), password: passwordSchema }).parse(req.body);
    const customerId = await consumeToken("password-reset", token);
    const c = await prisma.customer.update({ where: { id: customerId }, data: { passwordHash: await hashPassword(password) } });
    await auditCustomer(c, "reset-password", "customer", c.id);
    clearCustomerSession(res);
    res.json({ ok: true });
  }),
);

/* ---------------------- Company invite → set password -------------------- */
authRouter.get(
  "/invite/:token",
  asyncHandler(async (req, res) => {
    const t = await peekToken("invite", req.params.token as string);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: t.subjectId }, include: { company: true } });
    res.json({ ok: true, name: c.name, email: c.email, company: c.company?.name ?? null, role: c.accountRole });
  }),
);

authRouter.post(
  "/invite",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { token, password, name, phone } = z
      .object({ token: z.string().min(10).max(200), password: passwordSchema, name: z.string().trim().min(2).max(120), phone: z.string().trim().max(40).optional() })
      .parse(req.body);
    const customerId = await consumeToken("invite", token);
    const c = await prisma.customer.update({
      where: { id: customerId },
      data: { name, phone: phone || undefined, passwordHash: await hashPassword(password), emailVerifiedAt: new Date(), lastLoginAt: new Date() },
    });
    await prisma.customerAccess.upsert({ where: { customerId }, update: { status: "ACTIVE", pendingPasswordHash: null }, create: { customerId, status: "ACTIVE" } });
    await auditCustomer(c, "accept-invite", "customer", c.id);
    issueCustomerSession(res, c);
    res.json({ ok: true });
  }),
);

/* ------------------------- Session & credentials ------------------------- */
authRouter.post(
  "/change-password",
  requireCustomer,
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema }).parse(req.body);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: req.customer!.id } });
    if (!c.passwordHash || !(await verifyPassword(currentPassword, c.passwordHash))) {
      throw new HttpError(400, "Your current password is incorrect.", [{ path: "currentPassword", message: "Incorrect password" }]);
    }
    await prisma.customer.update({ where: { id: c.id }, data: { passwordHash: await hashPassword(newPassword) } });
    await auditCustomer(c, "change-password", "customer", c.id);
    issueCustomerSession(res, c);
    res.json({ ok: true });
  }),
);
