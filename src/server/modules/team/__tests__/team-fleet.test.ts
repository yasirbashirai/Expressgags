/**
 * Team, fleet, credentials, availability conflicts and reminders — CRUD, role checks, uploads, reports.
 */
process.env.LOGIN_RATE_LIMIT = "10000";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL || (() => { try { process.loadEnvFile(".env"); return !!process.env.DATABASE_URL; } catch { return false; } })();

describe.skipIf(!hasDb)("team & fleet", async () => {
  const { app } = await import("../../../app");
  const { prisma } = await import("../../../db");
  const { hashPassword } = await import("../../../auth");
  const { availabilityConflicts } = await import("../availability");
  const { runReminders, upcomingExpirations } = await import("../reminders");
  const tag = randomBytes(3).toString("hex");
  const pw = `Team-Test-Pass-${tag}!`;
  const emails = { owner: `tf-owner-${tag}@test.local`, staff: `tf-staff-${tag}@test.local`, disp: `tf-disp-${tag}@test.local`, acct: `tf-acct-${tag}@test.local`, driver: `tf-driver-${tag}@test.local` };
  const created = { employees: [] as string[], vehicles: [] as string[] };

  beforeAll(async () => {
    const passwordHash = await hashPassword(pw);
    await prisma.user.createMany({
      data: [
        { email: emails.owner, role: "OWNER", passwordHash },
        { email: emails.staff, role: "STAFF", passwordHash },
        { email: emails.disp, role: "DISPATCHER", passwordHash },
        { email: emails.acct, role: "ACCOUNTING", passwordHash },
      ],
    });
  });
  afterAll(async () => {
    await prisma.credential.deleteMany({ where: { OR: [{ employeeId: { in: created.employees } }, { vehicleId: { in: created.vehicles } }, { identifier: { startsWith: `TEST-${tag}` } }] } });
    await prisma.reminder.deleteMany({ where: { entityId: { in: [...created.employees, ...created.vehicles] } } });
    await prisma.employee.deleteMany({ where: { id: { in: created.employees } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: created.vehicles } } });
    const users = await prisma.user.findMany({ where: { email: { in: Object.values(emails) } } });
    await prisma.authToken.deleteMany({ where: { subjectId: { in: users.map((u) => u.id) } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  });

  const as = async (email: string) => {
    const agent = request.agent(app);
    expect((await agent.post("/v1/admin/auth/login").send({ email, password: pw })).status).toBe(200);
    return agent;
  };

  it("staff creates and edits a team member; dispatcher reads but cannot edit; accounting is blocked", async () => {
    const staff = await as(emails.staff);
    const res = await staff.post("/v1/admin/team").send({ firstName: "Demo", lastName: `Driver ${tag}`, role: "DRIVER", homeMarket: "miami", licenseClass: "Class C", licenseExpiresAt: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10) });
    expect(res.status).toBe(201);
    const id = res.body.employee.id as string;
    created.employees.push(id);
    expect((await staff.post("/v1/admin/team").send({ firstName: "", lastName: "x", role: "DRIVER" })).status).toBe(400);
    expect((await staff.patch(`/v1/admin/team/${id}`).send({ phone: "305-555-0199" })).body.employee.phone).toBe("305-555-0199");

    const disp = await as(emails.disp);
    expect((await disp.get("/v1/admin/team").query({ role: "DRIVER", q: tag })).body.employees).toHaveLength(1);
    expect((await disp.patch(`/v1/admin/team/${id}`).send({ phone: "1" })).status).toBe(403);
    const acct = await as(emails.acct);
    expect((await acct.get("/v1/admin/team")).status).toBe(403);
  });

  it("availability blocks drive dispatch conflict checks", async () => {
    const staff = await as(emails.staff);
    const id = created.employees[0];
    const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    expect((await staff.post(`/v1/admin/team/${id}/availability`).send({ kind: "SHIFT", startsAt: `${day}T12:00:00Z`, endsAt: `${day}T20:00:00Z` })).status).toBe(201);
    expect((await staff.post(`/v1/admin/team/${id}/availability`).send({ kind: "TIME_OFF", startsAt: `${day}T16:00:00Z`, endsAt: `${day}T17:00:00Z`, note: "Appointment" })).status).toBe(201);
    expect((await staff.post(`/v1/admin/team/${id}/availability`).send({ kind: "SHIFT", startsAt: `${day}T12:00:00Z`, endsAt: `${day}T11:00:00Z` })).status).toBe(400);

    expect(await availabilityConflicts([id], new Date(`${day}T13:00:00Z`), new Date(`${day}T15:00:00Z`))).toEqual([]);
    expect((await availabilityConflicts([id], new Date(`${day}T15:30:00Z`), new Date(`${day}T16:30:00Z`)))[0].reason).toBe("TIME_OFF");
    expect((await availabilityConflicts([id], new Date(`${day}T21:00:00Z`), new Date(`${day}T22:00:00Z`)))[0].reason).toBe("OUTSIDE_SHIFT");
    const check = await staff.post("/v1/admin/team/availability/check").send({ employeeIds: [id], start: `${day}T15:30:00Z`, end: `${day}T16:30:00Z` });
    expect(check.body.conflicts).toHaveLength(1);
    const week = await staff.get("/v1/admin/team/availability").query({ from: day, to: `${day}T23:59:59Z`, employeeId: id });
    expect(week.body.blocks).toHaveLength(2);
  });

  it("uploads an employee document privately and serves it to staff only", async () => {
    const staff = await as(emails.staff);
    const id = created.employees[0];
    const up = await staff.post(`/v1/admin/team/${id}/documents`).field("title", "Driver license copy").field("expiresAt", "2027-01-01").attach("file", Buffer.from("%PDF-1.4 test"), { filename: "license.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);
    const uploadId = up.body.document.uploadId;
    expect((await staff.get(`/v1/admin/team/files/${uploadId}`)).status).toBe(200);
    expect((await request(app).get(`/v1/admin/team/files/${uploadId}`)).status).toBe(401);
    const bad = await staff.post(`/v1/admin/team/${id}/documents`).attach("file", Buffer.from("MZ"), { filename: "x.exe", contentType: "application/octet-stream" });
    expect(bad.status).toBe(415);
  });

  it("fleet: create, unique unit, maintenance with cost, dispatcher status-only edits, report and CSV", async () => {
    const staff = await as(emails.staff);
    const unit = `T-${tag}`;
    const v = await staff.post("/v1/admin/fleet").send({ unitNumber: unit, vehicleClassCode: "box-26", make: "Isuzu", year: 2022, insuranceExpiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10) });
    expect(v.status).toBe(201);
    created.vehicles.push(v.body.vehicle.id);
    expect((await staff.post("/v1/admin/fleet").send({ unitNumber: unit, vehicleClassCode: "box-15" })).status).toBe(409);
    const vid = v.body.vehicle.id;
    const m = await staff.post(`/v1/admin/fleet/${vid}/maintenance`).send({ type: "Oil change", status: "COMPLETED", costCents: 12_500, odometer: 41_000 });
    expect(m.status).toBe(201);
    expect((await staff.get(`/v1/admin/fleet/${vid}`)).body.vehicle.odometer).toBe(41_000);
    await staff.post(`/v1/admin/fleet/${vid}/maintenance`).send({ type: "Brake inspection", scheduledFor: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) });

    const disp = await as(emails.disp);
    expect((await disp.patch(`/v1/admin/fleet/${vid}`).send({ status: "MAINTENANCE" })).status).toBe(200);
    expect((await disp.patch(`/v1/admin/fleet/${vid}`).send({ plate: "XYZ" })).status).toBe(403);

    const report = await staff.get("/v1/admin/fleet/report");
    expect(report.body.byStatus.MAINTENANCE).toBeGreaterThanOrEqual(1);
    expect(report.body.maintenanceSpendYtdCents).toBeGreaterThanOrEqual(12_500);
    const csv = await staff.get("/v1/admin/fleet/export.csv");
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.text).toContain(unit);
  });

  it("credentials register filters by holder, facility and expiry window", async () => {
    const staff = await as(emails.staff);
    const soon = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    const later = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10);
    expect((await staff.post("/v1/admin/team/credentials").send({ employeeId: created.employees[0], facility: "portmiami", type: "TWIC", identifier: `TEST-${tag}-1`, expiresAt: soon })).status).toBe(201);
    expect((await staff.post("/v1/admin/team/credentials").send({ facility: "company", type: "INSURANCE_COI", identifier: `TEST-${tag}-2`, expiresAt: later })).status).toBe(201);
    expect((await staff.post("/v1/admin/team/credentials").send({ employeeId: created.employees[0], vehicleId: created.vehicles[0], facility: "MIA", type: "OTHER" })).status).toBe(400);
    const within = await staff.get("/v1/admin/team/credentials").query({ within: 30, q: `TEST-${tag}` });
    expect(within.body.credentials.map((c: { identifier: string }) => c.identifier)).toEqual([`TEST-${tag}-1`]);
    const company = await staff.get("/v1/admin/team/credentials").query({ holder: "company", q: `TEST-${tag}` });
    expect(company.body.credentials).toHaveLength(1);
  });

  it("reminders find expiring license, insurance, credential and maintenance, and upsert once", async () => {
    const items = await upcomingExpirations(30);
    const mine = items.filter((i) => created.employees.includes(i.entityId) || created.vehicles.includes(i.entityId) || i.holder.includes(tag));
    const titles = mine.map((i) => i.title);
    expect(titles).toEqual(expect.arrayContaining(["Driver license expires", "Insurance expires", "Maintenance: Brake inspection"]));
    const first = await runReminders();
    expect(first.due).toBeGreaterThan(0);
    const rows = await prisma.reminder.findMany({ where: { entityId: { in: [...created.employees, ...created.vehicles] } } });
    const again = await runReminders();
    const rows2 = await prisma.reminder.findMany({ where: { entityId: { in: [...created.employees, ...created.vehicles] } } });
    expect(rows2.length).toBe(rows.length); // idempotent
    expect(again.due).toBe(first.due);
    const staff = await as(emails.staff);
    const widget = await staff.get("/v1/admin/team/reminders/upcoming").query({ days: 30 });
    expect(widget.body.within30).toBeGreaterThan(0);
  });

  it("owner links a DRIVER login to a team member (invite) and can remove it", async () => {
    const staff = await as(emails.staff);
    const id = created.employees[0];
    expect((await staff.post(`/v1/admin/team/${id}/login`).send({ email: emails.driver })).status).toBe(403);
    const owner = await as(emails.owner);
    const r = await owner.post(`/v1/admin/team/${id}/login`).send({ email: emails.driver, role: "DRIVER" });
    expect(r.status).toBe(201);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: emails.driver } });
    expect(u.role).toBe("DRIVER");
    expect(await prisma.authToken.count({ where: { subjectId: u.id, purpose: "invite", usedAt: null } })).toBe(1);
    expect((await owner.post(`/v1/admin/team/${id}/login`).send({ email: emails.driver })).status).toBe(409);
    expect((await owner.delete(`/v1/admin/team/${id}/login`)).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).active).toBe(false);
  });
});
