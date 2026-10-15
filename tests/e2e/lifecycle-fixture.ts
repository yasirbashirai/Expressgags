/**
 * Data helpers for the cross-module lifecycle e2e (tests/e2e/lifecycle.spec.ts). Prints JSON.
 *   npx tsx tests/e2e/lifecycle-fixture.ts crew                 → driver login + employee + vehicle
 *   npx tsx tests/e2e/lifecycle-fixture.ts hotel                → ACTIVE hotel company (on account, PO required) + concierge login
 *   npx tsx tests/e2e/lifecycle-fixture.ts order <reference>    → order id, pieces, status, survey token, notification count
 *   npx tsx tests/e2e/lifecycle-fixture.ts cleanup '<json>'     → deactivate test logins
 */
import "../../src/server/lib/env";
import { randomBytes } from "node:crypto";
import { prisma } from "../../src/server/db";
import { hashPassword } from "../../src/server/auth";
import { processDueJobs } from "../../src/server/modules/notifications/worker";

const PASSWORD = "Lifecycle-Test-Password-2026!";

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const tag = randomBytes(3).toString("hex");
  if (cmd === "crew") {
    const user = await prisma.user.create({ data: { email: `lifecycle-driver-${tag}@test.local`, name: `Lifecycle Driver ${tag}`, role: "DRIVER", passwordHash: await hashPassword(PASSWORD) } });
    const employee = await prisma.employee.create({ data: { userId: user.id, firstName: "Jordan", lastName: `Test-${tag}`, role: "DRIVER", homeMarket: "miami", status: "ACTIVE" } });
    const vehicle = await prisma.vehicle.create({ data: { unitNumber: `LC-${tag}`, vehicleClassCode: "box-15", status: "AVAILABLE", homeMarket: "miami" } });
    console.log(JSON.stringify({ email: user.email, password: PASSWORD, userId: user.id, employeeId: employee.id, vehicleId: vehicle.id }));
  } else if (cmd === "hotel") {
    const company = await prisma.company.create({
      data: { name: `Lifecycle Test Resort ${tag}`, accountType: "hotel", accountStatus: "ACTIVE", poRequired: true, paymentTermsDays: 30, market: "miami", billingEmail: `ap-${tag}@resort.example` },
    });
    const concierge = await prisma.customer.create({
      data: { name: `Bell Desk ${tag}`, email: `belldesk-${tag}@resort.example`, phone: "305-555-0188", companyId: company.id, accountRole: "CONCIERGE", passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() },
    });
    console.log(JSON.stringify({ companyId: company.id, customerId: concierge.id, email: concierge.email, password: PASSWORD }));
  } else if (cmd === "order") {
    // Deliver any queued notifications now (the API's background worker may be off in test setups)
    await processDueJobs(200).catch(() => undefined);
    const o = await prisma.order.findFirstOrThrow({ where: { reference: arg }, include: { pieces: { orderBy: { pieceId: "asc" } }, survey: true } });
    const notifications = await prisma.notification.count({ where: { orderId: o.id } });
    const templates = (await prisma.notification.findMany({ where: { orderId: o.id }, select: { template: true } })).map((n) => n.template);
    console.log(JSON.stringify({ id: o.id, status: o.status, paymentStatus: o.paymentStatus, pieces: o.pieces.map((p) => p.pieceId), surveyToken: o.survey?.token ?? null, notifications, templates, retailCents: o.retailCents, customerId: o.customerId }));
  } else if (cmd === "cleanup") {
    const fx = JSON.parse(arg ?? "{}");
    if (fx.userId) await prisma.user.update({ where: { id: fx.userId }, data: { active: false } }).catch(() => undefined);
    if (fx.vehicleId) await prisma.vehicle.update({ where: { id: fx.vehicleId }, data: { status: "OUT_OF_SERVICE" } }).catch(() => undefined);
    console.log("{}");
  }
  await prisma.$disconnect();
}
void main();
