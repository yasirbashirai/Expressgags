# Environment variables

Services: **API** = Render web service · **JOBS** = Render background worker · **WEB** = Vercel (Next.js) · **CLI** = one-off commands (seed, migrate).
"Secret" values go in Render/Vercel secret settings, never in the repo. `.env.example` lists every variable for local development.
In production the API refuses to start if a required value is missing or unsafe (`src/server/lib/security.ts`), and `GET /v1/ready` reports missing names (never values).

## Core

| Variable | Used by | Required | Secret | Example / default | Notes |
|---|---|---|---|---|---|
| `NODE_ENV` | all | prod: yes | no | `production` | Enables secure cookies, HSTS, boot guard; disables mock checkout |
| `DATABASE_URL` | API, JOBS, CLI | yes | yes | `postgresql://…-pooler…/express_bags?sslmode=require` | Neon **pooled** URL |
| `DIRECT_DATABASE_URL` | CLI (`prisma migrate`) | prod: yes | yes | `postgresql://…/express_bags?sslmode=require` | Neon **direct** URL (no `-pooler`); falls back to `DATABASE_URL` |
| `DB_POOL_MAX` | API, JOBS | no | no | `10` prod · `1` local Prisma dev server | Connections per process |
| `JWT_SECRET` | API, JOBS | yes | yes | 48+ random chars | Signs staff & customer sessions (distinct domains); rotate = everyone signs in again |
| `IP_HASH_SALT` | API | yes | yes | random | Hashes IPs in logs/conversations; never the dev default |
| `PORT` | API | no | no | `4000` | Render sets/uses it |
| `WEB_ORIGIN` | API | yes | no | `https://www.express-bags.com,https://express-bags.com` | CORS + CSRF allow-list (https only in prod) |
| `PUBLIC_WEB_URL` | API, JOBS | yes | no | `https://www.express-bags.com` | Links in emails (quotations, invoices, portal, reset) |
| `PUBLIC_API_URL` | API, JOBS | yes | no | `https://api.express-bags.com` | Unsubscribe links, Twilio signature URLs |
| `PORTAL_URL` | API | no | no | `https://www.express-bags.com/account` | Defaults from `PUBLIC_WEB_URL` |
| `UPLOAD_DIR` | API | yes | no | `/var/data/uploads` | Private files on the Render disk |
| `TZ` | API, JOBS | no | no | `UTC` | Business time is always computed in America/New_York in code |

## Website (Vercel)

| Variable | Used by | Required | Secret | Example | Notes |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | WEB (build), API | yes | no | `https://api.express-bags.com` | Baked in at build; also used for the image allow-list |
| `NEXT_PUBLIC_SITE_URL` | WEB, API | yes | no | `https://www.express-bags.com` | Canonical URLs, sitemap, schema |
| `CMS_API_URL` | WEB (server) | no | no | `https://api.express-bags.com` | Server-side CMS fetch base (defaults to `NEXT_PUBLIC_API_URL`) |
| `CMS_FETCH_TIMEOUT_MS` | WEB | no | no | `4000` | CMS fetch timeout; pages fall back to built-in content |
| `REVALIDATE_SECRET` | WEB, API | recommended | yes | random | Same value on both; lets the API refresh pages right after publishing |
| `WEB_INTERNAL_URL` | API, JOBS | recommended | no | `https://www.express-bags.com` | Where the API calls `/api/revalidate` |
| `NEXT_DIST_DIR` | WEB (local) | no | no | `.next-<name>` | Local parallel builds only |

## Email (Microsoft 365 SMTP)

| Variable | Used by | Required | Secret | Example | Notes |
|---|---|---|---|---|---|
| `SMTP_HOST` | API, JOBS | recommended | no | `smtp.office365.com` | Without SMTP, emails are logged to `EmailLog` (status LOGGED) |
| `SMTP_PORT` | API, JOBS | no | no | `587` | STARTTLS |
| `SMTP_USER` | API, JOBS | recommended | no | `notifications@express-bags.com` | Mailbox with SMTP AUTH enabled |
| `SMTP_PASS` | API, JOBS | recommended | yes | — | |
| `EMAIL_FROM` | API, JOBS | recommended | no | `Express Bags <notifications@express-bags.com>` | |

## Providers (empty = safe mock mode)

| Variable | Used by | Secret | Notes |
|---|---|---|---|
| `PROVIDERS_MODE` | API, JOBS | no | `mock` forces mocks (staging only; refused in production) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | API | yes | Checkout + refunds; webhook `/v1/webhooks/stripe` |
| `EASYPOST_API_KEY`, `EASYPOST_WEBHOOK_SECRET` | API, JOBS | yes | Multi-carrier rates/labels/tracking; webhook `/v1/webhooks/carriers` |
| `EASYPOST_API_BASE` | API | no | `https://api.easypost.com/v2` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | API, JOBS | yes | SMS + WhatsApp |
| `TWILIO_FROM`, `TWILIO_WHATSAPP_FROM` | API, JOBS | no | `+13055550100`, `whatsapp:+1…` |
| `TWILIO_STATUS_CALLBACK_URL` | API, JOBS | no | `https://api.express-bags.com/v1/webhooks/twilio/status` |
| `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REFRESH_TOKEN`, `QBO_REALM_ID` | API, JOBS | yes | QuickBooks Online (Express Bags' company) |
| `QBO_ENV` | API, JOBS | no | `production` (default sandbox) |
| `QBO_SERVICE_ITEM_ID` | API | no | QBO item used for invoice lines |
| `ANTHROPIC_API_KEY` | API, JOBS | yes | AI assistant, lead summaries, weekly report (scripted fallback without it) |
| `ASSISTANT_MODEL` | API | no | Default model id (owner can change in admin) |
| `HUBSPOT_TOKEN` | API | yes | CRM sync (also needs the admin flag) |
| `META_CAPI_TOKEN` | API | yes | Meta Conversions API (only with marketing consent) |
| `META_GRAPH_VERSION`, `META_TEST_EVENT_CODE` | API | no | `v21.0`; test code while validating |
| `GOOGLE_MAPS_API_KEY` | — | — | Not used yet: distances use the built-in Florida estimate (documented follow-up) |

## Workers & limits

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `NOTIFICATION_WORKER` | API, JOBS | on | Set `off` on the API when the JOBS worker runs (Render blueprint does); the jobs CLI forces it off for itself |
| `PUBLIC_RATE_LIMIT` | API | 30–60 / 15 min | Public form posts per IP (30 for quote/contact/careers, 60 for payment/quotation pages) |
| `LOGIN_RATE_LIMIT` | API | 10 / 15 min | Staff/customer sign-in attempts per IP |
| `TRACK_RATE_LIMIT` | API | 40 / 15 min | Tracking lookups |
| `DRIVER_RATE_LIMIT` | API | 240 / 15 min | Driver app (scans) |
| `CONTENT_RATE_LIMIT` | API | 600 / 15 min | Public CMS API |
| `ASSISTANT_RATE_LIMIT` | API | per module default | Chat messages |
| `GLOBAL_RATE_LIMIT`, `GLOBAL_WRITE_RATE_LIMIT` | API | 3000 / 600 per 15 min (prod) | Global safety net |

## Setup / CLI only

| Variable | Used by | Notes |
|---|---|---|
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `npm run db:seed` | Creates the first owner (random password printed if absent) |
| `DEMO_DRIVER_EMAIL`, `DEMO_DRIVER_PASSWORD`, `DEMO_PORTAL_PASSWORD` | `npm run seed:demo` | Local/staging demo only |
| `ALLOW_DEMO_SEED` | `npm run seed:demo` | Override of the production refusal — never set on the live platform |
| `ALLOW_LOCAL_DB` | API boot guard | `1` lets a production-mode smoke test use a localhost database (local testing only) |
| `E2E_API_URL` | Playwright | Test API base |
