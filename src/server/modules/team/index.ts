/**
 * Module "team" — Employee Management (Carlos req. #3), availability, credentials register (form Q33),
 * private documents, staff login links and expiration reminders.
 * Mounted at /v1/admin/team. Employee identities are PRIVATE: these routes exist only behind staff auth.
 * Read: OWNER / STAFF / DISPATCHER · Write: OWNER / STAFF (availability also DISPATCHER).
 */
import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { audit, createAuthToken, hashPassword, requireRole, webBaseUrl } from "../../auth";
import { prisma } from "../../db";
import type { Prisma } from "../../generated/prisma/client";
import { brandedHtml, sendMail } from "../../lib/email";
import { asyncHandler, HttpError } from "../../lib/errors";
import type { PlatformModule } from "../types";
import { availabilityConflicts } from "./availability";
import { parseDate, receiveFile, sendResourceFile } from "./files";
import { runReminders, upcomingExpirations } from "./reminders";

export const adminRouter = Router();

const READ = requireRole("STAFF", "DISPATCHER");
const WRITE = requireRole("STAFF");
const SCHEDULE = requireRole("STAFF", "DISPATCHER");

export const EMPLOYEE_ROLES = ["DRIVER", "HELPER", "DISPATCH", "OFFICE", "MANAGEMENT"] as const;
export const EMPLOYEE_STATUSES = ["ACTIVE", "INACTIVE", "ON_LEAVE"] as const;
export const AVAILABILITY_KINDS = ["SHIFT", "AVAILABLE", "UNAVAILABLE", "TIME_OFF"] as const;
export const CREDENTIAL_TYPES = ["TWIC", "AIRPORT_BADGE", "PORT_PASS", "VEHICLE_PERMIT", "INSURANCE_COI", "DOT", "MC", "BONDING", "OTHER"] as const;

const optStr = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optDate = z.union([z.string(), z.null()]).optional();

const employeeInput = z.object({
  firstName: z.string().trim().min(1, "Required").max(80),
  lastName: z.string().trim().min(1, "Required").max(80),
  role: z.enum(EMPLOYEE_ROLES),
  phone: optStr(40),
  email: z.string().trim().email("Enter a valid email").max(200).optional().nullable().or(z.literal("")).transform((v) => (v ? v.toLowerCase() : null)),
  homeMarket: optStr(60),
  status: z.enum(EMPLOYEE_STATUSES).default("ACTIVE"),
  employmentType: z.enum(["employee", "contractor"]).optional().nullable(),
  hireDate: optDate,
  licenseNumber: optStr(60),
  licenseClass: optStr(40),
  licenseExpiresAt: optDate,
  internalNotes: optStr(4000),
});

function employeeData(input: Partial<z.infer<typeof employeeInput>>): Prisma.EmployeeUncheckedUpdateInput {
  const { hireDate, licenseExpiresAt, ...rest } = input;
  return { ...rest, hireDate: parseDate(hireDate), licenseExpiresAt: parseDate(licenseExpiresAt) };
}

/* -------------------------------- Employees -------------------------------- */

adminRouter.get(
  "/",
  READ,
  asyncHandler(async (req, res) => {
    const f = z
      .object({ role: z.enum(EMPLOYEE_ROLES).optional(), market: z.string().max(60).optional(), status: z.enum(EMPLOYEE_STATUSES).optional(), q: z.string().max(120).optional() })
      .parse(req.query);
    const where: Prisma.EmployeeWhereInput = {};
    if (f.role) where.role = f.role;
    if (f.market) where.homeMarket = f.market;
    if (f.status) where.status = f.status;
    if (f.q) {
      const q = f.q.trim();
      where.OR = [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }];
    }
    const soon = new Date(Date.now() + 30 * 86_400_000);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const rows = await prisma.employee.findMany({
      where,
      orderBy: [{ status: "asc" }, { lastName: "asc" }],
      include: {
        user: { select: { id: true, email: true, role: true, active: true } },
        _count: { select: { assignments: { where: { assignedAt: { gte: dayStart } } }, credentials: { where: { expiresAt: { lte: soon } } } } },
      },
    });
    res.json({
      ok: true,
      employees: rows.map((e) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        role: e.role,
        phone: e.phone,
        email: e.email,
        homeMarket: e.homeMarket,
        status: e.status,
        licenseExpiresAt: e.licenseExpiresAt,
        login: e.user,
        assignmentsToday: e._count.assignments,
        expiringCredentials: e._count.credentials + (e.licenseExpiresAt && e.licenseExpiresAt <= soon ? 1 : 0),
      })),
    });
  }),
);

adminRouter.post(
  "/",
  WRITE,
  asyncHandler(async (req, res) => {
    const input = employeeInput.parse(req.body);
    const e = await prisma.employee.create({ data: employeeData(input) as Prisma.EmployeeUncheckedCreateInput });
    await audit(req, "create", "employee", e.id, { role: e.role });
    res.status(201).json({ ok: true, employee: e });
  }),
);

/* ------------------------------ Availability ------------------------------- */
// (declared before "/:id" so "/availability" is not taken for an id)

const range = z.object({ from: z.string().min(8).max(30), to: z.string().min(8).max(30) });

/** All availability blocks in a window (week calendar, dispatch board). */
adminRouter.get(
  "/availability",
  READ,
  asyncHandler(async (req, res) => {
    const f = range.extend({ employeeId: z.string().max(40).optional() }).parse(req.query);
    const from = parseDate(f.from)!;
    const to = parseDate(f.to)!;
    const blocks = await prisma.availability.findMany({
      where: { startsAt: { lt: to }, endsAt: { gt: from }, ...(f.employeeId ? { employeeId: f.employeeId } : {}) },
      orderBy: { startsAt: "asc" },
    });
    res.json({ ok: true, blocks });
  }),
);

/** Conflict check used by dispatch: POST {employeeIds, start, end} → conflicts[] */
adminRouter.post(
  "/availability/check",
  READ,
  asyncHandler(async (req, res) => {
    const b = z.object({ employeeIds: z.array(z.string().max(40)).max(50), start: z.string(), end: z.string() }).parse(req.body);
    const start = parseDate(b.start)!;
    const end = parseDate(b.end)!;
    if (end <= start) throw new HttpError(400, "End must be after start.");
    res.json({ ok: true, conflicts: await availabilityConflicts(b.employeeIds, start, end) });
  }),
);

adminRouter.delete(
  "/availability/:blockId",
  SCHEDULE,
  asyncHandler(async (req, res) => {
    const block = await prisma.availability.delete({ where: { id: String(req.params.blockId) } }).catch(() => null);
    if (!block) throw new HttpError(404, "Not found.");
    await audit(req, "delete", "availability", block.id, { employeeId: block.employeeId });
    res.json({ ok: true });
  }),
);

/* ------------------------------- Credentials -------------------------------- */

const credentialInput = z.object({
  employeeId: z.string().max(40).optional().nullable(),
  vehicleId: z.string().max(40).optional().nullable(),
  facility: z.string().trim().min(1, "Required").max(60),
  type: z.enum(CREDENTIAL_TYPES),
  identifier: optStr(120),
  issuedAt: optDate,
  expiresAt: optDate,
  notes: optStr(2000),
});

/** Credentials register across employees, vehicles and company-level documents. */
adminRouter.get(
  "/credentials",
  READ,
  asyncHandler(async (req, res) => {
    const f = z
      .object({
        facility: z.string().max(60).optional(),
        type: z.enum(CREDENTIAL_TYPES).optional(),
        holder: z.enum(["employee", "vehicle", "company"]).optional(),
        within: z.coerce.number().int().min(0).max(3650).optional(),
        q: z.string().max(120).optional(),
      })
      .parse(req.query);
    const where: Prisma.CredentialWhereInput = {};
    if (f.facility) where.facility = f.facility;
    if (f.type) where.type = f.type;
    if (f.holder === "employee") where.employeeId = { not: null };
    if (f.holder === "vehicle") where.vehicleId = { not: null };
    if (f.holder === "company") where.AND = [{ employeeId: null }, { vehicleId: null }];
    if (f.within !== undefined) where.expiresAt = { lte: new Date(Date.now() + f.within * 86_400_000) };
    if (f.q) where.OR = [{ identifier: { contains: f.q, mode: "insensitive" } }, { notes: { contains: f.q, mode: "insensitive" } }, { facility: { contains: f.q, mode: "insensitive" } }];
    const rows = await prisma.credential.findMany({
      where,
      orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }],
      include: { employee: { select: { id: true, firstName: true, lastName: true } }, vehicle: { select: { id: true, unitNumber: true } } },
      take: 500,
    });
    const facilities = await prisma.credential.findMany({ distinct: ["facility"], select: { facility: true }, orderBy: { facility: "asc" } });
    res.json({ ok: true, credentials: rows, facilities: facilities.map((x) => x.facility) });
  }),
);

adminRouter.post(
  "/credentials",
  WRITE,
  asyncHandler(async (req, res) => {
    const input = credentialInput.parse(req.body);
    if (input.employeeId && input.vehicleId) throw new HttpError(400, "A credential belongs to a person OR a vehicle (or the company), not both.");
    const c = await prisma.credential.create({
      data: { ...input, employeeId: input.employeeId || null, vehicleId: input.vehicleId || null, issuedAt: parseDate(input.issuedAt), expiresAt: parseDate(input.expiresAt) },
    });
    await audit(req, "create", "credential", c.id, { type: c.type, facility: c.facility });
    res.status(201).json({ ok: true, credential: c });
  }),
);

adminRouter.patch(
  "/credentials/:credId",
  WRITE,
  asyncHandler(async (req, res) => {
    const input = credentialInput.partial().parse(req.body);
    const c = await prisma.credential
      .update({
        where: { id: String(req.params.credId) },
        data: { ...input, issuedAt: parseDate(input.issuedAt), expiresAt: parseDate(input.expiresAt) },
      })
      .catch(() => null);
    if (!c) throw new HttpError(404, "Credential not found.");
    await audit(req, "update", "credential", c.id, { fields: Object.keys(input) });
    res.json({ ok: true, credential: c });
  }),
);

adminRouter.delete(
  "/credentials/:credId",
  WRITE,
  asyncHandler(async (req, res) => {
    const c = await prisma.credential.delete({ where: { id: String(req.params.credId) } }).catch(() => null);
    if (!c) throw new HttpError(404, "Credential not found.");
    await audit(req, "delete", "credential", c.id, { type: c.type, facility: c.facility });
    res.json({ ok: true });
  }),
);

/** Attach a scan/copy of the credential (multipart field "file"). */
adminRouter.post(
  "/credentials/:credId/file",
  WRITE,
  asyncHandler(async (req, res) => {
    const id = String(req.params.credId);
    if (!(await prisma.credential.findUnique({ where: { id } }))) throw new HttpError(404, "Credential not found.");
    const { uploadId } = await receiveFile(req, { kind: "credential-doc", ownerType: "credential", ownerId: id });
    await prisma.credential.update({ where: { id }, data: { uploadId } });
    await audit(req, "upload", "credential", id, { uploadId });
    res.status(201).json({ ok: true, uploadId });
  }),
);

/* -------------------------------- Reminders --------------------------------- */

adminRouter.get(
  "/reminders/upcoming",
  READ,
  asyncHandler(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(60) }).parse(req.query);
    const items = await upcomingExpirations(days);
    res.json({ ok: true, items, overdue: items.filter((i) => i.daysLeft < 0).length, within30: items.filter((i) => i.daysLeft >= 0 && i.daysLeft <= 30).length });
  }),
);

adminRouter.post(
  "/reminders/run",
  WRITE,
  asyncHandler(async (req, res) => {
    const result = await runReminders();
    await audit(req, "run", "reminders", undefined, result);
    res.json({ ok: true, ...result });
  }),
);

/* ------------------------------ Private files -------------------------------- */

adminRouter.get(
  "/files/:uploadId",
  READ,
  asyncHandler(async (req, res) => {
    await audit(req, "download", "upload", String(req.params.uploadId));
    await sendResourceFile(req, res, String(req.params.uploadId));
  }),
);

/* ----------------------------- Employee detail ------------------------------ */

adminRouter.get(
  "/:id",
  READ,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const from = new Date(Date.now() - 7 * 86_400_000);
    const e = await prisma.employee.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, role: true, active: true, lastLoginAt: true, totpEnabled: true } },
        credentials: { orderBy: { expiresAt: { sort: "asc", nulls: "last" } } },
        documents: { orderBy: { createdAt: "desc" } },
        availability: { where: { endsAt: { gte: from } }, orderBy: { startsAt: "asc" }, take: 200 },
        assignments: {
          orderBy: { assignedAt: "desc" },
          take: 50,
          include: { order: { select: { id: true, reference: true, serviceDate: true, status: true, market: true, serviceType: true } }, vehicle: { select: { id: true, unitNumber: true } } },
        },
      },
    });
    if (!e) throw new HttpError(404, "Team member not found.");
    res.json({ ok: true, employee: e });
  }),
);

adminRouter.patch(
  "/:id",
  WRITE,
  asyncHandler(async (req, res) => {
    const input = employeeInput.partial().parse(req.body);
    const e = await prisma.employee.update({ where: { id: String(req.params.id) }, data: employeeData(input) }).catch(() => null);
    if (!e) throw new HttpError(404, "Team member not found.");
    // Deactivating a person also blocks their app login
    if (input.status === "INACTIVE" && e.userId) await prisma.user.update({ where: { id: e.userId }, data: { active: false, tokenVersion: { increment: 1 } } });
    await audit(req, "update", "employee", e.id, { fields: Object.keys(input) });
    res.json({ ok: true, employee: e });
  }),
);

adminRouter.post(
  "/:id/availability",
  SCHEDULE,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const b = z
      .object({ kind: z.enum(AVAILABILITY_KINDS), startsAt: z.string().min(8), endsAt: z.string().min(8), note: optStr(300), repeatDays: z.coerce.number().int().min(0).max(31).default(0) })
      .parse(req.body);
    const start = parseDate(b.startsAt)!;
    const end = parseDate(b.endsAt)!;
    if (end <= start) throw new HttpError(400, "End must be after start.", [{ path: "endsAt", message: "End must be after start" }]);
    if (end.getTime() - start.getTime() > 31 * 86_400_000) throw new HttpError(400, "Blocks are limited to 31 days.");
    if (!(await prisma.employee.findUnique({ where: { id } }))) throw new HttpError(404, "Team member not found.");
    // Optional daily repeat (e.g. the same shift for the next 5 days)
    const data = Array.from({ length: b.repeatDays + 1 }, (_, i) => ({
      employeeId: id,
      kind: b.kind,
      startsAt: new Date(start.getTime() + i * 86_400_000),
      endsAt: new Date(end.getTime() + i * 86_400_000),
      note: b.note,
    }));
    await prisma.availability.createMany({ data });
    await audit(req, "create", "availability", id, { kind: b.kind, count: data.length });
    res.status(201).json({ ok: true, created: data.length });
  }),
);

/* -------------------------------- Documents --------------------------------- */

adminRouter.post(
  "/:id/documents",
  WRITE,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    if (!(await prisma.employee.findUnique({ where: { id } }))) throw new HttpError(404, "Team member not found.");
    const { uploadId, fields, originalName } = await receiveFile(req, { kind: "employee-doc", ownerType: "employee", ownerId: id });
    const title = (fields.title || originalName).trim().slice(0, 120);
    const doc = await prisma.employeeDocument.create({ data: { employeeId: id, title, uploadId, expiresAt: parseDate(fields.expiresAt || undefined) ?? null } });
    await audit(req, "upload", "employee-document", doc.id, { employeeId: id, title });
    res.status(201).json({ ok: true, document: doc });
  }),
);

adminRouter.delete(
  "/:id/documents/:docId",
  WRITE,
  asyncHandler(async (req, res) => {
    const doc = await prisma.employeeDocument.findFirst({ where: { id: String(req.params.docId), employeeId: String(req.params.id) } });
    if (!doc) throw new HttpError(404, "Document not found.");
    await prisma.employeeDocument.delete({ where: { id: doc.id } });
    await audit(req, "delete", "employee-document", doc.id, { employeeId: doc.employeeId, title: doc.title });
    res.json({ ok: true });
  }),
);

/* ------------------------------- Login link --------------------------------- */

/** Creates (or links) a staff login for this person and emails an invite to set a password. */
adminRouter.post(
  "/:id/login",
  requireRole(), // OWNER only: creating credentials is a security action
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const b = z.object({ email: z.string().trim().email(), role: z.enum(["DRIVER", "DISPATCHER", "STAFF", "ACCOUNTING"]).default("DRIVER") }).parse(req.body);
    const e = await prisma.employee.findUnique({ where: { id } });
    if (!e) throw new HttpError(404, "Team member not found.");
    if (e.userId) throw new HttpError(409, "This person already has a login.");
    const email = b.email.toLowerCase();
    let user = await prisma.user.findUnique({ where: { email }, include: { employee: true } });
    if (user?.employee) throw new HttpError(409, "That email is already linked to another team member.");
    if (!user) {
      user = await prisma.user.create({
        data: { email, name: `${e.firstName} ${e.lastName}`, role: b.role, passwordHash: await hashPassword(randomBytes(24).toString("hex")), mustChangePassword: true },
        include: { employee: true },
      });
    }
    await prisma.employee.update({ where: { id }, data: { userId: user.id, email: e.email ?? email } });
    const token = await createAuthToken("invite", "user", user.id, 60 * 72);
    const link = `${webBaseUrl()}/admin/reset-password?token=${encodeURIComponent(token)}`;
    const appName = b.role === "DRIVER" ? "the Express Bags driver app" : "the Express Bags admin";
    await sendMail({
      to: email,
      subject: "Your Express Bags account",
      text: `An account was created for you on ${appName}.\n\nSet your password (link valid for 72 hours, single use):\n${link}`,
      html: brandedHtml("Your Express Bags account", [`An account was created for you on ${appName}.`, `Set your password here (valid for 72 hours, single use): ${link}`]),
    });
    await audit(req, "create-login", "employee", id, { userId: user.id, role: b.role });
    res.status(201).json({ ok: true, userId: user.id });
  }),
);

adminRouter.delete(
  "/:id/login",
  requireRole(),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const e = await prisma.employee.findUnique({ where: { id } });
    if (!e?.userId) throw new HttpError(404, "No login linked.");
    if (e.userId === req.user!.id) throw new HttpError(400, "You cannot remove your own login.");
    await prisma.user.update({ where: { id: e.userId }, data: { active: false, tokenVersion: { increment: 1 } } });
    await prisma.employee.update({ where: { id }, data: { userId: null } });
    await audit(req, "remove-login", "employee", id, { userId: e.userId });
    res.json({ ok: true });
  }),
);

export const platformModule: PlatformModule = {
  name: "team",
  routes: [{ scope: "admin", path: "/team", router: adminRouter }],
};
