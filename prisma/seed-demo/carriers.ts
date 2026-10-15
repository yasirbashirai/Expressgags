/**
 * Demo carrier-shipping data for development and client walkthroughs (NOT for production):
 * default carrier settings, one nationwide order awaiting labels, and one with mock labels already
 * purchased (test-mode labels, clearly marked "SAMPLE LABEL"). Names are fictional; rows are tagged
 * "DEMO" and replaced on each run. Always uses the mock carrier provider.
 *
 * Run standalone: npx tsx prisma/seed-demo/carriers.ts
 */
import type { PrismaClient } from "../../src/server/generated/prisma/client";

export async function seedCarriers(prisma: PrismaClient) {
  process.env.PROVIDERS_MODE = "mock"; // never buy real labels from a demo seed
  const { createOrder } = await import("../../src/server/services/orders");
  const { buyLabels } = await import("../../src/server/modules/carriers/shipments");
  const { DEFAULT_CARRIER_SETTINGS } = await import("../../src/server/modules/carriers/settings");

  const old = await prisma.order.findMany({ where: { internalNotes: { startsWith: "DEMO carriers" } }, select: { id: true } });
  await prisma.order.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  await prisma.setting.upsert({ where: { key: "carrierSettings" }, update: {}, create: { key: "carrierSettings", value: DEFAULT_CARRIER_SETTINGS as object } });

  const customer = await prisma.customer.upsert({
    where: { email: "demo-shipper@example.com" },
    update: {},
    create: { email: "demo-shipper@example.com", name: "Demo Shipper (demo)", phone: "305-555-0190" },
  });
  const base = { customerId: customer.id, serviceType: "nationwide-shipping", fulfillment: "nationwide" as const, market: "miami" };
  const awaiting = await createOrder({
    ...base,
    pickup: { type: "hotel", address: "Hotel on Collins Ave, Miami Beach", market: "miami" },
    delivery: { type: "residence", address: "350 5th Ave, New York, NY 10118", market: "outside-florida" },
    serviceDate: new Date(Date.now() + 2 * 86_400_000),
    pieces: [{ category: "standard-checked" }, { category: "standard-checked" }, { category: "carry-on" }],
  });
  const labeled = await createOrder({
    ...base,
    pickup: { type: "hotel", address: "Resort in Fort Lauderdale", market: "fort-lauderdale-broward" },
    delivery: { type: "residence", address: "233 S Wacker Dr, Chicago, IL 60606", market: "outside-florida" },
    serviceDate: new Date(Date.now() + 86_400_000),
    pieces: [{ category: "large", weightLbs: 58, lengthIn: 30, widthIn: 20, heightIn: 12 }, { category: "special", description: "Golf clubs", weightLbs: 35, lengthIn: 48, widthIn: 14, heightIn: 14 }],
  });
  await prisma.order.updateMany({ where: { id: { in: [awaiting.id, labeled.id] } }, data: { internalNotes: "DEMO carriers: delete before launch" } });
  await buyLabels(labeled.id, "standard", { id: "demo", name: "Demo seed" });
  return { awaitingLabels: awaiting.reference, labeled: labeled.reference };
}

// Standalone run
if (process.argv[1]?.endsWith("carriers.ts")) {
  (async () => {
    await import("../../src/server/lib/env");
    const { prisma } = await import("../../src/server/db");
    console.log("Demo carrier data:", await seedCarriers(prisma));
    await prisma.$disconnect();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
