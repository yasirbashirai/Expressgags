/**
 * Module "fleet" — Fleet Management (Carlos req. #2): vehicle profiles, availability status, maintenance
 * scheduling + history + costs, registration / insurance / inspection expirations, documents, photos,
 * fleet report and CSV export. Mounted at /v1/admin/fleet.
 * Read: OWNER / STAFF / DISPATCHER · Write: OWNER / STAFF (status changes also DISPATCHER).
 */
import { Router } from "express";
import { z } from "zod";
import { audit, requireRole } from "../../auth";
import { prisma } from "../../db";
import type { Prisma } from "../../generated/prisma/client";
import { asyncHandler, HttpError } from "../../lib/errors";
import { parseDate, receiveFile, sendResourceFile } from "../team/files";
import type { PlatformModule } from "../types";

export const adminRouter = Router();

const READ = requireRole("STAFF", "DISPATCHER");
const WRITE = requireRole("STAFF");
const STATUS_WRITE = requireRole("STAFF", "DISPATCHER");

export const VEHICLE_CLASSES = ["cargo-van", "box-15", "box-20", "box-26"] as const;
export const VEHICLE_STATUSES = ["AVAILABLE", "IN_SERVICE", "MAINTENANCE", "OUT_OF_SERVICE"] as const;

const optStr = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optDate = z.union([z.string(), z.null()]).optional();
const optInt = (max: number) => z.union([z.coerce.number().int().min(0).max(max), z.null(), z.literal("")]).optional().transform((v) => (v === "" ? null : v));

const vehicleInput = z.object({
  unitNumber: z.string().trim().min(1, "Required").max(30),
  vehicleClassCode: z.enum(VEHICLE_CLASSES),
  make: optStr(60),
  model: optStr(60),
  year: optInt(2100),
  plate: optStr(20),
  vin: optStr(17),
  homeMarket: optStr(60),
  status: z.enum(VEHICLE_STATUSES).default("AVAILABLE"),
  odometer: optInt(5_000_000),
  registrationExpiresAt: optDate,
  insuranceExpiresAt: optDate,
  inspectionExpiresAt: optDate,
  notes: optStr(4000),
});

function vehicleData(input: Partial<z.infer<typeof vehicleInput>>): Prisma.VehicleUncheckedUpdateInput {
  const { registrationExpiresAt, insuranceExpiresAt, inspectionExpiresAt, ...rest } = input;
  return {
    ...rest,
    registrationExpiresAt: parseDate(registrationExpiresAt),
    insuranceExpiresAt: parseDate(insuranceExpiresAt),
    inspectionExpiresAt: parseDate(inspectionExpiresAt),
  };
}

const uniqueUnit = (e: unknown) => {
  if ((e as { code?: string })?.code === "P2002") throw new HttpError(409, "That unit number is already used.", [{ path: "unitNumber", message: "Already used" }]);
  throw e;
};

/* --------------------------------- Vehicles --------------------------------- */

adminRouter.get(
  "/",
  READ,
  asyncHandler(async (req, res) => {
    const f = z
      .object({ status: z.enum(VEHICLE_STATUSES).optional(), class: z.enum(VEHICLE_CLASSES).optional(), market: z.string().max(60).optional(), q: z.string().max(120).optional() })
      .parse(req.query);
    const where: Prisma.VehicleWhereInput = {};
    if (f.status) where.status = f.status;
    if (f.class) where.vehicleClassCode = f.class;
    if (f.market) where.homeMarket = f.market;
    if (f.q) where.OR = [{ unitNumber: { contains: f.q, mode: "insensitive" } }, { plate: { contains: f.q, mode: "insensitive" } }, { make: { contains: f.q, mode: "insensitive" } }, { model: { contains: f.q, mode: "insensitive" } }];
    const vehicles = await prisma.vehicle.findMany({
      where,
      orderBy: { unitNumber: "asc" },
      include: { maintenance: { where: { status: "SCHEDULED" }, orderBy: { scheduledFor: "asc" }, take: 1 } },
    });
    res.json({ ok: true, vehicles: vehicles.map(({ maintenance, ...v }) => ({ ...v, nextMaintenance: maintenance[0] ?? null })) });
  }),
);

/** Fleet report: status mix, class mix, upcoming expirations, maintenance spend. */
adminRouter.get(
  "/report",
  READ,
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const in60 = new Date(now.getTime() + 60 * 86_400_000);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const last12 = new Date(now.getTime() - 365 * 86_400_000);
    const [byStatus, byClass, expiring, spendYtd, spend12, upcoming, monthly] = await Promise.all([
      prisma.vehicle.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.vehicle.groupBy({ by: ["vehicleClassCode"], _count: { _all: true } }),
      prisma.vehicle.findMany({
        where: { OR: [{ registrationExpiresAt: { lte: in60 } }, { insuranceExpiresAt: { lte: in60 } }, { inspectionExpiresAt: { lte: in60 } }] },
        select: { id: true, unitNumber: true, registrationExpiresAt: true, insuranceExpiresAt: true, inspectionExpiresAt: true },
      }),
      prisma.maintenanceRecord.aggregate({ where: { status: "COMPLETED", completedAt: { gte: yearStart } }, _sum: { costCents: true }, _count: { _all: true } }),
      prisma.maintenanceRecord.aggregate({ where: { status: "COMPLETED", completedAt: { gte: last12 } }, _sum: { costCents: true } }),
      prisma.maintenanceRecord.findMany({ where: { status: "SCHEDULED" }, orderBy: { scheduledFor: "asc" }, take: 10, include: { vehicle: { select: { id: true, unitNumber: true } } } }),
      prisma.maintenanceRecord.findMany({ where: { status: "COMPLETED", completedAt: { gte: last12 } }, select: { completedAt: true, costCents: true, vehicleId: true } }),
    ]);
    // Spend per vehicle (last 12 months)
    const perVehicle: Record<string, number> = {};
    for (const m of monthly) perVehicle[m.vehicleId] = (perVehicle[m.vehicleId] ?? 0) + (m.costCents ?? 0);
    res.json({
      ok: true,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      byClass: Object.fromEntries(byClass.map((r) => [r.vehicleClassCode, r._count._all])),
      expiring,
      maintenanceSpendYtdCents: spendYtd._sum.costCents ?? 0,
      maintenanceJobsYtd: spendYtd._count._all,
      maintenanceSpend12mCents: spend12._sum.costCents ?? 0,
      spendPerVehicleCents: perVehicle,
      upcomingMaintenance: upcoming,
    });
  }),
);

/** CSV export of the fleet (for insurance renewals, audits). */
adminRouter.get(
  "/export.csv",
  READ,
  asyncHandler(async (req, res) => {
    const vehicles = await prisma.vehicle.findMany({ orderBy: { unitNumber: "asc" } });
    const cell = (v: unknown) => {
      const s = v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v);
      return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s;
    };
    const cols = ["unitNumber", "vehicleClassCode", "status", "make", "model", "year", "plate", "vin", "homeMarket", "odometer", "registrationExpiresAt", "insuranceExpiresAt", "inspectionExpiresAt"] as const;
    const csv = [cols.join(","), ...vehicles.map((v) => cols.map((c) => cell(v[c])).join(","))].join("\n");
    await audit(req, "export", "fleet", undefined, { rows: vehicles.length });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="express-bags-fleet-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }),
);

adminRouter.post(
  "/",
  WRITE,
  asyncHandler(async (req, res) => {
    const input = vehicleInput.parse(req.body);
    const v = await prisma.vehicle.create({ data: vehicleData(input) as Prisma.VehicleUncheckedCreateInput }).catch(uniqueUnit);
    await audit(req, "create", "vehicle", v.id, { unitNumber: v.unitNumber });
    res.status(201).json({ ok: true, vehicle: v });
  }),
);

adminRouter.get(
  "/files/:uploadId",
  READ,
  asyncHandler(async (req, res) => {
    await sendResourceFile(req, res, String(req.params.uploadId));
  }),
);

adminRouter.get(
  "/:id",
  READ,
  asyncHandler(async (req, res) => {
    const v = await prisma.vehicle.findUnique({
      where: { id: String(req.params.id) },
      include: {
        maintenance: { orderBy: [{ status: "desc" }, { scheduledFor: "desc" }], take: 100 },
        documents: { orderBy: { createdAt: "desc" } },
        credentials: { orderBy: { expiresAt: { sort: "asc", nulls: "last" } } },
        assignments: {
          orderBy: { assignedAt: "desc" },
          take: 30,
          include: { order: { select: { id: true, reference: true, serviceDate: true, status: true } }, employee: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!v) throw new HttpError(404, "Vehicle not found.");
    res.json({ ok: true, vehicle: v });
  }),
);

adminRouter.patch(
  "/:id",
  STATUS_WRITE,
  asyncHandler(async (req, res) => {
    const input = vehicleInput.partial().parse(req.body);
    // Dispatchers may only change status / odometer (e.g. take a truck out for repair)
    if (req.user!.role === "DISPATCHER" && Object.keys(input).some((k) => !["status", "odometer"].includes(k))) {
      throw new HttpError(403, "Dispatchers can change a vehicle's status and odometer only.");
    }
    const v = await prisma.vehicle.update({ where: { id: String(req.params.id) }, data: vehicleData(input) }).catch((e) => {
      if ((e as { code?: string })?.code === "P2025") throw new HttpError(404, "Vehicle not found.");
      return uniqueUnit(e);
    });
    await audit(req, "update", "vehicle", v.id, { fields: Object.keys(input) });
    res.json({ ok: true, vehicle: v });
  }),
);

/* ------------------------------- Maintenance -------------------------------- */

const maintenanceInput = z.object({
  type: z.string().trim().min(2, "Describe the work").max(120),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).default("SCHEDULED"),
  scheduledFor: optDate,
  completedAt: optDate,
  odometer: optInt(5_000_000),
  costCents: optInt(100_000_000),
  vendor: optStr(120),
  notes: optStr(2000),
});

adminRouter.post(
  "/:id/maintenance",
  WRITE,
  asyncHandler(async (req, res) => {
    const vehicleId = String(req.params.id);
    const m = maintenanceInput.parse(req.body);
    if (!(await prisma.vehicle.findUnique({ where: { id: vehicleId } }))) throw new HttpError(404, "Vehicle not found.");
    const completedAt = m.status === "COMPLETED" ? parseDate(m.completedAt) ?? new Date() : parseDate(m.completedAt) ?? null;
    const rec = await prisma.maintenanceRecord.create({
      data: { ...m, vehicleId, scheduledFor: parseDate(m.scheduledFor) ?? null, completedAt },
    });
    if (m.status === "COMPLETED" && m.odometer) await prisma.vehicle.update({ where: { id: vehicleId }, data: { odometer: m.odometer } });
    await audit(req, "create", "maintenance", rec.id, { vehicleId, type: rec.type, status: rec.status });
    res.status(201).json({ ok: true, maintenance: rec });
  }),
);

adminRouter.patch(
  "/:id/maintenance/:mid",
  WRITE,
  asyncHandler(async (req, res) => {
    const m = maintenanceInput.partial().parse(req.body);
    const existing = await prisma.maintenanceRecord.findFirst({ where: { id: String(req.params.mid), vehicleId: String(req.params.id) } });
    if (!existing) throw new HttpError(404, "Maintenance record not found.");
    const completing = m.status === "COMPLETED" && existing.status !== "COMPLETED";
    const rec = await prisma.maintenanceRecord.update({
      where: { id: existing.id },
      data: { ...m, scheduledFor: parseDate(m.scheduledFor), completedAt: completing ? parseDate(m.completedAt) ?? new Date() : parseDate(m.completedAt) },
    });
    if (completing && m.odometer) await prisma.vehicle.update({ where: { id: existing.vehicleId }, data: { odometer: m.odometer } });
    await audit(req, "update", "maintenance", rec.id, { fields: Object.keys(m) });
    res.json({ ok: true, maintenance: rec });
  }),
);

adminRouter.delete(
  "/:id/maintenance/:mid",
  WRITE,
  asyncHandler(async (req, res) => {
    const existing = await prisma.maintenanceRecord.findFirst({ where: { id: String(req.params.mid), vehicleId: String(req.params.id) } });
    if (!existing) throw new HttpError(404, "Maintenance record not found.");
    await prisma.maintenanceRecord.delete({ where: { id: existing.id } });
    await audit(req, "delete", "maintenance", existing.id, { vehicleId: existing.vehicleId, type: existing.type });
    res.json({ ok: true });
  }),
);

/* --------------------------- Documents & photo ------------------------------ */

adminRouter.post(
  "/:id/documents",
  WRITE,
  asyncHandler(async (req, res) => {
    const vehicleId = String(req.params.id);
    if (!(await prisma.vehicle.findUnique({ where: { id: vehicleId } }))) throw new HttpError(404, "Vehicle not found.");
    const { uploadId, fields, originalName } = await receiveFile(req, { kind: "vehicle-doc", ownerType: "vehicle", ownerId: vehicleId });
    const title = (fields.title || originalName).trim().slice(0, 120);
    const expiresAt = parseDate(fields.expiresAt || undefined) ?? null;
    const doc = await prisma.vehicleDocument.create({ data: { vehicleId, title, uploadId, expiresAt } });
    // Keep the profile's expiry fields in step with uploaded registration / insurance / inspection documents
    const kind = (fields.docType || "").toLowerCase();
    if (expiresAt && ["registration", "insurance", "inspection"].includes(kind)) {
      await prisma.vehicle.update({ where: { id: vehicleId }, data: { [`${kind}ExpiresAt`]: expiresAt } });
    }
    await audit(req, "upload", "vehicle-document", doc.id, { vehicleId, title });
    res.status(201).json({ ok: true, document: doc });
  }),
);

adminRouter.delete(
  "/:id/documents/:docId",
  WRITE,
  asyncHandler(async (req, res) => {
    const doc = await prisma.vehicleDocument.findFirst({ where: { id: String(req.params.docId), vehicleId: String(req.params.id) } });
    if (!doc) throw new HttpError(404, "Document not found.");
    await prisma.vehicleDocument.delete({ where: { id: doc.id } });
    await audit(req, "delete", "vehicle-document", doc.id, { vehicleId: doc.vehicleId });
    res.json({ ok: true });
  }),
);

adminRouter.post(
  "/:id/photo",
  WRITE,
  asyncHandler(async (req, res) => {
    const vehicleId = String(req.params.id);
    if (!(await prisma.vehicle.findUnique({ where: { id: vehicleId } }))) throw new HttpError(404, "Vehicle not found.");
    const { uploadId } = await receiveFile(req, { kind: "vehicle-photo", ownerType: "vehicle", ownerId: vehicleId });
    const up = await prisma.upload.findUnique({ where: { id: uploadId } });
    if (!up?.mimeType.startsWith("image/")) throw new HttpError(415, "Use a JPG, PNG or WEBP photo.");
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { photoUploadId: uploadId } });
    await audit(req, "upload", "vehicle-photo", vehicleId, { uploadId });
    res.status(201).json({ ok: true, uploadId });
  }),
);

export const platformModule: PlatformModule = {
  name: "fleet",
  routes: [{ scope: "admin", path: "/fleet", router: adminRouter }],
};
