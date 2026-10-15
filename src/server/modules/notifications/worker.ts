/**
 * Notification worker: sends due NotificationJob rows.
 *  - claims each job atomically (PENDING → PROCESSING) so parallel workers never double-send
 *  - honours opt-outs, the SMS feature flag and quiet hours at SEND time (settings may have changed)
 *  - writes a Notification row + a private OrderEvent for the order timeline
 *  - retries failures with exponential backoff (5 attempts: 5, 10, 20, 40 minutes)
 * Runs inline after enqueue, every minute inside the API process, and via processDueJobs() for cron.
 */
import { prisma } from "../../db";
import { sendMail } from "../../lib/email";
import { renderTemplate, type TemplateData, type TemplateKey } from "../../lib/templates";
import { sms as smsProvider } from "../../providers/registry";
import { addOrderEvent } from "../../services/orders";
import { getSetting } from "../../settings";
import { getNotificationSettings } from "./settings";
import { inQuietHours, nextAllowedTime } from "./time";

export const MAX_ATTEMPTS = 5;
const backoffMs = (attempt: number) => 5 * 60_000 * 2 ** Math.max(0, attempt - 1);

type Outcome = { status: "SENT" | "LOGGED" | "FAILED" | "SKIPPED"; provider?: string; providerRef?: string; error?: string; subject?: string; body?: string };

async function isOptedOut(channel: string, to: string, template: string) {
  if (channel === "sms" || channel === "whatsapp") {
    return !!(await prisma.contactOptOut.findFirst({ where: { address: to, channel: { in: [channel, "sms"] } } }));
  }
  // Review/survey requests respect marketing unsubscribes; transactional order emails always go.
  if (channel === "email" && template === "survey.request") {
    return !!(await prisma.contactOptOut.findUnique({ where: { channel_address: { channel: "email-marketing", address: to } } }));
  }
  return false;
}

/** Process one job by id. Safe to call concurrently (atomic claim). */
export async function processJob(id: string, now = new Date()) {
  const claimed = await prisma.notificationJob.updateMany({ where: { id, status: "PENDING", scheduledFor: { lte: now } }, data: { status: "PROCESSING" } });
  if (claimed.count !== 1) return null;
  const job = await prisma.notificationJob.findUniqueOrThrow({ where: { id } });

  let outcome: Outcome;
  try {
    if (await isOptedOut(job.channel, job.to, job.template)) {
      outcome = { status: "SKIPPED", error: "Recipient opted out" };
    } else if (job.channel !== "email") {
      const [features, settings] = await Promise.all([getSetting("features"), getNotificationSettings()]);
      if (!features.smsEnabled) {
        outcome = { status: "SKIPPED", error: "SMS notifications are turned off" };
      } else if (inQuietHours(now, settings.quietHours)) {
        // Became due during quiet hours (e.g. a retry): push to the next allowed time
        await prisma.notificationJob.update({ where: { id }, data: { status: "PENDING", scheduledFor: nextAllowedTime(now, settings.quietHours) } });
        return { rescheduled: true };
      } else {
        const r = renderTemplate(job.template as TemplateKey, job.language as "en" | "es", job.data as TemplateData);
        const provider = smsProvider();
        const res = await provider.send(job.to, r.sms, job.channel as "sms" | "whatsapp");
        outcome = { status: res.status, provider: provider.name, providerRef: res.ref, error: res.error, body: r.sms };
      }
    } else {
      const r = renderTemplate(job.template as TemplateKey, job.language as "en" | "es", job.data as TemplateData);
      const status = await sendMail({ to: job.to, subject: r.subject, text: r.text, html: r.html });
      outcome = { status, provider: status === "LOGGED" ? "log" : "smtp", subject: r.subject, body: r.text, error: status === "FAILED" ? "SMTP send failed" : undefined };
    }
  } catch (e) {
    outcome = { status: "FAILED", error: (e as Error).message };
  }

  const attempts = job.attempts + 1;
  if (outcome.status === "FAILED" && attempts < MAX_ATTEMPTS) {
    await prisma.notificationJob.update({ where: { id }, data: { status: "PENDING", attempts, lastError: outcome.error, scheduledFor: new Date(now.getTime() + backoffMs(attempts)) } });
    return { retrying: true, attempts };
  }

  // The order may have been deleted since the job was queued: keep the log, drop the link
  const orderId = job.orderId && (await prisma.order.count({ where: { id: job.orderId } })) ? job.orderId : null;
  const notification = await prisma.notification.create({
    data: {
      channel: job.channel,
      to: job.to,
      template: job.template,
      subject: outcome.subject ?? null,
      body: outcome.body ?? null,
      status: outcome.status,
      provider: outcome.provider ?? null,
      providerRef: outcome.providerRef ?? null,
      error: outcome.error ?? null,
      orderId,
    },
  });
  await prisma.notificationJob.update({ where: { id }, data: { status: outcome.status, attempts, lastError: outcome.error ?? null, notificationId: notification.id } });

  if (orderId) {
    const label = outcome.status === "SKIPPED" ? `skipped (${outcome.error})` : outcome.status.toLowerCase();
    await addOrderEvent({ orderId, type: "NOTIFICATION", detail: `${job.channel} ${job.template} ${label}`, actorType: "system", customerVisible: false }).catch(() => undefined);
  }
  if (job.template === "survey.request" && (outcome.status === "SENT" || outcome.status === "LOGGED")) {
    await prisma.surveyResponse.updateMany({ where: { orderId: job.orderId ?? "__none__", sentAt: null }, data: { sentAt: new Date() } });
  }
  return { notificationId: notification.id, status: outcome.status };
}

/** Send every due job (cron/interval entry point). Returns counts. */
export async function processDueJobs(limit = 100, now = new Date()) {
  // Recover jobs stuck in PROCESSING (crashed worker) after 10 minutes
  await prisma.notificationJob.updateMany({ where: { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } }, data: { status: "PENDING" } });
  const due = await prisma.notificationJob.findMany({ where: { status: "PENDING", scheduledFor: { lte: now } }, orderBy: { scheduledFor: "asc" }, take: limit, select: { id: true } });
  const counts: Record<string, number> = { processed: 0 };
  for (const { id } of due) {
    let r: Awaited<ReturnType<typeof processJob>>;
    try {
      r = await processJob(id, now);
    } catch (e) {
      // Never let one broken job stop the queue
      console.error(`[notifications] job ${id} failed unexpectedly:`, (e as Error).message);
      await prisma.notificationJob.update({ where: { id }, data: { status: "FAILED", lastError: (e as Error).message.slice(0, 500) } }).catch(() => undefined);
      counts.processed++;
      counts.ERROR = (counts.ERROR ?? 0) + 1;
      continue;
    }
    counts.processed++;
    const key = r && "status" in r ? String(r.status) : r && "retrying" in r ? "RETRYING" : r && "rescheduled" in r ? "RESCHEDULED" : "SKIPPED_CLAIM";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

let timer: NodeJS.Timeout | null = null;
/** Start the in-process worker (every 60 s). Disabled in tests and when NOTIFICATION_WORKER=off. */
export function startNotificationWorker() {
  if (timer || process.env.NODE_ENV === "test" || process.env.VITEST || process.env.NOTIFICATION_WORKER === "off") return;
  timer = setInterval(() => {
    processDueJobs().catch((e) => console.error("[notifications] worker error", e));
  }, 60_000);
  timer.unref();
}
