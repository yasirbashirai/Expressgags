# Deploying the Express Bags platform

Every account below is created **in the name of Express Bags, Inc.** (Carlos's requirement: no
developer-owned accounts). Yasir is added as a collaborator/developer where needed and can be removed at any time.

| Piece | Where | Domain |
|---|---|---|
| Website + portal + admin + driver app (Next.js) | **Vercel** | `www.express-bags.com` (apex `express-bags.com` redirects to www) |
| API (Express, `npm run api:start`) | **Render** web service `express-bags-api` | `api.express-bags.com` |
| Background jobs (`npm run jobs:worker`) | **Render** background worker `express-bags-jobs` | — |
| PostgreSQL | **Neon** (project `express-bags`, region us-east) | — |
| Private uploads (photos, signatures, PODs, documents, labels) | Render persistent disk on the API (`/var/data/uploads`) | — |
| DNS | **GoDaddy** (stays where the domain is registered) | — |
| Email | **Microsoft 365** (Express Bags' existing tenant) | — |

Why `api.` is a subdomain of the same site: staff/customer sessions are cookies set by the API and private
media (POD photos, vehicle photos) are served with `Cross-Origin-Resource-Policy: same-site`. Keeping the API on
`api.express-bags.com` makes it *same-site* with `www.express-bags.com`, so cookies and images work reliably
(Safari's tracking prevention blocks third-party cookies across different sites).

---

## 1. Database — Neon

1. Create the Neon project (Postgres 16+, region **AWS us-east-1**, close to Render Virginia). Database `express_bags`.
2. Copy two connection strings from *Connection details*:
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL` (used by the running API and worker via `@prisma/adapter-pg`).
   - **Direct** (no `-pooler`) → `DIRECT_DATABASE_URL` (used only by `prisma migrate deploy`, which needs a session connection).
   Both with `?sslmode=require`.
3. `DB_POOL_MAX=10` per service (Neon's pooler fans in; the free tier allows plenty for 2 services). Never set 1 in production (that's only for the local Prisma dev server).
4. Backups: enable **Point-in-time restore** (history retention ≥ 7 days on the paid plan; 24 h on free). See OPERATIONS.md §4 for the restore test.
5. First deploy runs the migrations automatically (Render `preDeployCommand`). Then create the owner account once (Render shell on the API service):
   ```bash
   ADMIN_EMAIL=owner@express-bags.com ADMIN_PASSWORD='<temporary strong password>' npm run db:seed
   ```
   The seed also loads markets, zones (incl. the 5 Florida Keys sub-zones), airports/ports, vehicle classes and default settings. Sign in, then change the password and turn on 2FA (Admin → My security). **Never run `npm run seed:demo` in production** (it refuses when `NODE_ENV=production`).

## 2. API + jobs — Render

1. New → **Blueprint** → connect the GitHub repo → Render reads `render.yaml` and creates:
   - `express-bags-api` (web, Node 22, starter plan, Virginia). Build `npm ci --include=dev && npx prisma generate`, pre-deploy `npx prisma migrate deploy`, start `npm run api:start`, health check `/v1/health`, 10 GB disk at `/var/data`.
   - `express-bags-jobs` (background worker). Start `npm run jobs:worker`.
   - env group `express-bags-shared`. Render prompts for every `sync: false` secret. `JWT_SECRET` and `IP_HASH_SALT` are generated.
   `--include=dev` is required: the API runs TypeScript through `tsx` and migrates with the `prisma` CLI (devDependencies).
2. The API refuses to boot with an unsafe production config (http origins, mock providers forced, missing secrets, localhost DB, weak `JWT_SECRET`). Read the deploy log if it exits immediately.
3. Custom domain: Render → `express-bags-api` → Settings → Custom domains → `api.express-bags.com`. Render shows a CNAME target (`express-bags-api.onrender.com`). TLS is automatic once DNS resolves.
4. Verify: `https://api.express-bags.com/v1/health` → `{"ok":true}` and `https://api.express-bags.com/v1/ready` → `"status":"ready"` (it lists warnings such as SMTP not configured).
5. The disk pins the API to **one instance** and disables zero-downtime deploys (a few seconds of downtime per deploy). That's fine at launch volume; moving uploads to object storage (§6) removes the limit.

## 3. Website — Vercel

1. New project → import the same repo. Framework **Next.js**, root directory `/` (repo root), install `npm ci`, build `npm run build` (defaults are fine; no `vercel.json` needed). Node 22.
2. Environment variables (Production):
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://api.express-bags.com` |
   | `NEXT_PUBLIC_SITE_URL` | `https://www.express-bags.com` |
   | `CMS_API_URL` | `https://api.express-bags.com` (server-side CMS fetches) |
   | `REVALIDATE_SECRET` | same value as on Render |
   `NEXT_PUBLIC_*` values are baked in at build time → redeploy after changing them. `next.config.ts` derives the image allow-list from these URLs.
3. Domains: add `www.express-bags.com` (primary) and `express-bags.com` (redirect → www).
4. Preview deployments: set `NEXT_PUBLIC_API_URL` for Preview to a **staging** API (a second Render service with its own Neon branch). Never point previews at the production API (CORS blocks unknown origins anyway).

## 4. DNS at GoDaddy (express-bags.com)

Replace the old Website Builder records. Keep every Microsoft 365 record (MX, autodiscover, SPF/DKIM) intact.

| Type | Name | Value | Purpose |
|---|---|---|---|
| A | `@` | `76.76.21.21` (Vercel shows the current value) | apex → Vercel (redirects to www) |
| CNAME | `www` | `cname.vercel-dns.com` | website |
| CNAME | `api` | `express-bags-api.onrender.com` | API |
| TXT | `@` | `v=spf1 include:spf.protection.outlook.com -all` | SPF (merge, don't duplicate, if one exists; add `include:` for any other sender) |
| CNAME | `selector1._domainkey` / `selector2._domainkey` | values from Microsoft 365 Defender → DKIM | DKIM signing for M365 |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@express-bags.com; fo=1` | DMARC (start with `p=none` for 2 weeks, then quarantine) |

Lower the TTL to 600 s a day before switching; the old site at GoDaddy Website Builder stops serving once `@`/`www` move. The 5 old URLs are 301-redirected by the new site.

## 5. Email — Microsoft 365 (answers Carlos's Fiverr question)

Express Bags already uses M365. Recommended setup, no extra licenses:
- **`info@`, `accounting@`, `marketing@` → shared mailboxes** (free, no license, up to 50 GB; staff with a license open them in Outlook; "Send as" permissions per person). Use aliases only for alternate spellings that should land in someone's own inbox.
- **Platform sender**: one licensed *or* shared mailbox `notifications@express-bags.com` with **SMTP AUTH enabled for that mailbox only** (Exchange admin → mailbox → Email apps → Authenticated SMTP). Use a strong password (or an app password if MFA requires it). Render env: `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587` (STARTTLS), `SMTP_USER=notifications@express-bags.com`, `SMTP_PASS`, `EMAIL_FROM="Express Bags <notifications@express-bags.com>"`. Replies go to `info@` (reply-to).
- Admin → Settings: set `notifyEmail` (staff alerts) to the office/dispatch shared mailbox. Then turn on `contact.emailLive` so `info@express-bags.com` appears on the website (only after the mailbox is monitored, Carlos's rule).
- If Microsoft disables SMTP AUTH tenant-wide (security defaults), the alternative is a transactional provider (Postmark/Resend/SendGrid) authenticated on the domain; only the four SMTP_* variables change.

## 6. Uploads storage

The API stores private files on disk under `UPLOAD_DIR` (`/var/data/uploads` on the Render disk). They are covered by Render's **daily disk snapshots** (kept 7 days) but not by Neon backups — restore both together (OPERATIONS.md §4).
**Follow-up (recommended within the first months):** move uploads to S3-compatible object storage (Cloudflare R2 / AWS S3) behind the same `storeUpload`/download functions in `src/server/lib/multipart.ts`, then remove the disk to allow multiple API instances and zero-downtime deploys.

## 7. Provider accounts (all owned by Express Bags, Inc.)

Until a key is set, each provider runs in safe **mock mode** automatically (no real charges, texts or labels). Register these webhook URLs when connecting:

| Provider | Setup | Env | Webhook URL |
|---|---|---|---|
| **Stripe** | Activate the account (EIN, bank). Developers → API keys (restricted key with Checkout + Refunds write). | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `https://api.express-bags.com/v1/webhooks/stripe` — events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` |
| **EasyPost** | Create account, add Express Bags' **own** UPS, FedEx, DHL (international) and USPS carrier accounts (negotiated rates). | `EASYPOST_API_KEY`, `EASYPOST_WEBHOOK_SECRET` | `https://api.express-bags.com/v1/webhooks/carriers` (tracker events) |
| **Twilio** | Buy a local 305/786 number; complete A2P 10DLC brand + campaign registration (required for US texting, takes days). WhatsApp sender optional. | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `TWILIO_WHATSAPP_FROM`, `TWILIO_STATUS_CALLBACK_URL` | Messaging webhook (incoming, STOP/START): `https://api.express-bags.com/v1/webhooks/twilio` · status callback: `…/v1/webhooks/twilio/status` |
| **QuickBooks Online** | Intuit developer app (production keys), connect Express Bags' QBO company once to obtain the refresh token + realm id. | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REALM_ID`, `QBO_REFRESH_TOKEN`, `QBO_ENV=production`, optional `QBO_SERVICE_ITEM_ID` | — (pull/push only) |
| **Anthropic (AI assistant)** | Console account for Express Bags, set a monthly spend limit. | `ANTHROPIC_API_KEY`, optional `ASSISTANT_MODEL` | — |
| **HubSpot** | Private app with CRM contacts/companies/deals scopes. | `HUBSPOT_TOKEN` | — |
| **Google** | GA4 property, Google Ads conversion, Search Console (verify via DNS TXT), Google Business Profile. | IDs entered in Admin → Notifications → Settings (marketing) | — |
| **Meta** | Business Manager, Pixel + Conversions API token. | `META_CAPI_TOKEN` (+ Pixel ID in admin) | — |

Then switch the matching feature flags in Admin → Settings (see OPERATIONS.md §7). Real Stripe/EasyPost/Twilio/QBO calls have only been tested in mock mode so far: do one live test transaction for each before announcing.

## 8. Go-live checklist

- [ ] Carlos's written OK for the custom platform (contract says WordPress) and for the hosting accounts above
- [ ] Neon project + PITR, Render Blueprint applied, Vercel project, all in Express Bags' name
- [ ] `/v1/ready` = ready with no config warnings you didn't intend
- [ ] Owner account created, password changed, **2FA on**; staff/driver accounts invited
- [ ] SMTP working (Admin → Notifications → Templates → test send), `notifyEmail` set
- [ ] DNS switched, TLS valid on `www`, apex and `api`; old URLs redirect
- [ ] Vector logo + real photos uploaded; PhotoSlot placeholders replaced
- [ ] Notable-project naming permissions recorded (or left generic)
- [ ] Pricing rules set by Carlos; instant pricing stays OFF until the 20–30 scenario test run is approved
- [ ] Protection stays OFF until Florida legal approval
- [ ] GA4/Ads/Pixel IDs entered; Search Console sitemap `https://www.express-bags.com/sitemap.xml` submitted
- [ ] Demo data never loaded (`seed:demo` is refused in production)
- [ ] Restore test done once (OPERATIONS.md §4)
