/**
 * Test fixtures for the driver module: a DRIVER user + employee, an order for today with pieces,
 * and an assignment. Used by the Vitest API tests and the Playwright e2e fixture script.
 */
import { randomBytes } from "node:crypto";
import { hashPassword } from "../../../auth";
import { prisma } from "../../../db";
import { createOrder } from "../../../services/orders";

export const FIXTURE_PASSWORD = "Driver-Test-Pass-2026!";

export async function createDriver(tag = randomBytes(3).toString("hex")) {
  const user = await prisma.user.create({
    data: { email: `driver-${tag}@test.local`, name: `Test Driver ${tag}`, role: "DRIVER", passwordHash: await hashPassword(FIXTURE_PASSWORD) },
  });
  const employee = await prisma.employee.create({ data: { userId: user.id, firstName: "Dana", lastName: `Tester-${tag}`, role: "DRIVER", homeMarket: "miami" } });
  return { user, employee };
}

export async function createAssignedJob(employeeId: string, opts: { pieces?: number; tag?: string } = {}) {
  const tag = opts.tag ?? randomBytes(3).toString("hex");
  const customer = await prisma.customer.create({ data: { name: `Driver Fixture ${tag}`, email: `driver-fixture-${tag}@example.org`, phone: "305-555-0142" } });
  const order = await createOrder({
    customerId: customer.id,
    serviceType: "luggage-local",
    pickup: { type: "hotel", address: "Hotel lobby, Collins Ave, Miami Beach, FL 33139", market: "miami", contact: "Bell desk 305-555-0199" },
    delivery: { type: "cruise-port", address: "PortMiami Terminal B", facility: "portmiami", market: "miami" },
    serviceDate: new Date(),
    timeWindow: "morning",
    market: "miami",
    priority: "VIP",
    specialHandling: "Two garment bags, keep upright",
    accessNotes: "Loading zone on 21st St, 10 minute limit",
    pieces: Array.from({ length: opts.pieces ?? 3 }, (_, i) => ({ category: i === 0 ? "large" : "standard-checked" })),
  });
  const assignment = await prisma.assignment.create({ data: { orderId: order.id, employeeId, role: "DRIVER", sequence: 1 } });
  return { customer, order, assignment };
}

/** Removes everything a fixture created (tests clean up after themselves). */
export async function cleanupFixture(ids: { userIds?: string[]; employeeIds?: string[]; customerIds?: string[] }) {
  const orders = await prisma.order.findMany({ where: { customerId: { in: ids.customerIds ?? [] } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await prisma.driverActionLog.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { userId: { in: ids.userIds ?? [] } }] } });
  await prisma.upload.deleteMany({ where: { ownerType: "order", ownerId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } }); // cascades events, pieces, proofs, exceptions, assignments
  await prisma.customer.deleteMany({ where: { id: { in: ids.customerIds ?? [] } } });
  await prisma.employee.deleteMany({ where: { id: { in: ids.employeeIds ?? [] } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids.userIds ?? [] } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.userIds ?? [] } } });
}
