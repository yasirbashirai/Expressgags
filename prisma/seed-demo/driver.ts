/**
 * Demo data for the driver app: a DRIVER login linked to an employee profile, plus (optionally) one
 * demo job for today assigned to that driver so the app is not empty during a walkthrough.
 *
 *   npx tsx prisma/seed-demo/driver.ts          (standalone)
 *   import { seedDriver } from "./seed-demo/driver"  (from a combined demo seed)
 *
 * Password: DEMO_DRIVER_PASSWORD, or a random one printed once. Demo data only, never production.
 */
import { randomBytes } from "node:crypto";
import "../../src/server/lib/env";
import { hashPassword } from "../../src/server/auth";
import type { PrismaClient } from "../../src/server/generated/prisma/client";
import { createOrder } from "../../src/server/services/orders";

export const DEMO_DRIVER_EMAIL = process.env.DEMO_DRIVER_EMAIL || "driver.demo@example.com";

export async function seedDriver(prisma: PrismaClient, opts: { withJob?: boolean } = {}) {
  const password = process.env.DEMO_DRIVER_PASSWORD || `Driver-${randomBytes(4).toString("hex")}!`;
  const existing = await prisma.user.findUnique({ where: { email: DEMO_DRIVER_EMAIL } });
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { role: "DRIVER", active: true, passwordHash: await hashPassword(password) } })
    : await prisma.user.create({ data: { email: DEMO_DRIVER_EMAIL, name: "Demo Driver", role: "DRIVER", passwordHash: await hashPassword(password) } });
  const employee =
    (await prisma.employee.findUnique({ where: { userId: user.id } })) ??
    (await prisma.employee.create({ data: { userId: user.id, firstName: "Demo", lastName: "Driver", role: "DRIVER", homeMarket: "miami", status: "ACTIVE" } }));

  let reference: string | null = null;
  if (opts.withJob !== false) {
    const customer =
      (await prisma.customer.findUnique({ where: { email: "demo.guest@example.com" } })) ??
      (await prisma.customer.create({ data: { name: "Demo Guest", email: "demo.guest@example.com", phone: "305-555-0110" } }));
    const order = await createOrder(
      {
        customerId: customer.id,
        serviceType: "cruise",
        pickup: { type: "hotel", address: "Hotel lobby, Biscayne Blvd, Miami, FL 33132", market: "miami", contact: "Bell desk 305-555-0123" },
        delivery: { type: "cruise-port", address: "PortMiami Cruise Terminal", facility: "portmiami", market: "miami" },
        serviceDate: new Date(),
        timeWindow: "morning",
        market: "miami",
        priority: "VIP",
        specialHandling: "Garment bag must stay flat",
        accessNotes: "Use the hotel loading dock on NE 6th St",
        pieces: [{ category: "large" }, { category: "standard-checked" }, { category: "standard-checked" }, { category: "carry-on" }],
      },
      { type: "system", name: "Demo seed" },
    );
    await prisma.assignment.create({ data: { orderId: order.id, employeeId: employee.id, role: "DRIVER", sequence: 1 } });
    reference = order.reference;
  }

  console.info(`Demo driver: ${DEMO_DRIVER_EMAIL} / ${password}${reference ? ` · demo job ${reference}` : ""}`);
  return { user, employee, password, reference };
}

// Standalone run
if (process.argv[1]?.endsWith("driver.ts")) {
  void (async () => {
    const { prisma } = await import("../../src/server/db");
    await seedDriver(prisma);
    process.exit(0);
  })();
}
