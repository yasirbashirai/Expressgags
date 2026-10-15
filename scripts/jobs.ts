/**
 * Job runner CLI.
 *   npm run jobs:once                    run every job that is due now, then exit (cron-friendly)
 *   npm run jobs:once -- --force all     run every job now regardless of schedule
 *   npm run jobs:once -- --force billing.daily,reminders.daily
 *   npm run jobs:worker                  long-running loop (Render background worker)
 *   npm run jobs:list                    print the schedule and last results
 */
// The worker process runs the notification queue itself → never start the API's in-process timer here.
process.env.NOTIFICATION_WORKER = "off";

async function main() {
  await import("../src/server/lib/env");
  // Load every module so domain-event subscribers (notifications, syncs) exist in this process too:
  // jobs emit events (e.g. an exception sweep → staff alert) that must be queued here.
  await import("../src/server/modules");
  const { JOBS, jobStatus, runDueJobs, startWorker } = await import("../src/server/jobs");
  const { prisma } = await import("../src/server/db");
  const args = process.argv.slice(2);

  if (args.includes("--worker")) return startWorker();

  if (args.includes("--list")) {
    console.table(await jobStatus());
    await prisma.$disconnect();
    return;
  }

  const fi = args.indexOf("--force");
  const force = fi >= 0 ? (args[fi + 1] ?? "all").split(",") : undefined;
  if (force) {
    const unknown = force.filter((f) => f !== "all" && !JOBS.some((j) => j.name === f));
    if (unknown.length) throw new Error(`Unknown job(s): ${unknown.join(", ")}. Known: ${JOBS.map((j) => j.name).join(", ")}`);
  }
  const results = await runDueJobs(new Date(), { force });
  if (!results.length) console.info("[jobs] nothing due");
  for (const r of results) console.info(`[jobs] ${r.name}: ${r.status}${"ms" in r ? ` (${r.ms} ms)` : ""}${"error" in r ? ` — ${r.error}` : ""}`);
  await prisma.$disconnect();
  if (results.some((r) => r.status === "ERROR")) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
