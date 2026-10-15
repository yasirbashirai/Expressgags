/**
 * Background job runner. Every scheduled platform task lives here:
 * notifications & surveys queue, reminders, billing housekeeping, storage & exception sweeps,
 * CMS scheduled-publish revalidation and the AI weekly report.
 *
 * Locking: a lease row per job (JobState.lockedUntil). A worker acquires the lease with a single
 * conditional UPDATE, so two workers (or a worker and a manual run) never run the same job at once,
 * and a crashed worker's lease simply expires. This works with DB_POOL_MAX=1, unlike session advisory locks.
 *
 * Run: `npm run jobs:once` (due jobs, then exit — for cron) · `npm run jobs:worker` (long-running loop).
 */
import { hostname } from "node:os";
import { prisma } from "../db";
import { describe, isDue, type Schedule } from "./schedule";

export type JobContext = { now: Date; lastStartedAt: Date | null };
export type JobDef = {
  name: string;
  schedule: Schedule;
  /** Lease length; must exceed the job's worst-case runtime */
  leaseMinutes: number;
  /** Return false/"skip reason" to skip (e.g. a provider key is missing) */
  enabled?: () => boolean | string;
  run: (ctx: JobContext) => Promise<unknown>;
};

/** Platform job table. Imports are lazy so the runner only loads what it executes. */
export const JOBS: JobDef[] = [
  {
    name: "notifications.queue",
    schedule: { kind: "interval", minutes: 1 },
    leaseMinutes: 5,
    // Order updates, receipts, staff alerts AND post-delivery survey invites (survey.request jobs)
    run: async () => (await import("../modules/notifications/worker")).processDueJobs(200),
  },
  {
    name: "exceptions.sweep",
    schedule: { kind: "interval", minutes: 15 },
    leaseMinutes: 10,
    run: async () => (await import("../modules/orders/exceptions")).sweepExceptions(),
  },
  {
    name: "storage.sweep",
    schedule: { kind: "interval", minutes: 60 },
    leaseMinutes: 15,
    run: async () => (await import("../modules/storage/service")).sweepStorage(),
  },
  {
    name: "cms.scheduled-publish",
    schedule: { kind: "interval", minutes: 5 },
    leaseMinutes: 5,
    // Posts scheduled for a future publishedAt go live automatically; refresh the cached pages when they do.
    run: async ({ now, lastStartedAt }) => {
      const since = lastStartedAt ?? new Date(now.getTime() - 10 * 60_000);
      const posts = await prisma.post.findMany({ where: { status: "PUBLISHED", publishedAt: { gt: since, lte: now } }, select: { slug: true } });
      if (!posts.length) return { published: 0 };
      const { revalidatePaths } = await import("../modules/cms/revalidate");
      const r = await revalidatePaths(["/blog", "/sitemap.xml", ...posts.map((p) => `/blog/${p.slug}`)]);
      return { published: posts.length, revalidate: r };
    },
  },
  {
    name: "billing.daily",
    schedule: { kind: "daily", hour: 6, minute: 0 },
    leaseMinutes: 15,
    run: async () => {
      const [{ refreshOverdue }, { expireQuotations }] = await Promise.all([import("../modules/billing/invoices"), import("../modules/quotations/service")]);
      return { overdue: await refreshOverdue(), expiredQuotations: await expireQuotations() };
    },
  },
  {
    name: "reminders.daily",
    schedule: { kind: "daily", hour: 7, minute: 0 },
    leaseMinutes: 15,
    run: async () => (await import("../modules/team/reminders")).runReminders(),
  },
  {
    name: "ai.weekly-report",
    schedule: { kind: "weekly", weekday: 1, hour: 7, minute: 0 },
    leaseMinutes: 15,
    enabled: () => (process.env.ANTHROPIC_API_KEY ? true : "ANTHROPIC_API_KEY not set"),
    run: async () => {
      const r = await (await import("../modules/assistant/reports")).generateWeeklyReport();
      return { id: (r as { id?: string })?.id ?? null };
    },
  },
];

const WORKER_ID = `${hostname()}:${process.pid}`;

/** Try to take the job's lease. Returns the previous lastStartedAt when acquired, or false. */
async function acquire(job: JobDef, now: Date): Promise<{ lastStartedAt: Date | null } | false> {
  await prisma.jobState.upsert({ where: { name: job.name }, update: {}, create: { name: job.name } });
  const prev = await prisma.jobState.findUnique({ where: { name: job.name } });
  const taken = await prisma.jobState.updateMany({
    where: { name: job.name, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockedBy: WORKER_ID, lockedUntil: new Date(now.getTime() + job.leaseMinutes * 60_000), lastStartedAt: now },
  });
  return taken.count === 1 ? { lastStartedAt: prev?.lastStartedAt ?? null } : false;
}

/** Run one job now (respecting the lease). */
export async function runJob(job: JobDef, now = new Date()) {
  const gate = job.enabled?.();
  if (gate !== undefined && gate !== true) {
    await prisma.jobState.upsert({ where: { name: job.name }, update: { lastStatus: "SKIPPED", lastError: String(gate || "disabled"), lastStartedAt: now }, create: { name: job.name, lastStatus: "SKIPPED", lastError: String(gate || "disabled"), lastStartedAt: now } });
    return { name: job.name, status: "SKIPPED" as const, reason: String(gate || "disabled") };
  }
  const lease = await acquire(job, now);
  if (!lease) return { name: job.name, status: "LOCKED" as const };
  const started = Date.now();
  try {
    const result = await job.run({ now, lastStartedAt: lease.lastStartedAt });
    const ms = Date.now() - started;
    await prisma.jobState.update({
      where: { name: job.name },
      data: { lockedBy: null, lockedUntil: null, lastFinishedAt: new Date(), lastStatus: "OK", lastError: null, lastDurationMs: ms, lastResult: toJson(result), runCount: { increment: 1 } },
    });
    console.info(`[jobs] ${job.name} OK in ${ms} ms`, short(result));
    return { name: job.name, status: "OK" as const, ms, result };
  } catch (e) {
    const ms = Date.now() - started;
    const message = (e as Error).message?.slice(0, 1000) ?? String(e);
    await prisma.jobState
      .update({ where: { name: job.name }, data: { lockedBy: null, lockedUntil: null, lastFinishedAt: new Date(), lastStatus: "ERROR", lastError: message, lastDurationMs: ms, runCount: { increment: 1 }, errorCount: { increment: 1 } } })
      .catch(() => undefined);
    console.error(`[jobs] ${job.name} FAILED in ${ms} ms:`, message);
    return { name: job.name, status: "ERROR" as const, ms, error: message };
  }
}

/** Run every job that is due now. Errors in one job never stop the others. */
export async function runDueJobs(now = new Date(), opts: { force?: string[] } = {}) {
  const states = await prisma.jobState.findMany();
  const last = new Map(states.map((s) => [s.name, s.lastStartedAt]));
  const results = [];
  for (const job of JOBS) {
    const forced = opts.force?.includes(job.name) || opts.force?.includes("all");
    if (!forced && !isDue(job.schedule, now, last.get(job.name) ?? null)) continue;
    results.push(await runJob(job, now));
  }
  return results;
}

/** Long-running worker loop (Render background worker). */
export async function startWorker({ tickMs = 30_000 } = {}) {
  console.info(`[jobs] worker ${WORKER_ID} started; ${JOBS.length} jobs:`);
  for (const j of JOBS) console.info(`  - ${j.name.padEnd(24)} ${describe(j.schedule)}`);
  let stopping = false;
  let running: Promise<unknown> | null = null;
  const stop = async (sig: string) => {
    if (stopping) return;
    stopping = true;
    console.info(`[jobs] ${sig} received, finishing current tick…`);
    await running;
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
  while (!stopping) {
    running = runDueJobs().catch((e) => console.error("[jobs] tick failed:", e));
    await running;
    running = null;
    await new Promise((r) => setTimeout(r, tickMs));
  }
}

/** Status board for /v1/ready and operations. */
export async function jobStatus() {
  const states = await prisma.jobState.findMany();
  const byName = new Map(states.map((s) => [s.name, s]));
  return JOBS.map((j) => {
    const s = byName.get(j.name);
    return { name: j.name, schedule: describe(j.schedule), lastStatus: s?.lastStatus ?? null, lastFinishedAt: s?.lastFinishedAt ?? null, errorCount: s?.errorCount ?? 0 };
  });
}

function toJson(v: unknown) {
  try {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  } catch {
    return undefined;
  }
}
function short(v: unknown) {
  try {
    return JSON.stringify(v)?.slice(0, 200) ?? "";
  } catch {
    return "";
  }
}
