/**
 * DEMO portal data (fictional people and companies, clearly marked "Demo"): one individual traveler,
 * a demo hotel with a company administrator + concierge desk (and a shared lobby location),
 * and a demo corporate account that requires PO numbers. Safe to re-run (upserts by email).
 *
 * Passwords: DEMO_PORTAL_PASSWORD from env, otherwise a random one is generated and printed.
 * Run standalone: npx tsx prisma/seed-demo/portal.ts
 */
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "../../src/server/generated/prisma/client";

export async function seedPortal(prisma: PrismaClient) {
  const { hashPassword } = await import("../../src/server/auth");
  const { createOrder } = await import("../../src/server/services/orders");
  const password = process.env.DEMO_PORTAL_PASSWORD || `Demo-${randomBytes(5).toString("hex")}!`;
  const passwordHash = await hashPassword(password);

  const hotel = await upsertCompany(prisma, "demo-hotel.example", { name: "Demo Bayfront Hotel (fictional)", accountType: "hotel", accountStatus: "ACTIVE", billingEmail: "billing@demo-hotel.example", paymentTermsDays: 30, market: "miami" });
  const corp = await upsertCompany(prisma, "demo-corp.example", { name: "Demo Events Corp (fictional)", accountType: "corporate", accountStatus: "ACTIVE", poRequired: true, billingEmail: "ap@demo-corp.example", paymentTermsDays: 15, market: "fort-lauderdale-broward" });

  const people = [
    { email: "traveler@demo-portal.example", name: "Demo Traveler", accountRole: "INDIVIDUAL", companyId: null },
    { email: "frontoffice@demo-hotel.example", name: "Demo Front Office Manager", accountRole: "COMPANY_ADMIN", companyId: hotel.id },
    { email: "belldesk@demo-hotel.example", name: "Demo Bell Desk", accountRole: "CONCIERGE", companyId: hotel.id },
    { email: "travel@demo-corp.example", name: "Demo Travel Coordinator", accountRole: "COMPANY_ADMIN", companyId: corp.id },
  ] as const;

  const ids: Record<string, string> = {};
  for (const p of people) {
    const c = await prisma.customer.upsert({
      where: { email: p.email },
      update: { name: p.name, accountRole: p.accountRole, companyId: p.companyId, passwordHash, emailVerifiedAt: new Date() },
      create: { email: p.email, name: p.name, phone: "305-555-0100", accountRole: p.accountRole, companyId: p.companyId, passwordHash, emailVerifiedAt: new Date() },
    });
    await prisma.customerAccess.upsert({ where: { customerId: c.id }, update: { status: "ACTIVE", pendingPasswordHash: null }, create: { customerId: c.id, status: "ACTIVE" } });
    ids[p.email] = c.id;
  }

  if (!(await prisma.savedAddress.findFirst({ where: { companyId: hotel.id, label: "Main lobby (demo)" } }))) {
    await prisma.savedAddress.create({ data: { companyId: hotel.id, label: "Main lobby (demo)", type: "hotel", address: "Demo Bayfront Hotel, Biscayne Blvd, Miami (fictional)", market: "miami", notes: "Bell desk hold room by the valet stand" } });
  }

  // One demo order per account so the dashboards are not empty (only once)
  const traveler = ids["traveler@demo-portal.example"];
  if ((await prisma.order.count({ where: { customerId: traveler } })) === 0) {
    const o = await createOrder({
      customerId: traveler,
      serviceType: "cruise",
      pickup: { type: "hotel", address: "Demo hotel, Miami Beach (fictional)", market: "miami" },
      delivery: { type: "cruise-port", address: "PortMiami", facility: "portmiami", market: "miami" },
      serviceDate: new Date(Date.now() + 3 * 86400000),
      timeWindow: "morning",
      market: "miami",
      pieces: [{ category: "large" }, { category: "large" }, { category: "carry-on" }],
      retailCents: 14900,
    });
    await prisma.orderEvent.create({ data: { orderId: o.id, type: "NOTE", detail: "Pickup window confirmed with the guest", customerVisible: true } });
  }
  const bell = ids["belldesk@demo-hotel.example"];
  if ((await prisma.order.count({ where: { companyId: hotel.id } })) === 0) {
    await createOrder({
      customerId: bell,
      companyId: hotel.id,
      serviceType: "airport",
      pickup: { type: "hotel", address: "Demo Bayfront Hotel, Biscayne Blvd, Miami (fictional)", market: "miami" },
      delivery: { type: "airport", address: "Miami International Airport (MIA)", facility: "MIA", market: "miami" },
      serviceDate: new Date(Date.now() + 86400000),
      timeWindow: "midday",
      market: "miami",
      guestName: "Demo Guest",
      guestRoom: "1407",
      pieces: [{ category: "standard-checked" }, { category: "standard-checked" }],
      retailCents: 8900,
    });
  }

  console.log("Demo portal accounts (fictional):");
  for (const p of people) console.log(`  ${p.accountRole.padEnd(13)} ${p.email}`);
  console.log(`  password: ${process.env.DEMO_PORTAL_PASSWORD ? "(DEMO_PORTAL_PASSWORD)" : password}`);
  return { password, ids, hotelId: hotel.id, corpId: corp.id };
}

async function upsertCompany(prisma: PrismaClient, domain: string, data: { name: string; accountType: string; accountStatus: string; billingEmail: string; paymentTermsDays: number; market: string; poRequired?: boolean }) {
  return prisma.company.upsert({ where: { domain }, update: data, create: { domain, ...data } });
}

// Standalone run
if (process.argv[1]?.endsWith("portal.ts")) {
  (async () => {
    await import("../../src/server/lib/env");
    const { prisma } = await import("../../src/server/db");
    await seedPortal(prisma);
    await prisma.$disconnect();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
