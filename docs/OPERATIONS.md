# Operations runbook

For deployment setup see `DEPLOY.md`; for every variable see `ENV.md`.

## 1. Health & monitoring

| URL | Meaning |
|---|---|
| `https://api.express-bags.com/v1/health` | Liveness (process up). Render health check. |
| `https://api.express-bags.com/v1/ready` | Readiness: database reachable, all migrations applied, required config present (503 if not). Lists warnings (SMTP missing, job worker heartbeat stale). Never shows secret values. |
| `https://www.express-bags.com/` | Website (Vercel). |

Uptime monitoring: add both `/v1/ready` and the home page to **UptimeRobot** (free, 5-minute checks) or **Better Stack**, alerting the office email + Yasir. Render also emails on failed deploys/health checks.
Background jobs: `npm run jobs:list` (Render shell on `express-bags-jobs`) prints every job with its schedule, last status, last finish time and error count. `/v1/ready` warns when the notification queue hasn't run for 10+ minutes.

## 2. Background jobs

One worker (`npm run jobs:worker`, Render `express-bags-jobs`) runs every scheduled task. Each job holds a lease row (`JobState`), so a second worker or a manual run can never execute the same job concurrently; a crashed worker's lease expires on its own.

| Job | Schedule (America/New_York) | What it does |
|---|---|---|
| `notifications.queue` | every 1 min | Sends queued emails/SMS/WhatsApp (order updates, receipts, staff alerts) **and post-delivery survey invites**; retries failures with backoff; respects quiet hours 9 PM–7 AM |
| `exceptions.sweep` | every 15 min | Flags late pickups and stale in-transit orders on the Exceptions inbox |
| `storage.sweep` | hourly | Overstays + upcoming retrieval reminders |
| `cms.scheduled-publish` | every 5 min | Refreshes website pages when a scheduled blog post goes live |
| `billing.daily` | daily 06:00 | Marks overdue invoices, expires old quotations |
| `reminders.daily` | daily 07:00 | License/registration/insurance/inspection/credential/maintenance expiry digest to `notifyEmail` |
| `ai.weekly-report` | Mondays 07:00 | Weekly AI business summary (skipped when `ANTHROPIC_API_KEY` is not set) |

Manual runs: `npm run jobs:once` (whatever is due), `npm run jobs:once -- --force billing.daily` or `--force all`. The admin buttons ("Run reminders now", billing daily, sweeps) call the same functions.

## 3. Deploy & rollback

- **Deploy**: push to `main` → Render builds API + worker (pre-deploy runs `prisma migrate deploy`), Vercel builds the site. Watch `/v1/ready` turn ready.
- **Rollback the code**: Render → service → Events → *Rollback* to the previous deploy; Vercel → Deployments → *Promote* the previous one. Do both if an API contract changed.
- **Migrations are forward-only.** A rollback of code does not undo a migration; every migration in this project is additive (new tables/columns), so older code keeps working against the newer schema. If a migration itself fails, Render stops the deploy before traffic switches; fix and redeploy. Never edit an applied migration file.
- **New schema change** (developer): edit `prisma/schema/*.prisma` → `npx prisma migrate dev --name <change>` against a scratch database (or diff with `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema --script` using a shadow database) → commit the new folder in `prisma/migrations/` → deploy. Check `npx prisma migrate status` shows up to date.

## 4. Backups, restore test & disaster recovery

What is backed up:
- **Database**: Neon point-in-time restore (PITR) for the retention window of the plan. Optionally a weekly `pg_dump` to Express Bags' OneDrive/SharePoint for long-term copies.
- **Uploads** (photos, signatures, PODs, documents, labels): Render disk daily snapshots (kept 7 days).
- **Code & configuration**: GitHub repository (Express Bags' organization) + Render/Vercel env settings (export the variable list to a password manager; values in 1Password/Bitwarden owned by Express Bags).

**Restore test — do it at launch and then every quarter (Carlos's "backup testing" requirement):**
1. Neon → Branches → *Create branch* from a point in time (e.g. yesterday 09:00) → copy its connection string.
2. Start a temporary Render service (or locally) with `DATABASE_URL` = that branch, `NODE_ENV=production`, the normal secrets, `PROVIDERS_MODE=` empty and **no** Stripe/Twilio keys (so nothing is sent).
3. Check `/v1/ready` = ready; sign in to admin; open yesterday's orders, a POD and an invoice PDF; compare counts with production.
4. Render → API disk → Snapshots → restore the latest snapshot to a test disk/service and open a few photos.
5. Record date, who tested, the restore point and the result in `docs/restore-log.md`. Delete the temporary branch/service.

**Disaster recovery (who does what, in what order):**
| Scenario | Action | Target |
|---|---|---|
| API down, DB fine | Render rollback to last good deploy; check `/v1/ready`; check Neon status | 15 min |
| Bad data change (deleted orders, wrong bulk update) | Create a Neon branch from just before the incident, export the affected rows, re-insert into production (developer), never restore the whole DB over newer good data | same day |
| Database lost / region outage | Restore Neon PITR to a new branch → set it as primary → update `DATABASE_URL`/`DIRECT_DATABASE_URL` on Render → redeploy | 1–2 h |
| Uploads disk lost | Restore the latest Render disk snapshot; files newer than the snapshot must be re-collected (driver re-sends photos from the phone if still queued) | 2 h |
| Leaked secret | Rotate it (§5) immediately, then review the audit log | 30 min |
| Office cannot reach the platform | Operations continue by phone; drivers' app keeps an offline queue and syncs later | — |

## 5. Secrets rotation

Rotate on staff changes and at least yearly. Change the value in Render (env group) or Vercel → redeploy.
- `JWT_SECRET`: everyone (staff and customers) must sign in again. Use during incidents.
- `IP_HASH_SALT`: only affects grouping of future IP hashes.
- Provider keys (Stripe, Twilio, EasyPost, QBO, Anthropic, HubSpot, Meta): create the new key at the provider, update Render, redeploy, then revoke the old key.
- `REVALIDATE_SECRET`: update Render AND Vercel together.
- SMTP password: change in Microsoft 365, update `SMTP_PASS`.
Staff account security: Admin → Users & security can sign a user out everywhere, reset 2FA, unlock, deactivate.

## 6. Accounts & users

- **Add a staff user**: Admin → Users & security → Invite (role OWNER/STAFF/DISPATCHER/ACCOUNTING/DRIVER). The person sets a password from the emailed link (72 h) and should enable 2FA (Admin → My security). Drivers sign in at `/driver`.
- **Driver for an employee**: Admin → Team → person → Create login.
- **Lost 2FA device**: owner → Users & security → Reset 2FA (the user re-enrolls at next sign-in).
- **Locked out after 5 attempts**: wait 15 minutes or owner → Unlock.
- **First owner** (new environment only): `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run db:seed`.
- **Customer portal access**: Admin → Customers → Send portal invite / deactivate. Company admins manage their own team in the portal.

## 7. Turning features on (each has a deliberate gate)

All flags live in Admin → Settings (features) unless noted. Default: OFF for everything Carlos must approve.
- **Instant public pricing & online booking** (`pricingEnabled`, `instantBookingEnabled`): Carlos first sets real rules in Settings & pricing and Shipments → Settings; then Admin → Shipments → **Test pricing** runs ≥ 20 representative scenarios (local, storage, nationwide, oversized, custom triggers). Only the owner can then *Approve & enable*, with a written statement; who/when is recorded. Turning it off is immediate.
- **Carrier shipping** (`carrierShippingEnabled`): requires EasyPost keys + Express Bags carrier accounts + the private processing-point address in Shipments → Settings.
- **Protection** (`protectionEnabled`): Admin → Claims → plan settings need *approved by*, *approval date* and *terms URL* from Florida legal review; only the owner can switch it on. Never call it insurance.
- **SMS/WhatsApp** (`smsEnabled`): requires Twilio keys and completed A2P 10DLC registration.
- **QuickBooks sync** (`quickbooksSyncEnabled`): requires QBO keys; failures show per record with Retry, never block billing.
- **HubSpot sync** (`hubspotSyncEnabled`): requires `HUBSPOT_TOKEN`.
- **AI assistant** (`aiAssistantEnabled`, default on): runs a scripted mode without a key; set `ANTHROPIC_API_KEY` for full AI; model/spend in Admin → AI assistant.
- **Surveys** (`surveysEnabled`, default on): set the Google review link in Notifications → Settings to show it to 4–5★ customers.
- **Public email** (`contact.emailLive`): only after `info@` is monitored.
- **Client names on the website**: Admin → Website content → History & names; requires a written-permission note.

## 8. Logs & incidents

- API/worker logs: Render → service → Logs (live tail, 7 days on starter; add a log drain to Better Stack for longer retention).
- Website: Vercel → Project → Logs. 
- Business audit trail: Admin → Users & security → Audit log (every admin write), order timelines (chain of custody), Notifications log.
- Incident steps: (1) check `/v1/ready` and Render/Vercel/Neon status pages, (2) roll back if a deploy caused it, (3) tell dispatch to work by phone, (4) fix forward, (5) write a short note (what, when, impact, fix) in `docs/incidents.md`.

## 9. Data retention (defaults; confirm with Carlos/legal)

| Data | Keep | How |
|---|---|---|
| Orders, chain of custody, PODs, invoices, payments | 7 years (tax/accounting) | Keep; export yearly |
| Quote requests that never converted | 3 years | Archive status; delete older via admin/developer |
| Contact messages, career applications | 2 years | Delete older |
| AI conversations | 12 months | Delete older (IPs stored only as hashes) |
| Notification logs | 2 years | Delete older |
| Uploaded IDs/credentials of former employees | Until no longer legally required | Delete with the employee record review |
| Demo/test data | Never in production | `seed:demo` is refused in production; `npm run seed:demo:clean` removes it from staging |
