/**
 * Demo data for the money module (quotations, orders with economics, payments, invoices incl. one past due).
 * DEMO ONLY: fictional customers on example.com/example.org domains, never real Express Bags clients.
 * Idempotent: everything is keyed by "demo-money" markers, and existing demo rows are skipped.
 *
 * Usage (from a seed script): await seedMoney(prisma)
 */
import { randomInt } from "node:crypto";
import type { PrismaClient } from "../../src/server/generated/prisma/client";

const A = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const code = (n: number) => Array.from({ length: n }, () => A[randomInt(A.length)]).join("");
const ymd = (d: Date) => d.toISOString().slice(2, 10).replace(/-/g, "");
const DAY = 86400000;

export async function seedMoney(prisma: PrismaClient) {
  if (await prisma.customer.findFirst({ where: { email: "demo-money-hotel@example.com" } })) return { skipped: true };

  const hotelCo = await prisma.company.create({ data: { name: "Demo Bayfront Hotel", domain: "demo-bayfront.example.com", accountType: "hotel", accountStatus: "ACTIVE", paymentTermsDays: 30, billingEmail: "ap@demo-bayfront.example.com", market: "miami" } });
  const dmcCo = await prisma.company.create({ data: { name: "Demo Coastal DMC", domain: "demo-coastal.example.com", accountType: "dmc", accountStatus: "ACTIVE", paymentTermsDays: 15, market: "fort-lauderdale-broward" } });
  const hotel = await prisma.customer.create({ data: { name: "Front Office Manager (demo)", email: "demo-money-hotel@example.com", companyId: hotelCo.id, accountRole: "COMPANY_ADMIN" } });
  const dmc = await prisma.customer.create({ data: { name: "Program Coordinator (demo)", email: "demo-money-dmc@example.com", companyId: dmcCo.id, accountRole: "COMPANY_ADMIN" } });
  const traveler = await prisma.customer.create({ data: { name: "Traveler (demo)", email: "demo-money-traveler@example.org" } });

  const mk = async (opts: { customerId: string; companyId?: string; service: string; market: string; to: string; daysAgo: number; retail: number; cost: number; status: "CONFIRMED" | "DELIVERED" | "IN_TRANSIT"; pieces: number }) => {
    const created = new Date(Date.now() - opts.daysAgo * DAY);
    const reference = `EB-${ymd(created)}-${code(4)}`;
    return prisma.order.create({
      data: {
        reference,
        status: opts.status,
        serviceType: opts.service,
        customerId: opts.customerId,
        companyId: opts.companyId,
        pickup: { type: "hotel", address: "Demo hotel, Miami Beach", market: opts.market },
        delivery: { type: "cruise-port", address: "Demo terminal", market: opts.to },
        serviceDate: new Date(created.getTime() + DAY),
        market: opts.market,
        retailCents: opts.retail,
        costCents: opts.cost,
        completedAt: opts.status === "DELIVERED" ? new Date(created.getTime() + DAY) : null,
        createdAt: created,
        internalNotes: "demo-money",
        pieces: { create: Array.from({ length: opts.pieces }, (_, i) => ({ pieceId: `${reference}-${String(i + 1).padStart(2, "0")}`, category: "standard-checked" })) },
        events: { create: { type: "STATUS", status: opts.status, detail: "Demo order", actorType: "system", customerVisible: true, createdAt: created } },
      },
    });
  };

  const o1 = await mk({ customerId: hotel.id, companyId: hotelCo.id, service: "luggage-local", market: "miami", to: "miami", daysAgo: 40, retail: 64000, cost: 38000, status: "DELIVERED", pieces: 24 });
  await mk({ customerId: hotel.id, companyId: hotelCo.id, service: "cruise", market: "miami", to: "miami", daysAgo: 12, retail: 42000, cost: 26000, status: "DELIVERED", pieces: 16 });
  const o3 = await mk({ customerId: dmc.id, companyId: dmcCo.id, service: "group-event", market: "fort-lauderdale-broward", to: "fort-lauderdale-broward", daysAgo: 5, retail: 285000, cost: 171000, status: "IN_TRANSIT", pieces: 120 });
  const o4 = await mk({ customerId: traveler.id, service: "airport", market: "miami", to: "miami", daysAgo: 2, retail: 13500, cost: 7400, status: "CONFIRMED", pieces: 3 });
  const o5 = await mk({ customerId: dmc.id, companyId: dmcCo.id, service: "truck", market: "fort-lauderdale-broward", to: "orlando", daysAgo: 20, retail: 98000, cost: 70000, status: "DELIVERED", pieces: 8 });

  // Payments: traveler paid online, DMC paid a deposit
  await prisma.payment.create({ data: { method: "mock", kind: "PAYMENT", status: "SUCCEEDED", amountCents: 13500, orderId: o4.id, providerRef: `demo_cs_${code(10)}`, createdAt: new Date(Date.now() - 2 * DAY) } });
  await prisma.order.update({ where: { id: o4.id }, data: { paymentStatus: "PAID" } });
  await prisma.payment.create({ data: { method: "mock", kind: "DEPOSIT", status: "SUCCEEDED", amountCents: 71250, orderId: o3.id, providerRef: `demo_cs_${code(10)}`, createdAt: new Date(Date.now() - 6 * DAY) } });
  await prisma.order.update({ where: { id: o3.id }, data: { paymentStatus: "DEPOSIT_PAID" } });

  // Invoices: hotel monthly invoice past due; DMC truck job invoiced and partially paid
  const seq = async () => {
    const rows = await prisma.$queryRaw<{ value: number }[]>`INSERT INTO "MoneySequence" ("name","value") VALUES ('invoice',1) ON CONFLICT ("name") DO UPDATE SET "value" = "MoneySequence"."value" + 1 RETURNING "value"`;
    return `EB-INV-${String(Number(rows[0].value)).padStart(6, "0")}`;
  };
  await prisma.invoice.create({
    data: {
      number: await seq(), customerId: hotel.id, companyId: hotelCo.id, status: "OVERDUE", issuedAt: new Date(Date.now() - 45 * DAY), dueAt: new Date(Date.now() - 15 * DAY),
      subtotalCents: 64000, totalCents: 64000, publicToken: code(32), poNumber: "DEMO-PO-1001", notes: "demo-money",
      lines: { create: [{ description: `Order ${o1.reference} · hotel hospitality logistics`, quantity: 1, unitCents: 64000, totalCents: 64000, orderId: o1.id }] },
    },
  });
  const inv2 = await prisma.invoice.create({
    data: {
      number: await seq(), customerId: dmc.id, companyId: dmcCo.id, status: "PARTIAL", issuedAt: new Date(Date.now() - 18 * DAY), dueAt: new Date(Date.now() - 3 * DAY),
      subtotalCents: 98000, totalCents: 98000, paidCents: 50000, publicToken: code(32), notes: "demo-money",
      lines: { create: [{ description: `Order ${o5.reference} · box truck Broward to Orlando`, quantity: 1, unitCents: 98000, totalCents: 98000, orderId: o5.id }] },
    },
  });
  await prisma.payment.create({ data: { method: "check", kind: "PAYMENT", status: "SUCCEEDED", amountCents: 50000, invoiceId: inv2.id, note: "Demo check #2045", recordedBy: "demo", createdAt: new Date(Date.now() - 8 * DAY) } });
  await prisma.order.updateMany({ where: { id: { in: [o1.id, o5.id] } }, data: { paymentStatus: "INVOICED" } });

  // Quotations: one awaiting acceptance, one draft for a group program
  const mkq = (customerId: string, title: string, status: string, total: number, cost: number, days: number) =>
    prisma.quotation.create({
      data: {
        reference: `EB-QT-${ymd(new Date())}-${code(4)}`, customerId, title, status, source: "manual", subtotalCents: total, totalCents: total, costCents: cost,
        marginPct: Math.round(((total - cost) / total) * 1000) / 10, publicToken: code(32), validUntil: new Date(Date.now() + days * DAY), sentAt: status === "DRAFT" ? null : new Date(),
        scope: "Demo quotation.", lines: { create: [{ kind: "truck", description: "26-ft box truck with driver (demo)", quantity: 1, unitCents: total, unitCostCents: cost, totalCents: total }] },
      },
    });
  await mkq(hotel.id, "Weekend group check-out to PortMiami (demo)", "SENT", 52000, 31000, 10);
  await mkq(dmc.id, "Conference program, 3 hotels (demo)", "DRAFT", 410000, 262000, 14);
  return { skipped: false, orders: 5, invoices: 2, quotations: 2 };
}
