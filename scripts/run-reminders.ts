/** Cron entry point: `npm run reminders` (e.g. daily at 7 AM). Emails the expiration/maintenance digest. */
import "../src/server/lib/env";
import { runReminders } from "../src/server/modules/team/reminders";
import { prisma } from "../src/server/db";

runReminders()
  .then((r) => console.log(`[reminders] due=${r.due} emailed=${r.emailed} closed=${r.closed} email=${r.emailStatus}`))
  .catch((e) => {
    console.error("[reminders] failed", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
