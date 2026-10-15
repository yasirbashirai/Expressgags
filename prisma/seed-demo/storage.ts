/**
 * Demo storage data for development and client walkthroughs (NOT for production):
 * two storage locations with PLACEHOLDER capacities (Express Bags sets the real numbers), and a day of
 * bookings across the storage combinations (reserved, in storage, one overstay). Contacts are fictional
 * (example.com). Idempotent: demo locations use codes starting with "demo-" and are replaced each run.
 *
 * Run standalone: npx tsx prisma/seed-demo/storage.ts
 */
import type { PrismaClient } from "../../src/server/generated/prisma/client";

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000);
let n = 0;
const ref = () => `EB-ST-DEMO-${String(++n).padStart(2, "0")}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

export async function seedStorage(prisma: PrismaClient) {
  const old = await prisma.storageBooking.findMany({ where: { location: { code: { startsWith: "demo-" } } }, select: { id: true } });
  await prisma.storageBookingMeta.deleteMany({ where: { bookingId: { in: old.map((b) => b.id) } } });
  await prisma.storageBooking.deleteMany({ where: { id: { in: old.map((b) => b.id) } } });
  await prisma.storageLocation.deleteMany({ where: { code: { startsWith: "demo-" } } });

  const mia = await prisma.storageLocation.create({
    data: { code: "demo-mia-hub", name: "Miami storage hub (demo)", market: "miami", capacityPieces: 120, rules: { blockHours: 1 }, addressPrivate: "DEMO address, private" },
  });
  const fll = await prisma.storageLocation.create({
    data: { code: "demo-fll-bay", name: "Fort Lauderdale storage bay (demo)", market: "fort-lauderdale-broward", capacityPieces: 60, rules: { blockHours: 2 }, addressPrivate: "DEMO address, private" },
  });

  const rows: { loc: string; start: number; end: number; pieces: number; status: string; combination: string; name: string; pickup?: boolean; delivery?: boolean }[] = [
    { loc: mia.id, start: 2, end: 9, pieces: 4, status: "RESERVED", combination: "storage-only", name: "Demo Traveler A" },
    { loc: mia.id, start: 3, end: 30, pieces: 18, status: "RESERVED", combination: "pickup-storage-delivery", name: "Demo Tour Group", pickup: true, delivery: true },
    { loc: mia.id, start: -5, end: 4, pieces: 6, status: "CHECKED_IN", combination: "storage-delivery", name: "Demo Cruise Family", delivery: true },
    { loc: mia.id, start: -30, end: -3, pieces: 2, status: "OVERSTAY", combination: "storage-only", name: "Demo Late Pickup" },
    { loc: fll.id, start: 1, end: 6, pieces: 8, status: "RESERVED", combination: "pickup-storage", name: "Demo Resort Guests", pickup: true },
    { loc: fll.id, start: -2, end: 20, pieces: 3, status: "CHECKED_IN", combination: "storage-shipping", name: "Demo Shipper" },
  ];
  for (const r of rows) {
    const b = await prisma.storageBooking.create({
      data: {
        reference: ref(),
        locationId: r.loc,
        startsAt: hoursFromNow(r.start),
        endsAt: hoursFromNow(r.end),
        pieces: r.pieces,
        status: r.status,
        withPickup: !!r.pickup,
        withDelivery: !!r.delivery,
        retailCents: 1500 * r.pieces,
        checkedInAt: r.status === "RESERVED" ? null : hoursFromNow(r.start),
      },
    });
    await prisma.storageBookingMeta.create({
      data: {
        bookingId: b.id,
        combination: r.combination,
        contactName: r.name,
        contactEmail: `${r.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        notes: "DEMO booking, delete before launch",
        pieceTags: [],
        intakeUploadIds: [],
        releaseUploadIds: [],
        intakeCount: r.status === "RESERVED" ? null : r.pieces,
        checkedInBy: r.status === "RESERVED" ? null : "Demo staff",
      },
    });
  }
  return { locations: 2, bookings: rows.length };
}

// Standalone run
if (process.argv[1]?.endsWith("storage.ts")) {
  (async () => {
    await import("../../src/server/lib/env");
    const { prisma } = await import("../../src/server/db");
    console.log("Demo storage data:", await seedStorage(prisma));
    await prisma.$disconnect();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
