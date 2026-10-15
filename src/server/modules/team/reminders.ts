/**
 * Expiration & maintenance reminders (Carlos req. #2/#3, form Q33): scans license, registration,
 * insurance, inspection, credential and document expiries plus scheduled maintenance, upserts Reminder
 * rows (one per item/title) and emails a digest of items due within 30 days to settings.contact.notifyEmail.
 * Run from the admin ("Run reminders now"), from cron (`npm run reminders`) or call runReminders().
 */
import { prisma } from "../../db";
import { brandedHtml, sendMail } from "../../lib/email";
import { getSetting } from "../../settings";

export type ExpiryItem = {
  entityType: "employee" | "vehicle" | "credential" | "maintenance" | "document";
  entityId: string;
  /** Where to open it in the admin */
  href: string;
  holder: string;
  title: string;
  dueAt: Date;
  daysLeft: number;
};

const DAY = 86_400_000;
const daysLeft = (d: Date, now: Date) => Math.ceil((d.getTime() - now.getTime()) / DAY);

/** Everything expiring / due within `days` (including already overdue items). */
export async function upcomingExpirations(days = 60, now = new Date()): Promise<ExpiryItem[]> {
  const until = new Date(now.getTime() + days * DAY);
  const [employees, vehicles, credentials, empDocs, vehDocs, maintenance] = await Promise.all([
    prisma.employee.findMany({ where: { status: { not: "INACTIVE" }, licenseExpiresAt: { lte: until } } }),
    prisma.vehicle.findMany({
      where: { status: { not: "OUT_OF_SERVICE" }, OR: [{ registrationExpiresAt: { lte: until } }, { insuranceExpiresAt: { lte: until } }, { inspectionExpiresAt: { lte: until } }] },
    }),
    prisma.credential.findMany({ where: { expiresAt: { lte: until } }, include: { employee: true, vehicle: true } }),
    prisma.employeeDocument.findMany({ where: { expiresAt: { lte: until } }, include: { employee: true } }),
    prisma.vehicleDocument.findMany({ where: { expiresAt: { lte: until } }, include: { vehicle: true } }),
    prisma.maintenanceRecord.findMany({ where: { status: "SCHEDULED", scheduledFor: { lte: until } }, include: { vehicle: true } }),
  ]);
  const items: ExpiryItem[] = [];
  const name = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;
  for (const e of employees) items.push({ entityType: "employee", entityId: e.id, href: `/admin/team/${e.id}`, holder: name(e), title: "Driver license expires", dueAt: e.licenseExpiresAt!, daysLeft: daysLeft(e.licenseExpiresAt!, now) });
  for (const v of vehicles) {
    const add = (d: Date | null, t: string) => d && d <= until && items.push({ entityType: "vehicle", entityId: v.id, href: `/admin/fleet/${v.id}`, holder: `Unit ${v.unitNumber}`, title: t, dueAt: d, daysLeft: daysLeft(d, now) });
    add(v.registrationExpiresAt, "Registration expires");
    add(v.insuranceExpiresAt, "Insurance expires");
    add(v.inspectionExpiresAt, "Inspection due");
  }
  for (const c of credentials) {
    const holder = c.employee ? name(c.employee) : c.vehicle ? `Unit ${c.vehicle.unitNumber}` : "Express Bags (company)";
    items.push({ entityType: "credential", entityId: c.id, href: `/admin/credentials?focus=${c.id}`, holder, title: `${c.type.replace(/_/g, " ")} (${c.facility}) expires`, dueAt: c.expiresAt!, daysLeft: daysLeft(c.expiresAt!, now) });
  }
  for (const d of empDocs) items.push({ entityType: "document", entityId: d.id, href: `/admin/team/${d.employeeId}`, holder: name(d.employee), title: `${d.title} expires`, dueAt: d.expiresAt!, daysLeft: daysLeft(d.expiresAt!, now) });
  for (const d of vehDocs) items.push({ entityType: "document", entityId: d.id, href: `/admin/fleet/${d.vehicleId}`, holder: `Unit ${d.vehicle.unitNumber}`, title: `${d.title} expires`, dueAt: d.expiresAt!, daysLeft: daysLeft(d.expiresAt!, now) });
  for (const m of maintenance) items.push({ entityType: "maintenance", entityId: m.id, href: `/admin/fleet/${m.vehicleId}`, holder: `Unit ${m.vehicle.unitNumber}`, title: `Maintenance: ${m.type}`, dueAt: m.scheduledFor!, daysLeft: daysLeft(m.scheduledFor!, now) });
  return items.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

/**
 * Upserts Reminder rows for everything due within 30 days and emails one digest of the items that
 * have not been emailed in the last 6 days. Returns counts for the admin.
 */
export async function runReminders(now = new Date()) {
  const items = await upcomingExpirations(30, now);
  const resend = new Date(now.getTime() - 6 * DAY);
  const toEmail: ExpiryItem[] = [];
  for (const it of items) {
    const key = { entityType: it.entityType, entityId: it.entityId, title: it.title };
    const existing = await prisma.reminder.findUnique({ where: { entityType_entityId_title: key } });
    if (!existing) {
      await prisma.reminder.create({ data: { ...key, dueAt: it.dueAt, status: "OPEN" } });
      toEmail.push(it);
    } else {
      if (existing.status === "DONE" || existing.status === "DISMISSED") {
        if (existing.dueAt.getTime() === it.dueAt.getTime()) continue; // handled for this due date
        await prisma.reminder.update({ where: { id: existing.id }, data: { status: "OPEN", dueAt: it.dueAt, lastSentAt: null } });
        toEmail.push(it);
        continue;
      }
      if (existing.dueAt.getTime() !== it.dueAt.getTime()) await prisma.reminder.update({ where: { id: existing.id }, data: { dueAt: it.dueAt } });
      if (!existing.lastSentAt || existing.lastSentAt < resend) toEmail.push(it);
    }
  }
  // Items whose expiry moved out of the window (renewed) are closed automatically
  const live = new Set(items.map((i) => `${i.entityType}|${i.entityId}|${i.title}`));
  const open = await prisma.reminder.findMany({ where: { status: { in: ["OPEN", "SENT"] }, entityType: { in: ["employee", "vehicle", "credential", "maintenance", "document"] } } });
  const closed = open.filter((r) => !live.has(`${r.entityType}|${r.entityId}|${r.title}`));
  if (closed.length) await prisma.reminder.updateMany({ where: { id: { in: closed.map((r) => r.id) } }, data: { status: "DONE" } });

  let emailStatus: string = "SKIPPED";
  if (toEmail.length) {
    const { notifyEmail } = await getSetting("contact");
    if (notifyEmail) {
      const line = (i: ExpiryItem) => `${i.daysLeft < 0 ? `OVERDUE ${-i.daysLeft}d` : `in ${i.daysLeft}d`} · ${i.title} · ${i.holder} · ${i.dueAt.toISOString().slice(0, 10)}`;
      emailStatus = await sendMail({
        to: notifyEmail,
        subject: `Express Bags reminders: ${toEmail.length} item${toEmail.length === 1 ? "" : "s"} due within 30 days`,
        text: ["These licenses, registrations, credentials and maintenance items need attention:", "", ...toEmail.map(line), "", "Open the admin: Team, Fleet or Credentials."].join("\n"),
        html: brandedHtml("Upcoming expirations & maintenance", ["These items need attention within 30 days:", ...toEmail.map(line), "Open the Express Bags admin (Team, Fleet or Credentials) to renew or update them."]),
      });
      await prisma.reminder.updateMany({
        where: { OR: toEmail.map((i) => ({ entityType: i.entityType, entityId: i.entityId, title: i.title })) },
        data: { status: "SENT", lastSentAt: now },
      });
    } else {
      emailStatus = "NO_RECIPIENT";
    }
  }
  return { due: items.length, emailed: toEmail.length, closed: closed.length, emailStatus };
}
