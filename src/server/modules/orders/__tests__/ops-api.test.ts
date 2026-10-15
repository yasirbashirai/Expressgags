/**
 * Operations API integration tests (supertest → real Postgres): orders, documents, exceptions,
 * dispatch assignment and public tracking privacy. Data uses a unique tag and is removed afterwards.
 */
import "../../../lib/env";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("operations API", async () => {
  const { app } = await import("../../../app");
  const { prisma } = await import("../../../db");
  const { hashPassword } = await import("../../../auth");
  const tag = randomBytes(3).toString("hex");
  const pw = "Ops-Test-Password-1!";
  const emails = { disp: `ops-disp-${tag}@test.local`, staff: `ops-staff-${tag}@test.local`, acct: `ops-acct-${tag}@test.local` };
  const custEmail = `ops-cust-${tag}@example.org`;
  const ids: { employees: string[]; vehicles: string[]; orders: string[]; quotes: string[] } = { employees: [], vehicles: [], orders: [], quotes: [] };
  let disp: ReturnType<typeof request.agent>;

  const date = "2026-11-20";
  const orderBody = (over: object = {}) => ({
    customer: { name: `Ops Test ${tag}`, email: custEmail, phone: "(305) 555-7788" },
    serviceType: "luggage-local",
    pickup: { type: "hotel", address: "Hotel on Collins Ave, Miami Beach, FL 33139", market: "miami" },
    delivery: { type: "cruise-port", address: "PortMiami Terminal B, Miami, FL 33132", facility: "portmiami", market: "miami" },
    serviceDate: date,
    timeWindow: "morning",
    pieces: [{ category: "standard-checked", quantity: 3 }, { category: "special", description: "Golf clubs" }],
    guestName: "Ana Lopez",
    guestRoom: "1204",
    ...over,
  });

  beforeAll(async () => {
    const passwordHash = await hashPassword(pw);
    await prisma.user.createMany({
      data: [
        { email: emails.disp, role: "DISPATCHER", passwordHash, name: "Dee Dispatch" },
        { email: emails.staff, role: "STAFF", passwordHash },
        { email: emails.acct, role: "ACCOUNTING", passwordHash },
      ],
    });
    disp = request.agent(app);
    expect((await disp.post("/v1/admin/auth/login").send({ email: emails.disp, password: pw })).status).toBe(200);
    const e1 = await prisma.employee.create({ data: { firstName: "Marco", lastName: `Ops${tag}`, role: "DRIVER", phone: "305-555-0001" } });
    const e2 = await prisma.employee.create({ data: { firstName: "Lena", lastName: `Ops${tag}`, role: "HELPER" } });
    const v1 = await prisma.vehicle.create({ data: { unitNumber: `OPS-${tag}`, vehicleClassCode: "box-20", status: "MAINTENANCE" } });
    ids.employees.push(e1.id, e2.id);
    ids.vehicles.push(v1.id);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { id: { in: ids.orders } } });
    await prisma.quoteRequest.deleteMany({ where: { id: { in: ids.quotes } } });
    await prisma.customer.deleteMany({ where: { email: custEmail } });
    await prisma.assignment.deleteMany({ where: { employeeId: { in: ids.employees } } });
    await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: ids.vehicles } } });
    await prisma.auditLog.deleteMany({ where: { user: { email: { in: Object.values(emails) } } } });
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  });

  let orderId = "";
  let reference = "";

  it("rejects unauthenticated and read-only writes", async () => {
    expect((await request(app).get("/v1/admin/orders")).status).toBe(401);
    const acct = request.agent(app);
    await acct.post("/v1/admin/auth/login").send({ email: emails.acct, password: pw });
    expect((await acct.get("/v1/admin/orders")).status).toBe(200);
    expect((await acct.post("/v1/admin/orders").send(orderBody())).status).toBe(403);
  });

  it("creates an order with one piece ID per bag", async () => {
    const res = await disp.post("/v1/admin/orders").send(orderBody());
    expect(res.status).toBe(201);
    orderId = res.body.order.id;
    reference = res.body.order.reference;
    ids.orders.push(orderId);
    const d = await disp.get(`/v1/admin/orders/${orderId}`);
    expect(d.body.order.pieces.map((p: { pieceId: string }) => p.pieceId)).toEqual([1, 2, 3, 4].map((n) => `${reference}-0${n}`));
    expect(d.body.order.status).toBe("CONFIRMED");
    expect(d.body.order.guestRoom).toBe("1204");
  });

  it("validates input", async () => {
    const res = await disp.post("/v1/admin/orders").send(orderBody({ serviceDate: "20/11/2026", pieces: [] }));
    expect(res.status).toBe(400);
  });

  it("finds orders by piece ID, guest name and status filter", async () => {
    for (const q of [`${reference}-03`, "Ana Lopez", reference.slice(-4)]) {
      const r = await disp.get("/v1/admin/orders").query({ q });
      expect(r.body.orders.some((o: { id: string }) => o.id === orderId)).toBe(true);
    }
    const none = await disp.get("/v1/admin/orders").query({ q: reference, status: "DELIVERED" });
    expect(none.body.orders).toHaveLength(0);
  });

  it("imports a group manifest and continues numbering", async () => {
    const res = await disp.post(`/v1/admin/orders/${orderId}/manifest`).send({ csv: "guest,room,category,qty\nBen Ito,88,large,2" });
    expect(res.body.added).toBe(2);
    const d = await disp.get(`/v1/admin/orders/${orderId}`);
    expect(d.body.order.pieces.at(-1).pieceId).toBe(`${reference}-06`);
    const bad = await disp.post(`/v1/admin/orders/${orderId}/manifest`).send({ csv: "category\nspaceship" });
    expect(bad.status).toBe(400);
  });

  it("prints QR bag tags and the manifest as PDFs", async () => {
    for (const path of ["tags.pdf", "tags.pdf?layout=letter", "manifest.pdf"]) {
      const r = await disp.get(`/v1/admin/orders/${orderId}/${path}`).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
      expect(r.status).toBe(200);
      expect(r.headers["content-type"]).toContain("application/pdf");
      expect((r.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    }
  });

  it("tracking requires a matching verifier and hides the driver before assignment", async () => {
    expect((await request(app).post("/v1/track").send({ reference, verifier: "wrong@example.org" })).status).toBe(404);
    expect((await request(app).post("/v1/track").send({ reference: "EB-000000-ZZZZ", verifier: custEmail })).status).toBe(404);
    const ok = await request(app).post("/v1/track").send({ reference, verifier: "7788" });
    expect(ok.status).toBe(200);
    expect(ok.body.tracking.status).toBe("CONFIRMED");
    expect(ok.body.tracking.driver).toBeNull();
    expect(JSON.stringify(ok.body)).not.toMatch(/retailCents|costCents|internalNotes|Collins Ave.*1204/);
    const byZip = await request(app).post("/v1/track").send({ reference: `${reference}-02`, verifier: "33132" });
    expect(byZip.status).toBe(200);
  });

  it("dispatch warns about conflicts, assigns crew and moves the order to DRIVER_ASSIGNED", async () => {
    const [driver, helper] = ids.employees;
    const check = await disp.post("/v1/admin/dispatch/check").send({ orderId, employeeId: driver, vehicleId: ids.vehicles[0] });
    const codes = check.body.conflicts.map((c: { code: string }) => c.code);
    expect(codes).toContain("vehicle-status"); // unit is in maintenance
    expect(codes).toContain("credential-missing"); // PortMiami without a credential on file

    const a1 = await disp.post("/v1/admin/dispatch/assign").send({ orderId, employeeId: driver, role: "DRIVER" });
    expect(a1.status).toBe(201);
    const a2 = await disp.post("/v1/admin/dispatch/assign").send({ orderId, employeeId: helper, role: "HELPER" });
    expect(a2.status).toBe(201);
    const d = await disp.get(`/v1/admin/orders/${orderId}`);
    expect(d.body.order.status).toBe("DRIVER_ASSIGNED");
    expect(d.body.order.assignments).toHaveLength(2);

    const board = await disp.get("/v1/admin/dispatch/board").query({ date });
    const lane = board.body.lanes.find((l: { employee: { id: string } }) => l.employee.id === driver);
    expect(lane.jobs.map((j: { jobId: string }) => j.jobId)).toContain(orderId);
    expect(board.body.unassigned).not.toContain(orderId);
  });

  it("tracking shows only the driver's first name after assignment", async () => {
    const r = await request(app).post("/v1/track").send({ reference, verifier: custEmail.toUpperCase() });
    expect(r.body.tracking.driver.firstName).toBe("Marco");
    expect(JSON.stringify(r.body)).not.toContain(`Ops${tag}`); // last name never shown
    expect(JSON.stringify(r.body)).not.toContain("Lena"); // helpers never shown
    expect(JSON.stringify(r.body)).not.toContain("305-555-0001"); // driver's own phone never shown
  });

  it("enforces the status state machine and cancel reasons", async () => {
    expect((await disp.post(`/v1/admin/orders/${orderId}/status`).send({ to: "DELIVERED" })).status).toBe(409);
    expect((await disp.post(`/v1/admin/orders/${orderId}/status`).send({ to: "EN_ROUTE" })).status).toBe(200);
    expect((await disp.post(`/v1/admin/orders/${orderId}/status`).send({ to: "CANCELLED" })).status).toBe(400);
  });

  it("reports, lists by severity, and resolves exceptions", async () => {
    const low = await disp.post(`/v1/admin/orders/${orderId}/exceptions`).send({ type: "ADDRESS_PROBLEM", severity: "LOW", detail: "Gate code missing" });
    const crit = await disp.post(`/v1/admin/orders/${orderId}/exceptions`).send({ type: "COUNT_MISMATCH", severity: "CRITICAL", detail: "5 bags at pickup, 6 on manifest" });
    expect(low.status).toBe(201);
    const inbox = await disp.get("/v1/admin/orders/exceptions");
    const mine = inbox.body.exceptions.filter((e: { orderId: string }) => e.orderId === orderId);
    expect(mine[0].id).toBe(crit.body.exception.id); // critical first
    expect((await disp.patch(`/v1/admin/orders/exceptions/${crit.body.exception.id}`).send({ status: "RESOLVED" })).status).toBe(400);
    const done = await disp.patch(`/v1/admin/orders/exceptions/${crit.body.exception.id}`).send({ status: "RESOLVED", resolution: "6th bag found in lobby" });
    expect(done.body.exception.status).toBe("RESOLVED");
  });

  it("unassigning the only driver returns the order to the queue", async () => {
    const o2 = await disp.post("/v1/admin/orders").send(orderBody({ guestName: "Second", pieces: [{ category: "large" }] }));
    ids.orders.push(o2.body.order.id);
    const a = await disp.post("/v1/admin/dispatch/assign").send({ orderId: o2.body.order.id, employeeId: ids.employees[0], role: "DRIVER" });
    const del = await disp.delete(`/v1/admin/dispatch/assignments/${a.body.assignment.id}`);
    expect(del.status).toBe(200);
    const d = await disp.get(`/v1/admin/orders/${o2.body.order.id}`);
    expect(d.body.order.status).toBe("CONFIRMED");
    expect(d.body.order.assignedDriverRef).toBeNull();
  });

  it("reorders a driver's stops", async () => {
    const o3 = await disp.post("/v1/admin/orders").send(orderBody({ guestName: "Third", pieces: [{ category: "large" }] }));
    ids.orders.push(o3.body.order.id);
    await disp.post("/v1/admin/dispatch/assign").send({ orderId: o3.body.order.id, employeeId: ids.employees[0], role: "DRIVER" });
    const r = await disp.post("/v1/admin/dispatch/reorder").send({ employeeId: ids.employees[0], date, orderIds: [o3.body.order.id, orderId] });
    expect(r.status).toBe(200);
    const board = await disp.get("/v1/admin/dispatch/board").query({ date });
    const lane = board.body.lanes.find((l: { employee: { id: string } }) => l.employee.id === ids.employees[0]);
    expect(lane.jobs[0].jobId).toBe(o3.body.order.id);
    expect((await disp.post("/v1/admin/dispatch/reorder").send({ employeeId: ids.employees[0], date, orderIds: ["not-assigned"] })).status).toBe(400);
  });

  it("sweep flags late pickups once", async () => {
    const past = await disp.post("/v1/admin/orders").send(orderBody({ serviceDate: new Date(Date.now() - 864e5).toISOString().slice(0, 10), guestName: "Late", pieces: [{ category: "large" }] }));
    ids.orders.push(past.body.order.id);
    const s1 = await disp.post("/v1/admin/orders/exceptions/sweep");
    expect(s1.body.created.some((c: { orderId: string }) => c.orderId === past.body.order.id)).toBe(true);
    const s2 = await disp.post("/v1/admin/orders/exceptions/sweep");
    expect(s2.body.created.some((c: { orderId: string }) => c.orderId === past.body.order.id)).toBe(false);
  });

  it("converts a website quote request into an order exactly once", async () => {
    const quote = await request(app).post("/v1/quotes").send({
      serviceType: "cruise",
      pickup: { type: "hotel", address: "Brickell hotel, Miami, FL 33131", market: "miami" },
      delivery: { type: "cruise-port", address: "PortMiami", facility: "portmiami", market: "miami" },
      serviceDate: "2026-12-02",
      timeWindow: "morning",
      items: [{ category: "standard-checked", quantity: 2 }, { category: "carry-on", quantity: 1 }],
      contact: { name: `Ops Quote ${tag}`, email: custEmail, phone: "305-555-7788" },
      leadSource: "referral",
      acceptsProhibitedItemsPolicy: true,
      consentToContact: true,
    });
    expect(quote.status).toBe(201);
    const q = await prisma.quoteRequest.findUnique({ where: { reference: quote.body.reference } });
    ids.quotes.push(q!.id);
    const conv = await disp.post(`/v1/admin/orders/from-quote/${q!.id}`).send({});
    expect(conv.status).toBe(201);
    ids.orders.push(conv.body.order.id);
    const d = await disp.get(`/v1/admin/orders/${conv.body.order.id}`);
    expect(d.body.order.pieces).toHaveLength(3);
    expect(d.body.order.quote.reference).toBe(quote.body.reference);
    expect((await disp.post(`/v1/admin/orders/from-quote/${q!.id}`).send({})).status).toBe(409);
    expect((await prisma.quoteRequest.findUnique({ where: { id: q!.id } }))!.status).toBe("WON");
  });
});
