/**
 * Module "dispatch" — /v1/admin/dispatch
 *   GET    /board?date=YYYY-MM-DD      unassigned jobs + one lane per active driver/helper + vehicles + day stats
 *   POST   /check                      preview conflicts for a proposed assignment (no writes)
 *   POST   /assign                     assign employee (+ vehicle) to an order; DRIVER assignment moves order to DRIVER_ASSIGNED
 *   DELETE /assignments/:id            remove an assignment (order returns to CONFIRMED when no driver remains)
 *   POST   /reorder                    set the stop sequence for one employee's day
 * Conflict warnings never block: the dispatcher decides, and the warnings are recorded on the timeline.
 */
import { Router } from "express";
import { z } from "zod";
import { audit, requireAuth, requireRole } from "../../auth";
import { prisma } from "../../db";
import { emit } from "../../lib/events";
import { asyncHandler, HttpError } from "../../lib/errors";
import { addOrderEvent, transitionOrder } from "../../services/orders";
import type { PlatformModule } from "../types";
import { employeeConflicts, orderWindow, routeFacilities, vehicleConflicts, type Conflict, type EmployeeCtx, type JobCtx, type VehicleCtx } from "./conflicts";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("STAFF", "DISPATCHER"));

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const dayBounds = (d: string) => ({ start: new Date(`${d}T00:00:00`), end: new Date(`${d}T23:59:59.999`) });

type OrderForCtx = {
  id: string;
  reference: string;
  serviceDate: Date;
  timeWindow: string | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  pickup: unknown;
  delivery: unknown;
  extraStops: unknown;
  pieces: { weightLbs: number | null }[];
};

const toJob = (o: OrderForCtx): JobCtx => ({
  orderId: o.id,
  reference: o.reference,
  window: orderWindow(o),
  facilities: routeFacilities([o.pickup, o.delivery, ...(Array.isArray(o.extraStops) ? o.extraStops : [])]),
  pieces: o.pieces.length,
  totalWeightLbs: o.pieces.reduce((s, p) => s + (p.weightLbs ?? 0), 0),
});

const orderCtxSelect = {
  id: true, reference: true, serviceDate: true, timeWindow: true, windowStart: true, windowEnd: true, pickup: true, delivery: true, extraStops: true,
  pieces: { select: { weightLbs: true } },
} as const;

/** Builds the conflict context for one employee/vehicle on the order's service day. */
async function conflictsFor(orderId: string, employeeId?: string, vehicleId?: string): Promise<Conflict[]> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: orderCtxSelect });
  if (!order) throw new HttpError(404, "Order not found.");
  const job = toJob(order);
  const day = order.serviceDate.toISOString().slice(0, 10);
  const { start, end } = dayBounds(day);
  const out: Conflict[] = [];

  if (employeeId) {
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        assignments: { where: { status: { not: "REMOVED" }, order: { serviceDate: { gte: start, lte: end }, status: { not: "CANCELLED" } } }, include: { order: { select: orderCtxSelect } } },
        availability: { where: { endsAt: { gte: start }, startsAt: { lte: end } } },
        credentials: { select: { facility: true, expiresAt: true } },
      },
    });
    if (!emp) throw new HttpError(404, "Team member not found.");
    const ctx: EmployeeCtx = {
      id: emp.id,
      name: `${emp.firstName} ${emp.lastName}`,
      status: emp.status,
      jobs: emp.assignments.map((a) => toJob(a.order)),
      availability: emp.availability,
      credentials: emp.credentials,
    };
    out.push(...employeeConflicts(job, ctx));
  }
  if (vehicleId) {
    const v = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { assignments: { where: { status: { not: "REMOVED" }, order: { serviceDate: { gte: start, lte: end }, status: { not: "CANCELLED" } } }, include: { order: { select: orderCtxSelect } } } },
    });
    if (!v) throw new HttpError(404, "Vehicle not found.");
    const cls = await prisma.vehicleClass.findUnique({ where: { code: v.vehicleClassCode } });
    const ctx: VehicleCtx = {
      id: v.id,
      unitNumber: v.unitNumber,
      status: v.status,
      classCode: v.vehicleClassCode,
      jobs: v.assignments.map((a) => toJob(a.order)),
      maxPieces: cls?.maxPieces ?? null,
      maxWeightLbs: cls?.maxWeightLbs ?? null,
      registrationExpiresAt: v.registrationExpiresAt,
      insuranceExpiresAt: v.insuranceExpiresAt,
    };
    // De-duplicate when the same vehicle already appears on this order's other assignment
    out.push(...vehicleConflicts(job, ctx));
  }
  return out;
}

adminRouter.get(
  "/board",
  asyncHandler(async (req, res) => {
    const date = dateSchema.parse(req.query.date ?? new Date().toISOString().slice(0, 10));
    const { start, end } = dayBounds(date);
    const [orders, employees, vehicles] = await Promise.all([
      prisma.order.findMany({
        where: { serviceDate: { gte: start, lte: end }, status: { not: "CANCELLED" } },
        include: {
          customer: { select: { name: true } },
          company: { select: { name: true } },
          pieces: { select: { weightLbs: true } },
          assignments: { where: { status: { not: "REMOVED" } }, include: { vehicle: { select: { id: true, unitNumber: true } } } },
          _count: { select: { exceptions: { where: { status: { not: "RESOLVED" } } } } },
        },
      }),
      prisma.employee.findMany({
        where: { status: "ACTIVE", role: { in: ["DRIVER", "HELPER"] } },
        orderBy: [{ role: "asc" }, { firstName: "asc" }],
        include: { availability: { where: { endsAt: { gte: start }, startsAt: { lte: end } } } },
      }),
      prisma.vehicle.findMany({ orderBy: { unitNumber: "asc" }, select: { id: true, unitNumber: true, vehicleClassCode: true, status: true, homeMarket: true } }),
    ]);

    const jobs = orders
      .map((o) => {
        const w = orderWindow(o);
        return {
          id: o.id,
          reference: o.reference,
          status: o.status,
          serviceType: o.serviceType,
          market: o.market,
          priority: o.priority,
          timeWindow: o.timeWindow,
          windowStart: w.start,
          windowEnd: w.end,
          pickup: o.pickup,
          delivery: o.delivery,
          guestName: o.guestName,
          customer: o.company?.name ?? o.customer.name,
          pieces: o.pieces.length,
          vehicleClassCode: o.vehicleClassCode,
          openExceptions: o._count.exceptions,
          assignments: o.assignments.map((a) => ({ id: a.id, employeeId: a.employeeId, role: a.role, sequence: a.sequence, vehicle: a.vehicle })),
        };
      })
      .sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime());

    const lanes = employees.map((e) => {
      const mine = jobs
        .filter((j) => j.assignments.some((a) => a.employeeId === e.id))
        .map((j) => ({ jobId: j.id, sequence: j.assignments.find((a) => a.employeeId === e.id)!.sequence, role: j.assignments.find((a) => a.employeeId === e.id)!.role }))
        .sort((a, b) => a.sequence - b.sequence);
      const blocked = e.availability.some((a) => a.kind === "UNAVAILABLE" || a.kind === "TIME_OFF");
      return { employee: { id: e.id, name: `${e.firstName} ${e.lastName}`, role: e.role, homeMarket: e.homeMarket }, unavailable: blocked, jobs: mine };
    });

    const unassigned = jobs.filter((j) => !j.assignments.some((a) => a.role === "DRIVER")).map((j) => j.id);
    const stats = {
      jobs: jobs.length,
      unassigned: unassigned.length,
      pieces: jobs.reduce((s, j) => s + j.pieces, 0),
      delivered: jobs.filter((j) => j.status === "DELIVERED").length,
      inProgress: jobs.filter((j) => ["EN_ROUTE", "PICKED_UP", "AT_FACILITY", "IN_TRANSIT", "OUT_FOR_DELIVERY", "TRANSFERRED_TO_CARRIER"].includes(j.status)).length,
      exceptions: jobs.reduce((s, j) => s + j.openExceptions, 0),
      driversWorking: lanes.filter((l) => l.jobs.length).length,
    };
    res.json({ ok: true, date, jobs, lanes, unassigned, vehicles, stats });
  }),
);

const assignSchema = z.object({
  orderId: z.string().min(1),
  employeeId: z.string().min(1),
  role: z.enum(["DRIVER", "HELPER", "SUPERVISOR"]).default("DRIVER"),
  vehicleId: z.string().min(1).nullable().optional(),
});

adminRouter.post(
  "/check",
  asyncHandler(async (req, res) => {
    const b = assignSchema.parse(req.body);
    res.json({ ok: true, conflicts: await conflictsFor(b.orderId, b.employeeId, b.vehicleId ?? undefined) });
  }),
);

adminRouter.post(
  "/assign",
  asyncHandler(async (req, res) => {
    const b = assignSchema.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: b.orderId }, select: { id: true, status: true, reference: true, serviceDate: true } });
    if (!order) throw new HttpError(404, "Order not found.");
    if (order.status === "DELIVERED" || order.status === "CANCELLED") throw new HttpError(409, "This order is closed.");
    const emp = await prisma.employee.findUnique({ where: { id: b.employeeId } });
    if (!emp) throw new HttpError(404, "Team member not found.");
    const conflicts = await conflictsFor(b.orderId, b.employeeId, b.vehicleId ?? undefined);
    const actor = { type: "user", id: req.user!.id, name: req.user!.name || req.user!.email };

    // Same employee re-assigned → update role/vehicle instead of duplicating
    const existing = await prisma.assignment.findFirst({ where: { orderId: b.orderId, employeeId: b.employeeId, status: { not: "REMOVED" } } });
    const { start, end } = dayBounds(order.serviceDate.toISOString().slice(0, 10));
    const nextSeq = (await prisma.assignment.count({ where: { employeeId: b.employeeId, status: { not: "REMOVED" }, order: { serviceDate: { gte: start, lte: end } } } })) + 1;
    const assignment = existing
      ? await prisma.assignment.update({ where: { id: existing.id }, data: { role: b.role, vehicleId: b.vehicleId ?? null } })
      : await prisma.assignment.create({ data: { orderId: b.orderId, employeeId: b.employeeId, role: b.role, vehicleId: b.vehicleId ?? null, sequence: nextSeq, assignedBy: actor.name } });

    await addOrderEvent({
      orderId: b.orderId,
      type: "NOTE",
      detail: `${b.role === "DRIVER" ? "Driver" : b.role === "HELPER" ? "Helper" : "Supervisor"} assigned: ${emp.firstName} ${emp.lastName}${conflicts.length ? ` (warnings: ${conflicts.map((c) => c.message).join(" ")})` : ""}`,
      actorType: "user",
      actorId: actor.id,
      actorName: actor.name,
    });
    if (b.role === "DRIVER") {
      // Only the first name is ever shown to the booked customer
      await prisma.order.update({ where: { id: b.orderId }, data: { assignedDriverRef: emp.id } });
      if (order.status === "CONFIRMED") await transitionOrder(b.orderId, "DRIVER_ASSIGNED", actor, { detail: "Driver assigned" });
    }
    await emit("order.assigned", { orderId: b.orderId, employeeId: b.employeeId, role: b.role });
    await audit(req, "assign", "order", b.orderId, { employeeId: b.employeeId, role: b.role, vehicleId: b.vehicleId, conflicts: conflicts.map((c) => c.code) });
    res.status(201).json({ ok: true, assignment, conflicts });
  }),
);

adminRouter.delete(
  "/assignments/:id",
  asyncHandler(async (req, res) => {
    const a = await prisma.assignment.findUnique({ where: { id: String(req.params.id) }, include: { employee: true, order: { select: { id: true, status: true, assignedDriverRef: true } } } });
    if (!a || a.status === "REMOVED") throw new HttpError(404, "Assignment not found.");
    const actor = { type: "user", id: req.user!.id, name: req.user!.name || req.user!.email };
    await prisma.assignment.update({ where: { id: a.id }, data: { status: "REMOVED" } });
    await addOrderEvent({ orderId: a.orderId, type: "NOTE", detail: `${a.role.toLowerCase()} unassigned: ${a.employee.firstName} ${a.employee.lastName}`, actorType: "user", actorId: actor.id, actorName: actor.name });
    if (a.role === "DRIVER") {
      const otherDriver = await prisma.assignment.findFirst({ where: { orderId: a.orderId, role: "DRIVER", status: { not: "REMOVED" } } });
      await prisma.order.update({ where: { id: a.orderId }, data: { assignedDriverRef: otherDriver?.employeeId ?? null } });
      if (!otherDriver && a.order.status === "DRIVER_ASSIGNED") await transitionOrder(a.orderId, "CONFIRMED", actor, { detail: "Driver unassigned, back in the dispatch queue" });
    }
    await audit(req, "unassign", "order", a.orderId, { assignmentId: a.id });
    res.json({ ok: true });
  }),
);

adminRouter.post(
  "/reorder",
  asyncHandler(async (req, res) => {
    const b = z.object({ employeeId: z.string().min(1), date: dateSchema, orderIds: z.array(z.string().min(1)).min(1).max(100) }).parse(req.body);
    const { start, end } = dayBounds(b.date);
    const rows = await prisma.assignment.findMany({ where: { employeeId: b.employeeId, status: { not: "REMOVED" }, order: { serviceDate: { gte: start, lte: end } } }, select: { id: true, orderId: true } });
    const byOrder = new Map(rows.map((r) => [r.orderId, r.id]));
    if (b.orderIds.some((id) => !byOrder.has(id))) throw new HttpError(400, "Every order in the new sequence must already be assigned to this team member that day.");
    await prisma.$transaction(b.orderIds.map((oid, i) => prisma.assignment.update({ where: { id: byOrder.get(oid)! }, data: { sequence: i + 1 } })));
    await audit(req, "reorder", "dispatch", b.employeeId, { date: b.date, orderIds: b.orderIds });
    res.json({ ok: true });
  }),
);

export const platformModule: PlatformModule = {
  name: "dispatch",
  routes: [{ scope: "admin", path: "/dispatch", router: adminRouter }],
};
