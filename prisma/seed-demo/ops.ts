/**
 * Demo operations data for development and client walkthroughs (NOT for production):
 * a small crew, a few vehicles and a realistic day of orders (hotel → PortMiami, MIA → hotel, a group
 * program, a courier run) for today and tomorrow. Names are fictional. Idempotent: demo rows carry
 * the "DEMO" marker and are replaced on each run.
 *
 * Run standalone: npx tsx prisma/seed-demo/ops.ts
 */
import type { PrismaClient } from "../../src/server/generated/prisma/client";

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(12, 0, 0, 0);
  return d;
};
const at = (base: Date, h: number, m = 0) => {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
};

export async function seedOps(prisma: PrismaClient) {
  // Remove previous demo rows (orders cascade to pieces/events/assignments)
  const old = await prisma.order.findMany({ where: { internalNotes: { startsWith: "DEMO" } }, select: { id: true } });
  await prisma.order.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  await prisma.assignment.deleteMany({ where: { employee: { internalNotes: { startsWith: "DEMO" } } } });
  await prisma.employee.deleteMany({ where: { internalNotes: { startsWith: "DEMO" } } });
  await prisma.vehicle.deleteMany({ where: { notes: { startsWith: "DEMO" } } });

  const crew = await Promise.all(
    [
      { firstName: "Marco", lastName: "Alvarez", role: "DRIVER", homeMarket: "miami" },
      { firstName: "Danielle", lastName: "Price", role: "DRIVER", homeMarket: "fort-lauderdale-broward" },
      { firstName: "Luis", lastName: "Ortega", role: "DRIVER", homeMarket: "miami" },
      { firstName: "Kayla", lastName: "Brooks", role: "HELPER", homeMarket: "miami" },
      { firstName: "Andre", lastName: "Simmons", role: "HELPER", homeMarket: "fort-lauderdale-broward" },
    ].map((e) => prisma.employee.create({ data: { ...e, phone: "305-555-01" + Math.floor(Math.random() * 90 + 10), internalNotes: "DEMO crew member (fictional)" } })),
  );
  await prisma.credential.create({ data: { employeeId: crew[0].id, facility: "portmiami", type: "PORT_PASS", expiresAt: day(240) } });
  await prisma.credential.create({ data: { employeeId: crew[0].id, facility: "MIA", type: "AIRPORT_BADGE", expiresAt: day(180) } });
  await prisma.availability.create({ data: { employeeId: crew[2].id, kind: "TIME_OFF", startsAt: at(day(1), 0), endsAt: at(day(1), 23, 59), note: "DEMO day off" } });

  const vehicles = await Promise.all(
    [
      { unitNumber: "EB-V1", vehicleClassCode: "cargo-van", status: "AVAILABLE" },
      { unitNumber: "EB-T15", vehicleClassCode: "box-15", status: "AVAILABLE" },
      { unitNumber: "EB-T20", vehicleClassCode: "box-20", status: "AVAILABLE" },
      { unitNumber: "EB-T26", vehicleClassCode: "box-26", status: "MAINTENANCE" },
    ].map((v) => prisma.vehicle.create({ data: { ...v, homeMarket: "miami", notes: "DEMO vehicle" } })),
  );

  const customer = async (name: string, email: string, phone: string, companyName?: string, accountType?: string) => {
    let companyId: string | null = null;
    if (companyName) {
      const c = await prisma.company.upsert({ where: { domain: email.split("@")[1] }, update: {}, create: { name: companyName, domain: email.split("@")[1], accountType, accountStatus: "ACTIVE", paymentTermsDays: 30 } });
      companyId = c.id;
    }
    return prisma.customer.upsert({ where: { email }, update: { companyId }, create: { name, email, phone, companyId } });
  };
  const hotel = await customer("Front Office Manager", "frontoffice@demo-oceanhotel.example", "305-555-0141", "Demo Ocean Hotel", "hotel");
  const dmc = await customer("Program Coordinator", "programs@demo-dmc.example", "954-555-0162", "Demo Destination Services", "dmc");
  const traveler = await customer("Jordan Ellis", "jordan.ellis@demo-traveler.example", "407-555-0119");
  const office = await customer("Operations Desk", "ops@demo-corporate.example", "305-555-0175", "Demo Corporate Group", "corporate");

  const { createOrder, transitionOrder } = await import("../../src/server/services/orders");
  const sys = { type: "system", name: "Demo seed" };
  const mk = async (o: Parameters<typeof createOrder>[0], extra: { windowStart?: Date; windowEnd?: Date } = {}) => {
    const order = await createOrder(o, sys);
    await prisma.order.update({ where: { id: order.id }, data: { internalNotes: "DEMO order (fictional data)", ...extra } });
    return order;
  };
  const bags = (n: number, category = "standard-checked") => Array.from({ length: n }, () => ({ category }));

  const today = day(0);
  const o1 = await mk(
    { customerId: hotel.id, companyId: hotel.companyId, serviceType: "cruise", market: "miami", serviceDate: today, timeWindow: "morning", guestName: "Ana Lopez", guestRoom: "1204",
      pickup: { type: "hotel", address: "Demo Ocean Hotel, Collins Ave, Miami Beach, FL 33139", market: "miami" },
      delivery: { type: "cruise-port", address: "PortMiami Cruise Terminal", facility: "portmiami", market: "miami" },
      pieces: [...bags(6), { category: "special", description: "Golf bag" }], priority: "VIP" },
    { windowStart: at(today, 8), windowEnd: at(today, 10, 30) },
  );
  const o2 = await mk(
    { customerId: traveler.id, serviceType: "airport", market: "miami", serviceDate: today, timeWindow: "midday",
      pickup: { type: "airport", address: "MIA Terminal D baggage claim", facility: "MIA", market: "miami" },
      delivery: { type: "hotel", address: "Brickell hotel, Miami, FL 33131", market: "miami" },
      pieces: bags(3) },
  );
  const o3 = await mk(
    { customerId: dmc.id, companyId: dmc.companyId, serviceType: "group-event", fulfillment: "custom", market: "fort-lauderdale-broward", serviceDate: today, timeWindow: "afternoon",
      pickup: { type: "hotel", address: "Resort on Fort Lauderdale Beach, FL 33304", market: "fort-lauderdale-broward" },
      delivery: { type: "cruise-port", address: "Port Everglades Terminal 25", facility: "port-everglades", market: "fort-lauderdale-broward" },
      pieces: bags(48), specialHandling: "Bags tagged by room; stage in the lobby by 12:30" },
  );
  const o4 = await mk(
    { customerId: office.id, companyId: office.companyId, serviceType: "courier", market: "miami", serviceDate: today, timeWindow: "afternoon",
      pickup: { type: "business", address: "Office in Doral, FL 33166", market: "miami" },
      delivery: { type: "hotel", address: "Convention hotel, Miami Beach, FL 33139", market: "miami" },
      pieces: [{ category: "cargo", description: "Sealed document boxes" }, { category: "cargo", description: "Event materials" }], priority: "RUSH", poNumber: "PO-4471" },
  );
  await mk(
    { customerId: traveler.id, serviceType: "luggage-local", market: "orlando", serviceDate: day(1), timeWindow: "morning",
      pickup: { type: "hotel", address: "Resort near International Drive, Orlando, FL 32819", market: "orlando" },
      delivery: { type: "cruise-port", address: "Port Canaveral Terminal 3", facility: "port-canaveral", market: "cape-canaveral-port-canaveral" },
      pieces: bags(4) },
  );

  // Assign and advance a couple of today's jobs so the board and tracking look real
  const assign = (orderId: string, employeeId: string, role: string, vehicleId: string | null, sequence: number) =>
    prisma.assignment.create({ data: { orderId, employeeId, role, vehicleId, sequence, assignedBy: "Demo seed" } });
  await assign(o1.id, crew[0].id, "DRIVER", vehicles[2].id, 1);
  await assign(o1.id, crew[3].id, "HELPER", null, 1);
  await prisma.order.update({ where: { id: o1.id }, data: { assignedDriverRef: crew[0].id } });
  await transitionOrder(o1.id, "DRIVER_ASSIGNED", sys);
  await transitionOrder(o1.id, "EN_ROUTE", sys);
  await transitionOrder(o1.id, "PICKED_UP", sys, { detail: "7 pieces counted and loaded, condition noted" });
  await assign(o4.id, crew[0].id, "DRIVER", vehicles[0].id, 2);
  await prisma.order.update({ where: { id: o4.id }, data: { assignedDriverRef: crew[0].id } });
  await transitionOrder(o4.id, "DRIVER_ASSIGNED", sys);
  await prisma.orderException.create({ data: { orderId: o3.id, type: "COUNT_MISMATCH", severity: "HIGH", detail: "Manifest lists 48 bags, coordinator now reports 52", reportedBy: "Demo seed" } });

  return { orders: [o1.reference, o2.reference, o3.reference, o4.reference], crew: crew.length, vehicles: vehicles.length };
}

// Standalone run
if (process.argv[1]?.endsWith("ops.ts")) {
  (async () => {
    await import("../../src/server/lib/env");
    const { prisma } = await import("../../src/server/db");
    console.log("Demo ops data:", await seedOps(prisma));
    await prisma.$disconnect();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
