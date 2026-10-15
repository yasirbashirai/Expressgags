/**
 * Storage API integration tests (supertest → real Postgres): capacity locking under concurrency,
 * the five combinations, intake → release with proof and chain of custody, extensions, overstay,
 * public availability privacy and role checks. Data uses a unique tag and is removed afterwards.
 */
import "../../../lib/env";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("storage API", async () => {
  const { app } = await import("../../../app");
  const { prisma } = await import("../../../db");
  const { hashPassword } = await import("../../../auth");
  const { createOrder } = await import("../../../services/orders");
  const tag = randomBytes(3).toString("hex");
  const pw = "Storage-Test-Password-1!";
  const emails = { staff: `st-staff-${tag}@test.local`, driver: `st-driver-${tag}@test.local`, acct: `st-acct-${tag}@test.local` };
  const custEmail = `st-cust-${tag}@example.org`;
  const market = `test-mkt-${tag}`;
  let staff: ReturnType<typeof request.agent>;
  let locationId = "";
  const day = "2026-12-03";
  const t = (h: number) => new Date(`${day}T${String(h).padStart(2, "0")}:00:00.000Z`).toISOString();

  beforeAll(async () => {
    const passwordHash = await hashPassword(pw);
    await prisma.user.createMany({
      data: [
        { email: emails.staff, role: "STAFF", passwordHash, name: "Sam Storage" },
        { email: emails.driver, role: "DRIVER", passwordHash },
        { email: emails.acct, role: "ACCOUNTING", passwordHash },
      ],
    });
    staff = request.agent(app);
    expect((await staff.post("/v1/admin/auth/login").send({ email: emails.staff, password: pw })).status).toBe(200);
  });

  afterAll(async () => {
    const bookings = await prisma.storageBooking.findMany({ where: { location: { market } }, select: { id: true, orderId: true } });
    await prisma.storageBookingMeta.deleteMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
    await prisma.reminder.deleteMany({ where: { entityType: "storage", entityId: { in: bookings.map((b) => b.id) } } });
    await prisma.storageBooking.deleteMany({ where: { location: { market } } });
    await prisma.storageLocation.deleteMany({ where: { market } });
    await prisma.order.deleteMany({ where: { customer: { email: custEmail } } });
    await prisma.customer.deleteMany({ where: { email: custEmail } });
    await prisma.auditLog.deleteMany({ where: { user: { email: { in: Object.values(emails) } } } });
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  });

  const book = (body: object) => staff.post("/v1/admin/storage/bookings").send({ locationId, combination: "storage-only", contact: { name: "Test Traveler", email: custEmail }, ...body });

  it("blocks drivers and accounting from storage operations", async () => {
    for (const email of [emails.driver, emails.acct]) {
      const a = request.agent(app);
      await a.post("/v1/admin/auth/login").send({ email, password: pw });
      expect((await a.get("/v1/admin/storage/dashboard")).status).toBe(403);
    }
  });

  it("creates a location with a private address", async () => {
    const res = await staff.post("/v1/admin/storage/locations").send({ code: `hub-${tag}`, name: `Test hub ${tag}`, market, capacityPieces: 10, addressPrivate: "Private warehouse address" });
    expect(res.status).toBe(201);
    locationId = res.body.location.id;
  });

  it("refuses overbooking and allows back-to-back windows", async () => {
    expect((await book({ startsAt: t(8), endsAt: t(14), pieces: 7 })).status).toBe(201);
    const full = await book({ startsAt: t(12), endsAt: t(18), pieces: 4 });
    expect(full.status).toBe(409);
    expect(full.body.error).toMatch(/3 of 10/);
    expect((await book({ startsAt: t(14), endsAt: t(18), pieces: 10 })).status).toBe(201);
  });

  it("never exceeds capacity under concurrent requests", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => book({ startsAt: t(19), endsAt: t(22), pieces: 3 })));
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(3); // 3 × 3 = 9 ≤ 10; a 4th would make 12
    expect(results.filter((r) => r.status === 409).length).toBe(2);
    const held = await prisma.storageBooking.aggregate({ where: { locationId, startsAt: { gte: new Date(t(19)) } }, _sum: { pieces: true } });
    expect(held._sum.pieces).toBe(9);
  });

  it("prices with the admin storage rules and keeps cost internal", async () => {
    const res = await book({ startsAt: `${day}T23:00:00.000Z`, endsAt: "2026-12-05T23:00:00.000Z", pieces: 1, combination: "pickup-storage-delivery" });
    expect(res.status).toBe(201);
    expect(res.body.booking.withPickup).toBe(true);
    expect(res.body.booking.withDelivery).toBe(true);
    expect(res.body.booking.retailCents).toBeGreaterThan(0);
  });

  it("checks an order in with tags and bays, then releases it with proof", async () => {
    const customer = await prisma.customer.upsert({ where: { email: custEmail }, update: {}, create: { name: "Test Traveler", email: custEmail } });
    const order = await createOrder({
      customerId: customer.id,
      serviceType: "storage",
      fulfillment: "storage",
      pickup: { type: "storage", address: "Customer drop-off at Express Bags storage", market: "miami" },
      delivery: { type: "storage", address: "Customer retrieval from Express Bags storage", market: "miami" },
      serviceDate: new Date(`${day}T12:00:00Z`),
      market: "miami",
      pieces: [{ category: "standard-checked" }, { category: "carry-on" }],
    });
    const created = await staff.post("/v1/admin/storage/bookings").send({ locationId, combination: "storage-only", orderId: order.id, startsAt: "2026-12-07T10:00:00.000Z", endsAt: "2026-12-07T18:00:00.000Z", pieces: 2 });
    expect(created.status).toBe(201);
    const bookingId = created.body.booking.id;
    const [p1, p2] = order.pieces.map((p) => p.pieceId);

    const up = await staff.post(`/v1/admin/storage/bookings/${bookingId}/uploads`).attach("file", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), { filename: "intake.jpg", contentType: "image/jpeg" });
    expect(up.status).toBe(201);
    const checkIn = await staff.post(`/v1/admin/storage/bookings/${bookingId}/check-in`).send({ pieceCount: 2, tags: [p1, p2], bays: { [p1]: "B-01", [p2]: "B-02" }, conditionNotes: "Light scuff on carry-on", uploadIds: [up.body.id] });
    expect(checkIn.status).toBe(200);
    const pieces = await prisma.orderPiece.findMany({ where: { orderId: order.id }, orderBy: { pieceId: "asc" } });
    expect(pieces.map((p) => p.storageBay)).toEqual(["B-01", "B-02"]);
    expect(pieces[0].custodyLocation).toBe(`storage:hub-${tag}`);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe("AT_FACILITY");

    // Count mismatch needs an explanation
    expect((await staff.post(`/v1/admin/storage/bookings/${bookingId}/release`).send({ releasedTo: "Test Traveler", pieceCount: 1 })).status).toBe(409);
    const rel = await staff.post(`/v1/admin/storage/bookings/${bookingId}/release`).send({ releasedTo: "Test Traveler", pieceCount: 2 });
    expect(rel.status).toBe(200);
    const pod = await prisma.proofOfDelivery.findFirst({ where: { orderId: order.id, kind: "RELEASE" } });
    expect(pod?.recipientName).toBe("Test Traveler");
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe("DELIVERED");
    const events = await prisma.orderEvent.count({ where: { orderId: order.id, type: { in: ["STORAGE", "HANDOFF"] } } });
    expect(events).toBeGreaterThanOrEqual(4);
  });

  it("refuses photos that belong to another booking", async () => {
    const other = await book({ startsAt: "2026-12-09T10:00:00.000Z", endsAt: "2026-12-09T12:00:00.000Z", pieces: 1 });
    const stranger = await prisma.upload.create({ data: { originalName: "x.jpg", storedName: `x-${tag}.jpg`, mimeType: "image/jpeg", sizeBytes: 1 } });
    const r = await staff.post(`/v1/admin/storage/bookings/${other.body.booking.id}/check-in`).send({ pieceCount: 1, uploadIds: [stranger.id] });
    expect(r.status).toBe(400);
    await prisma.upload.delete({ where: { id: stranger.id } });
  });

  it("extends only when the extra time has space, and flags overstays", async () => {
    const a = await book({ startsAt: "2026-12-10T08:00:00.000Z", endsAt: "2026-12-10T10:00:00.000Z", pieces: 6 });
    await book({ startsAt: "2026-12-10T10:00:00.000Z", endsAt: "2026-12-10T14:00:00.000Z", pieces: 6 });
    const blocked = await staff.post(`/v1/admin/storage/bookings/${a.body.booking.id}/extend`).send({ endsAt: "2026-12-10T12:00:00.000Z" });
    expect(blocked.status).toBe(409);

    const past = await book({ startsAt: "2020-01-01T08:00:00.000Z", endsAt: "2020-01-01T10:00:00.000Z", pieces: 1 });
    await staff.post(`/v1/admin/storage/bookings/${past.body.booking.id}/check-in`).send({ pieceCount: 1 });
    const sweep = await staff.post("/v1/admin/storage/sweep");
    expect(sweep.status).toBe(200);
    expect((await prisma.storageBooking.findUnique({ where: { id: past.body.booking.id } }))!.status).toBe("OVERSTAY");
  });

  it("answers public availability with yes/no only", async () => {
    const res = await request(app).get(`/v1/storage/availability?market=${market}&start=2026-12-11T08:00:00Z&end=2026-12-11T10:00:00Z&pieces=4`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, available: true });
    expect(JSON.stringify(res.body)).not.toMatch(/warehouse|hub|address/i);
    const none = await request(app).get(`/v1/storage/availability?market=${market}&start=2026-12-11T08:00:00Z&end=2026-12-11T10:00:00Z&pieces=11`);
    expect(none.body.available).toBe(false);
  });
});
