/**
 * DEMO data for the Team / Fleet / Credentials screens. All people are FICTIONAL (names end with "(demo)")
 * and are flagged in internalNotes — never real Express Bags staff. Safe to re-run (upserts by unit number /
 * email). Run standalone: `npx tsx prisma/seed-demo/resources.ts`.
 */
import type { PrismaClient } from "../../src/server/generated/prisma/client";

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);

const PEOPLE = [
  { firstName: "Alex", lastName: "Rivera (demo)", role: "DRIVER", homeMarket: "miami", licenseClass: "Class C", license: 18 },
  { firstName: "Jordan", lastName: "Baptiste (demo)", role: "DRIVER", homeMarket: "miami", licenseClass: "CDL-B", license: 210 },
  { firstName: "Sam", lastName: "Okafor (demo)", role: "DRIVER", homeMarket: "fort-lauderdale-broward", licenseClass: "Class C", license: 400 },
  { firstName: "Taylor", lastName: "Nguyen (demo)", role: "DRIVER", homeMarket: "west-palm-beach", licenseClass: "CDL-B", license: -3 },
  { firstName: "Chris", lastName: "Morales (demo)", role: "HELPER", homeMarket: "miami", licenseClass: null, license: null },
  { firstName: "Robin", lastName: "Castillo (demo)", role: "HELPER", homeMarket: "fort-lauderdale-broward", licenseClass: null, license: null },
  { firstName: "Casey", lastName: "Durand (demo)", role: "DISPATCH", homeMarket: "miami", licenseClass: null, license: null },
  { firstName: "Morgan", lastName: "Silva (demo)", role: "OFFICE", homeMarket: "miami", licenseClass: null, license: null },
] as const;

const VEHICLES = [
  { unitNumber: "DEMO-V1", vehicleClassCode: "cargo-van", make: "Ford", model: "Transit 250", year: 2023, homeMarket: "miami", reg: 140, ins: 25, insp: 300 },
  { unitNumber: "DEMO-V2", vehicleClassCode: "cargo-van", make: "Mercedes-Benz", model: "Sprinter 2500", year: 2022, homeMarket: "fort-lauderdale-broward", reg: 9, ins: 190, insp: 120 },
  { unitNumber: "DEMO-T15", vehicleClassCode: "box-15", make: "Isuzu", model: "NPR-HD", year: 2021, homeMarket: "miami", reg: 260, ins: 190, insp: 45 },
  { unitNumber: "DEMO-T20", vehicleClassCode: "box-20", make: "Hino", model: "195", year: 2022, homeMarket: "miami", reg: 75, ins: 190, insp: -5 },
  { unitNumber: "DEMO-T26A", vehicleClassCode: "box-26", make: "Freightliner", model: "M2 106", year: 2020, homeMarket: "miami", reg: 330, ins: 190, insp: 200 },
  { unitNumber: "DEMO-T26B", vehicleClassCode: "box-26", make: "International", model: "MV607", year: 2023, homeMarket: "west-palm-beach", reg: 190, ins: 28, insp: 160 },
] as const;

export async function seedResources(prisma: PrismaClient) {
  const employees = [];
  for (const [i, p] of PEOPLE.entries()) {
    const email = `demo.${p.firstName.toLowerCase()}@example.invalid`;
    const existing = await prisma.employee.findFirst({ where: { email } });
    const data = {
      firstName: p.firstName,
      lastName: p.lastName,
      role: p.role,
      email,
      phone: `305-555-01${String(10 + i)}`,
      homeMarket: p.homeMarket,
      status: "ACTIVE",
      employmentType: i % 3 === 0 ? "contractor" : "employee",
      hireDate: new Date(2016 + (i % 8), i % 12, 5),
      licenseClass: p.licenseClass,
      licenseNumber: p.license !== null ? `D${100000 + i * 7919}` : null,
      licenseExpiresAt: p.license !== null ? inDays(p.license) : null,
      internalNotes: "DEMO RECORD: fictional person for testing the admin. Delete before launch.",
    };
    employees.push(existing ? await prisma.employee.update({ where: { id: existing.id }, data }) : await prisma.employee.create({ data }));
  }

  // This week's shifts for drivers/helpers (8:00–18:00 local ≈ 12:00–22:00 UTC) + one day off
  const monday = new Date();
  monday.setUTCHours(12, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  for (const e of employees.filter((x) => x.role === "DRIVER" || x.role === "HELPER")) {
    await prisma.availability.deleteMany({ where: { employeeId: e.id, note: "demo shift" } });
    await prisma.availability.createMany({
      data: Array.from({ length: 6 }, (_, d) => ({ employeeId: e.id, kind: "SHIFT", startsAt: new Date(monday.getTime() + d * DAY), endsAt: new Date(monday.getTime() + d * DAY + 10 * 3600_000), note: "demo shift" })),
    });
  }
  const off = employees.find((x) => x.lastName.startsWith("Okafor"));
  if (off) {
    await prisma.availability.deleteMany({ where: { employeeId: off.id, kind: "TIME_OFF" } });
    await prisma.availability.create({ data: { employeeId: off.id, kind: "TIME_OFF", startsAt: new Date(monday.getTime() + 2 * DAY - 8 * 3600_000), endsAt: new Date(monday.getTime() + 3 * DAY - 8 * 3600_000), note: "Vacation day (demo)" } });
  }

  const vehicles = [];
  for (const v of VEHICLES) {
    const data = {
      unitNumber: v.unitNumber,
      vehicleClassCode: v.vehicleClassCode,
      make: v.make,
      model: v.model,
      year: v.year,
      homeMarket: v.homeMarket,
      plate: `DEMO${v.unitNumber.slice(-2)}`,
      status: v.unitNumber === "DEMO-T20" ? "MAINTENANCE" : "AVAILABLE",
      odometer: 20_000 + v.year * 7 % 50_000,
      registrationExpiresAt: inDays(v.reg),
      insuranceExpiresAt: inDays(v.ins),
      inspectionExpiresAt: inDays(v.insp),
      notes: "DEMO RECORD: fictional vehicle for testing. Delete before launch.",
    };
    vehicles.push(await prisma.vehicle.upsert({ where: { unitNumber: v.unitNumber }, update: data, create: data }));
  }

  // Maintenance history + upcoming work
  for (const v of vehicles) {
    await prisma.maintenanceRecord.deleteMany({ where: { vehicleId: v.id, notes: "demo" } });
    await prisma.maintenanceRecord.createMany({
      data: [
        { vehicleId: v.id, type: "Oil & filter change", status: "COMPLETED", completedAt: inDays(-60), costCents: 14_900, vendor: "Fleet service partner (demo)", notes: "demo" },
        { vehicleId: v.id, type: "Tire rotation", status: "COMPLETED", completedAt: inDays(-20), costCents: 8_500, vendor: "Fleet service partner (demo)", notes: "demo" },
        ...(v.vehicleClassCode.startsWith("box") ? [{ vehicleId: v.id, type: "Liftgate service", status: "SCHEDULED", scheduledFor: inDays(12), notes: "demo" }] : []),
      ],
    });
  }

  // Credentials register (company-level + people + vehicles), some expiring soon
  await prisma.credential.deleteMany({ where: { notes: "demo" } });
  const [d1, d2, d3] = employees;
  await prisma.credential.createMany({
    data: [
      { employeeId: d1.id, facility: "portmiami", type: "TWIC", identifier: "TWIC-DEMO-01", expiresAt: inDays(21), notes: "demo" },
      { employeeId: d1.id, facility: "MIA", type: "AIRPORT_BADGE", identifier: "MIA-DEMO-01", expiresAt: inDays(160), notes: "demo" },
      { employeeId: d2.id, facility: "port-everglades", type: "PORT_PASS", identifier: "PEV-DEMO-02", expiresAt: inDays(-2), notes: "demo" },
      { employeeId: d3.id, facility: "FLL", type: "AIRPORT_BADGE", identifier: "FLL-DEMO-03", expiresAt: inDays(55), notes: "demo" },
      { vehicleId: vehicles[2].id, facility: "portmiami", type: "VEHICLE_PERMIT", identifier: "PMV-DEMO-15", expiresAt: inDays(40), notes: "demo" },
      { facility: "company", type: "INSURANCE_COI", identifier: "COI-DEMO-AUTO", expiresAt: inDays(88), notes: "demo" },
      { facility: "company", type: "DOT", identifier: "USDOT-DEMO", expiresAt: null, notes: "demo" },
    ],
  });
  return { employees: employees.length, vehicles: vehicles.length };
}

// Allow `npx tsx prisma/seed-demo/resources.ts`
if (process.argv[1]?.endsWith("resources.ts")) {
  (async () => {
    await import("../../src/server/lib/env");
    const { prisma } = await import("../../src/server/db");
    const r = await seedResources(prisma);
    console.log(`Demo resources seeded: ${r.employees} team members, ${r.vehicles} vehicles.`);
    await prisma.$disconnect();
  })();
}
