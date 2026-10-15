import "../../lib/env";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../db";
import { JOBS, runJob, type JobDef } from "../index";
import { isDue, lastSlot, zonedParts, zonedTimeToUtc } from "../schedule";

describe("job schedules (America/New_York, DST-safe)", () => {
  it("converts wall-clock ET to UTC in summer (EDT, UTC-4) and winter (EST, UTC-5)", () => {
    expect(zonedTimeToUtc(2026, 7, 15, 7, 0).toISOString()).toBe("2026-07-15T11:00:00.000Z");
    expect(zonedTimeToUtc(2026, 12, 15, 7, 0).toISOString()).toBe("2026-12-15T12:00:00.000Z");
  });

  it("daily job is due once per day after its slot", () => {
    const daily = { kind: "daily" as const, hour: 6, minute: 0 };
    const before = new Date("2026-11-02T10:59:00Z"); // 05:59 EST
    const after = new Date("2026-11-02T11:01:00Z"); // 06:01 EST
    const yesterdayRun = new Date("2026-11-01T11:00:30Z");
    expect(isDue(daily, before, yesterdayRun)).toBe(false);
    expect(isDue(daily, after, yesterdayRun)).toBe(true);
    expect(isDue(daily, after, after)).toBe(false);
    expect(isDue(daily, after, null)).toBe(true);
  });

  it("daily slot is correct on the DST change day (Nov 1, 2026)", () => {
    const slot = lastSlot({ kind: "daily", hour: 7, minute: 0 }, new Date("2026-11-01T15:00:00Z"))!;
    expect(zonedParts(slot).hour).toBe(7);
    expect(slot.toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });

  it("weekly Monday 07:00 slot", () => {
    // Thursday 2026-10-15 → previous Monday 2026-10-12 07:00 EDT = 11:00Z
    const slot = lastSlot({ kind: "weekly", weekday: 1, hour: 7, minute: 0 }, new Date("2026-10-15T15:00:00Z"))!;
    expect(slot.toISOString()).toBe("2026-10-12T11:00:00.000Z");
    // Monday before 7 AM → previous week's Monday
    const early = lastSlot({ kind: "weekly", weekday: 1, hour: 7, minute: 0 }, new Date("2026-10-12T10:00:00Z"))!;
    expect(early.toISOString()).toBe("2026-10-05T11:00:00.000Z");
  });

  it("interval jobs respect their period", () => {
    const s = { kind: "interval" as const, minutes: 15 };
    const now = new Date("2026-10-15T12:00:00Z");
    expect(isDue(s, now, new Date("2026-10-15T11:50:00Z"))).toBe(false);
    expect(isDue(s, now, new Date("2026-10-15T11:45:00Z"))).toBe(true);
  });

  it("every platform job has a unique name and a lease", () => {
    const names = JOBS.map((j) => j.name);
    expect(new Set(names).size).toBe(names.length);
    for (const j of JOBS) expect(j.leaseMinutes).toBeGreaterThan(0);
  });
});

describe("job lease locking", () => {
  const name = `test.lease-${Date.now().toString(36)}`;
  afterAll(async () => {
    await prisma.jobState.deleteMany({ where: { name } });
  });

  it("two concurrent runs of the same job: exactly one executes", async () => {
    let runs = 0;
    const job: JobDef = {
      name,
      schedule: { kind: "interval", minutes: 1 },
      leaseMinutes: 5,
      run: async () => {
        runs++;
        await new Promise((r) => setTimeout(r, 150));
        return { ok: true };
      },
    };
    const [a, b] = await Promise.all([runJob(job), runJob(job)]);
    expect([a.status, b.status].sort()).toEqual(["LOCKED", "OK"]);
    expect(runs).toBe(1);
    const state = await prisma.jobState.findUnique({ where: { name } });
    expect(state?.lockedUntil).toBeNull(); // released
    expect(state?.lastStatus).toBe("OK");
  });

  it("a failing job records the error, releases the lease and does not throw", async () => {
    const r = await runJob({ name, schedule: { kind: "interval", minutes: 1 }, leaseMinutes: 5, run: async () => { throw new Error("boom"); } });
    expect(r.status).toBe("ERROR");
    const state = await prisma.jobState.findUnique({ where: { name } });
    expect(state?.lastError).toBe("boom");
    expect(state?.lockedUntil).toBeNull();
    // and the next run can take the lease again
    expect((await runJob({ name, schedule: { kind: "interval", minutes: 1 }, leaseMinutes: 5, run: async () => 1 })).status).toBe("OK");
  });

  it("an expired lease from a crashed worker is taken over", async () => {
    await prisma.jobState.update({ where: { name }, data: { lockedBy: "dead-worker", lockedUntil: new Date(Date.now() - 1000) } });
    expect((await runJob({ name, schedule: { kind: "interval", minutes: 1 }, leaseMinutes: 5, run: async () => 1 })).status).toBe("OK");
  });

  it("disabled jobs are skipped with a reason", async () => {
    const r = await runJob({ name, schedule: { kind: "interval", minutes: 1 }, leaseMinutes: 5, enabled: () => "key missing", run: async () => 1 });
    expect(r).toMatchObject({ status: "SKIPPED", reason: "key missing" });
  });
});
