# Express Bags backend (API, database, engines, admin)

## Run locally
```bash
npm install                 # also runs `prisma generate` (postinstall)
cp .env.example .env        # then fill JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run db:dev              # Prisma dev Postgres (keep running); copy its TCP URL into DATABASE_URL
npx prisma migrate deploy   # or: npm run db:migrate (creates new migrations)
npm run db:seed             # markets, zones (incl. 5 Keys sub-zones), airports/ports, vehicles, settings, owner
npm run api:dev             # API on http://localhost:4000 (watch mode)
npm run dev                 # website on http://localhost:3000 → admin at /admin
```
Background dev DB: `npx prisma dev -n express-bags -d` · stop: `npx prisma dev stop express-bags`.

## Structure
| Path | What |
|---|---|
| `prisma/schema.prisma` | Data model: users/roles, customers, companies, quote requests (+notes, timeline), orders & pieces (9-step status, piece IDs `EB-…-01`, barcode/RFID field), markets, zones (sub-zones), recognized locations, vehicle classes, settings, versioned pricing rules, notable-project permissions, careers, messages, uploads, email log, audit log |
| `src/server/app.ts` / `index.ts` | Express app (helmet, CORS allow-list, rate limits, JSON errors) / server start |
| `src/server/routes/public.ts` | `POST /v1/quotes`, `/v1/uploads`, `/v1/careers`, `/v1/contact`, `GET /v1/health`, `/v1/public-config` |
| `src/server/routes/admin.ts` | `/v1/admin/*` — auth, dashboard, quotes (list/filters/detail/status/notes/CSV/pricing preview), settings, pricing rules, notable-project permissions, careers, messages, private upload download, markets/zones |
| `src/server/engines/` | Decision engine + local, carrier and storage pricing engines (pure, unit-tested) |
| `src/server/integrations/hubspot.ts` | Quote → HubSpot contact/company/deal mapping (Apollo-ready properties) |
| `src/server/services/quotes.ts` | Intake: route → store → emails → HubSpot |
| `src/app/admin`, `components/admin` | Admin UI |

## Public contract
`POST /v1/quotes` body = `QuoteRequest` (`src/lib/quote-schema.ts`) → `201 {ok, reference, route, message}`; `400 {ok:false, error, details:[{path,message}]}`.
Honeypot field `website` filled → fake success, nothing stored. Uploads: `POST /v1/uploads` multipart field `file` (≤10 MB; pdf, jpg, png, webp, heic, doc(x), xls(x), csv) → `{ok, id}`; put ids in `attachmentIds`.

## Roles
OWNER: everything (settings, pricing rules, permissions, zones). STAFF: quotes, CSV export, pricing preview, careers, messages. DISPATCHER: read quotes, change status, add notes.

## Pricing safety
`features.pricingEnabled` is **false** by default and pricing is never returned publicly. Rule defaults in `engines/config.ts` are placeholders, not Express Bags' prices. Every rule save creates a new `PricingRuleSet` version.

## Deploy (proposal)
API on Render (Node 22, `npm run api:start`, set env vars, run `npx prisma migrate deploy` on release). DB on Neon. Website on Vercel with `NEXT_PUBLIC_API_URL`. In production the session cookie is `SameSite=None; Secure` (site and API on different domains).
