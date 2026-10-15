/**
 * Driver API integration tests (supertest + real Postgres). Skipped when no database is reachable.
 * Covers: role checks, assignment isolation, scan validation, idempotent replay, illegal transitions,
 * count-check on proofs, exceptions, and the full pickup → delivery flow.
 */
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";

const hasDb = !!process.env.DATABASE_URL || (() => { try { process.loadEnvFile(".env"); return !!process.env.DATABASE_URL; } catch { return false; } })();

describe.skipIf(!hasDb)("driver API", async () => {
  process.env.LOGIN_RATE_LIMIT ||= "1000";
  const { app } = await import("../../../app");
  const { prisma } = await import("../../../db");
  const { hashPassword } = await import("../../../auth");
  const fx = await import("./fixtures");

  const created = { userIds: [] as string[], employeeIds: [] as string[], customerIds: [] as string[] };
  let driverA: Awaited<ReturnType<typeof fx.createDriver>>;
  let driverB: Awaited<ReturnType<typeof fx.createDriver>>;
  let job: Awaited<ReturnType<typeof fx.createAssignedJob>>;
  let staffEmail = "";

  beforeAll(async () => {
    driverA = await fx.createDriver();
    driverB = await fx.createDriver();
    created.userIds.push(driverA.user.id, driverB.user.id);
    created.employeeIds.push(driverA.employee.id, driverB.employee.id);
    job = await fx.createAssignedJob(driverA.employee.id, { pieces: 3 });
    created.customerIds.push(job.customer.id);
    staffEmail = `staff-drv-${randomBytes(3).toString("hex")}@test.local`;
    const staff = await prisma.user.create({ data: { email: staffEmail, role: "STAFF", passwordHash: await hashPassword(fx.FIXTURE_PASSWORD) } });
    created.userIds.push(staff.id);
  });

  afterAll(async () => {
    await fx.cleanupFixture(created);
  });

  const login = async (email: string) => {
    const agent = request.agent(app);
    const res = await agent.post("/v1/admin/auth/login").send({ email, password: fx.FIXTURE_PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  };
  const key = () => randomUUID();

  it("requires a session and the DRIVER role", async () => {
    expect((await request(app).get("/v1/driver/jobs")).status).toBe(401);
    const staff = await login(staffEmail);
    expect((await staff.get("/v1/driver/jobs")).status).toBe(403);
  });

  it("lists only the driver's own jobs", async () => {
    const a = await login(driverA.user.email);
    const res = await a.get("/v1/driver/jobs?scope=today");
    expect(res.status).toBe(200);
    expect(res.body.jobs.map((j: { orderId: string }) => j.orderId)).toContain(job.order.id);
    const b = await login(driverB.user.email);
    const resB = await b.get("/v1/driver/jobs?scope=today");
    expect(resB.body.jobs.map((j: { orderId: string }) => j.orderId)).not.toContain(job.order.id);
    // Another driver cannot open or act on the job
    expect((await b.get(`/v1/driver/jobs/${job.order.id}`)).status).toBe(404);
    expect((await b.post(`/v1/driver/jobs/${job.order.id}/status`).send({ to: "EN_ROUTE" })).status).toBe(404);
  });

  it("job detail never exposes pricing or cost", async () => {
    const a = await login(driverA.user.email);
    const res = await a.get(`/v1/driver/jobs/${job.order.id}`);
    expect(res.status).toBe(200);
    expect(res.body.job.pieces).toHaveLength(3);
    expect(JSON.stringify(res.body)).not.toMatch(/retailCents|costCents|pricingBreakdown|margin/i);
  });

  it("runs the full pickup → delivery flow with idempotent replays", async () => {
    const a = await login(driverA.user.email);
    const id = job.order.id;
    const pieces = (await prisma.orderPiece.findMany({ where: { orderId: id }, orderBy: { pieceId: "asc" } })).map((p) => p.pieceId);

    // Accept moves CONFIRMED → DRIVER_ASSIGNED
    expect((await a.post(`/v1/driver/jobs/${id}/accept`).set("Idempotency-Key", key())).body.assignmentStatus).toBe("ACCEPTED");
    // Illegal jump straight to OUT_FOR_DELIVERY is refused
    expect((await a.post(`/v1/driver/jobs/${id}/status`).send({ to: "OUT_FOR_DELIVERY" })).status).toBe(409);
    expect((await a.post(`/v1/driver/jobs/${id}/status`).send({ to: "EN_ROUTE", lat: 25.79, lng: -80.13 })).body.status).toBe("EN_ROUTE");

    // Scan two of three; a foreign tag is a mismatch
    const k1 = key();
    const s1 = await a.post(`/v1/driver/jobs/${id}/scan`).set("Idempotency-Key", k1).send({ code: pieces[0].toLowerCase(), stage: "PICKUP" });
    expect(s1.body).toMatchObject({ ok: true, scanned: 1, total: 3 });
    // Replay of the same key returns the stored result and does not add a second scan event
    const replay = await a.post(`/v1/driver/jobs/${id}/scan`).set("Idempotency-Key", k1).send({ code: pieces[0], stage: "PICKUP" });
    expect(replay.body.replayed).toBe(true);
    expect(await prisma.orderEvent.count({ where: { orderId: id, type: "SCAN", detail: { startsWith: "STAGE:PICKUP" } } })).toBe(1);
    await a.post(`/v1/driver/jobs/${id}/scan`).send({ code: `QR:${pieces[1]}`, stage: "PICKUP" });
    expect((await a.post(`/v1/driver/jobs/${id}/scan`).send({ code: "EB-000000-ZZZZ-01", stage: "PICKUP" })).status).toBe(422);

    // Proof refused while a piece is unscanned (and no mismatch reported)
    const early = await a.post(`/v1/driver/jobs/${id}/proof`).send({ kind: "PICKUP" });
    expect(early.status).toBe(409);
    expect(early.body.error).toMatch(/1 of 3 pieces/);

    await a.post(`/v1/driver/jobs/${id}/scan`).send({ code: pieces[2], stage: "PICKUP" });
    // Photo upload is attached to the order privately
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const up = await a.post(`/v1/driver/jobs/${id}/upload`).field("kind", "order-photo").attach("file", png, { filename: "bag.png", contentType: "image/png" });
    expect(up.status).toBe(201);
    const pick = await a.post(`/v1/driver/jobs/${id}/proof`).set("Idempotency-Key", key()).send({ kind: "PICKUP", photoUploadIds: [up.body.id], conditionNotes: "Scuff on large case" });
    expect(pick.body).toMatchObject({ ok: true, status: "PICKED_UP", scanned: 3, total: 3 });

    // Delivery requires recipient; carrier handoff requires tracking number
    expect((await a.post(`/v1/driver/jobs/${id}/status`).send({ to: "TRANSFERRED_TO_CARRIER" })).status).toBe(400);
    expect((await a.post(`/v1/driver/jobs/${id}/status`).send({ to: "OUT_FOR_DELIVERY" })).body.status).toBe("OUT_FOR_DELIVERY");
    for (const p of pieces) await a.post(`/v1/driver/jobs/${id}/scan`).send({ code: p, stage: "DELIVERY" });
    const sig = await a.post(`/v1/driver/jobs/${id}/upload`).field("kind", "signature").attach("file", png, { filename: "signature.png", contentType: "image/png" });
    expect((await a.post(`/v1/driver/jobs/${id}/proof`).send({ kind: "DELIVERY" })).status).toBe(400);
    const done = await a.post(`/v1/driver/jobs/${id}/proof`).send({ kind: "DELIVERY", recipientName: "Terminal porter", signatureUploadId: sig.body.id });
    expect(done.body.status).toBe("DELIVERED");

    const order = await prisma.order.findUniqueOrThrow({ where: { id }, include: { proofs: true } });
    expect(order.status).toBe("DELIVERED");
    expect(order.proofs.map((p) => p.kind).sort()).toEqual(["DELIVERY", "PICKUP"]);
    expect((await prisma.assignment.findUniqueOrThrow({ where: { id: job.assignment.id } })).status).toBe("DONE");
  });

  it("allows completing with a reported count mismatch and rejects foreign uploads", async () => {
    const extra = await fx.createAssignedJob(driverA.employee.id, { pieces: 2 });
    created.customerIds.push(extra.customer.id);
    const a = await login(driverA.user.email);
    const id = extra.order.id;
    await a.post(`/v1/driver/jobs/${id}/accept`);
    await a.post(`/v1/driver/jobs/${id}/status`).send({ to: "EN_ROUTE" });
    const [p1] = (await prisma.orderPiece.findMany({ where: { orderId: id }, orderBy: { pieceId: "asc" } })).map((p) => p.pieceId);
    await a.post(`/v1/driver/jobs/${id}/scan`).send({ code: p1, stage: "PICKUP" });
    const ex = await a.post(`/v1/driver/jobs/${id}/exception`).send({ type: "COUNT_MISMATCH", severity: "HIGH", detail: "Guest says second bag is still in the room" });
    expect(ex.status).toBe(201);
    // Photo from the other job cannot be attached here
    const otherUpload = await prisma.upload.findFirst({ where: { ownerType: "order", ownerId: job.order.id } });
    expect((await a.post(`/v1/driver/jobs/${id}/proof`).send({ kind: "PICKUP", photoUploadIds: [otherUpload!.id] })).status).toBe(400);
    const ok = await a.post(`/v1/driver/jobs/${id}/proof`).send({ kind: "PICKUP" });
    expect(ok.body).toMatchObject({ status: "PICKED_UP", scanned: 1, total: 2 });
  });
});
