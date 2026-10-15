/**
 * Composite DEMO seed for the whole platform: runs every module's demo seed in dependency order,
 * or removes all demo rows. Demo data is FICTIONAL and recognizable by markers:
 *  - emails/domains on RFC 2606 reserved names (example.com, example.org, *.example, *.invalid)
 *  - employees whose last name ends with "(demo)" or whose notes start with "DEMO"
 *  - vehicles with notes "DEMO vehicle" / unit numbers starting "DEMO"
 *  - storage locations with codes starting "demo-", CMS posts with slugs starting "demo-"
 * Real Express Bags records never use those markers, so cleaning never touches real data.
 *
 * Usage:  npm run seed:demo          (seed everything, idempotent)
 *         npm run seed:demo:clean    (delete demo rows)
 * Refuses to run when NODE_ENV=production.
 */
import "../../src/server/lib/env";
import { prisma } from "../../src/server/db";
import { seedCarriers } from "./carriers";
import { seedCms } from "./cms";
import { seedDriver } from "./driver";
import { seedMoney } from "./money";
import { seedOps } from "./ops";
import { seedPortal } from "./portal";
import { seedResources } from "./resources";
import { seedStorage } from "./storage";

if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEMO_SEED) {
  console.error("seed-demo: refusing to run with NODE_ENV=production (demo data must never reach the live platform).");
  process.exit(1);
}

/** Demo email domains (RFC 2606 / 6761 reserved — can never belong to a real customer). */
const DEMO_EMAIL = /@(example\.(com|org|net)|[a-z0-9-]+\.example|[a-z0-9.-]*\.invalid|example\.invalid)$/i;

async function seedAll() {
  const steps: [string, () => Promise<unknown>][] = [
    ["resources (team, fleet, credentials)", () => seedResources(prisma)],
    ["ops (crew, vehicles, orders, exceptions)", () => seedOps(prisma)],
    ["driver (driver login + job)", () => seedDriver(prisma, { withJob: true })],
    ["portal (customer, hotel, corporate accounts)", () => seedPortal(prisma)],
    ["money (quotations, invoices, payments)", () => seedMoney(prisma)],
    ["storage (locations, bookings)", () => seedStorage(prisma)],
    ["carriers (nationwide shipments)", () => seedCarriers(prisma)],
    ["cms (history entries, draft posts)", () => seedCms(prisma)],
  ];
  for (const [name, run] of steps) {
    const t = Date.now();
    try {
      const out = await run();
      // Never echo password hashes; demo passwords are printed by the module seeds themselves once
      const summary = out && typeof out === "object" ? JSON.stringify(out, (k, v) => (/password/i.test(k) ? "[redacted]" : v)).slice(0, 160) : "";
      console.log(`✓ ${name} (${Date.now() - t} ms)`, summary);
    } catch (e) {
      // One module's demo data failing must not stop the others
      console.error(`✗ ${name}:`, (e as Error).message);
      process.exitCode = 1;
    }
  }
}

async function cleanAll() {
  const customers = (await prisma.customer.findMany({ select: { id: true, email: true } })).filter((c) => DEMO_EMAIL.test(c.email));
  const customerIds = customers.map((c) => c.id);
  const orders = await prisma.order.findMany({ where: { customerId: { in: customerIds } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  const quotations = await prisma.quotation.findMany({ where: { customerId: { in: customerIds } }, select: { id: true } });
  const quotationIds = quotations.map((q) => q.id);
  const invoices = await prisma.invoice.findMany({ where: { customerId: { in: customerIds } }, select: { id: true } });
  const invoiceIds = invoices.map((i) => i.id);
  const demoUserIds = (await prisma.user.findMany({ where: { role: { not: "OWNER" } }, select: { id: true, email: true } })).filter((u) => DEMO_EMAIL.test(u.email)).map((u) => u.id);
  const employees = await prisma.employee.findMany({
    // fictional crew, plus employee profiles linked to demo logins (e.g. driver.demo@example.com)
    where: { OR: [{ lastName: { endsWith: "(demo)" } }, { internalNotes: { startsWith: "DEMO" } }, { userId: { in: demoUserIds } }] },
    select: { id: true, userId: true },
  });
  const employeeIds = employees.map((e) => e.id);
  const vehicles = await prisma.vehicle.findMany({ where: { OR: [{ notes: { startsWith: "DEMO" } }, { unitNumber: { startsWith: "DEMO" } }] }, select: { id: true } });
  const vehicleIds = vehicles.map((v) => v.id);
  const storageLocations = await prisma.storageLocation.findMany({ where: { code: { startsWith: "demo-" } }, select: { id: true } });
  const locationIds = storageLocations.map((l) => l.id);

  const counts: Record<string, number> = {};
  const n = (k: string, r: { count: number }) => (counts[k] = (counts[k] ?? 0) + r.count);

  await prisma.$transaction(async (tx) => {
    n("claims", await tx.claim.deleteMany({ where: { OR: [{ customerId: { in: customerIds } }, { orderId: { in: orderIds } }] } }));
    n("payments", await tx.payment.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { invoiceId: { in: invoiceIds } }, { quotationId: { in: quotationIds } }] } }));
    n("invoiceLines", await tx.invoiceLine.deleteMany({ where: { OR: [{ invoiceId: { in: invoiceIds } }, { orderId: { in: orderIds } }] } }));
    n("invoices", await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } }));
    n("storageBookings", await tx.storageBooking.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { locationId: { in: locationIds } }] } }));
    n("storageLocations", await tx.storageLocation.deleteMany({ where: { id: { in: locationIds } } }));
    n("assignments", await tx.assignment.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { employeeId: { in: employeeIds } }, { vehicleId: { in: vehicleIds } }] } }));
    n("notifications", await tx.notification.deleteMany({ where: { orderId: { in: orderIds } } }));
    // Orders cascade to pieces, events, proofs, exceptions, shipments, survey
    n("orders", await tx.order.deleteMany({ where: { id: { in: orderIds } } }));
    n("quotations", await tx.quotation.deleteMany({ where: { id: { in: quotationIds } } }));
    n("quoteRequests", await tx.quoteRequest.deleteMany({ where: { customerId: { in: customerIds } } }));
    n("customers", await tx.customer.deleteMany({ where: { id: { in: customerIds } } }));
    n("companies", await tx.company.deleteMany({ where: { customers: { none: {} }, OR: [{ domain: { endsWith: ".example" } }, { domain: { endsWith: "example.com" } }, { name: { startsWith: "Demo " } }] } }));
    n("employees", await tx.employee.deleteMany({ where: { id: { in: employeeIds } } }));
    n("vehicles", await tx.vehicle.deleteMany({ where: { id: { in: vehicleIds } } }));
    // Demo logins (never OWNER accounts, so a dev owner on example.com survives)
    n("users", await tx.user.deleteMany({ where: { id: { in: demoUserIds } } }));
    n("posts", await tx.post.deleteMany({ where: { slug: { startsWith: "demo-" } } }));
  }, { timeout: 120_000 });

  console.log("seed-demo clean:", counts);
}

const clean = process.argv.includes("--clean");
(clean ? cleanAll() : seedAll())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
