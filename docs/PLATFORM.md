# Express Bags Platform — architecture contract (read before building any module)

Requirements: `../express-bags-client/` → `START-HERE.md`, `BUILD-PLAN.md`, and especially
`1-from-carlos/october-2026/REVIEW-NOTES.md` (all of Carlos's documents summarized, with conflicts).
The 07 completed form + 06 history + 03 master requirements are the source of truth.

## Apps (one Next.js app, one Express API)
| Surface | Next.js routes | Auth | API base |
|---|---|---|---|
| Public website | `src/app/(site)/**` | none | `/v1/*` public |
| Customer / business / concierge portal | `src/app/(site)/account/**` | customer cookie `eb_customer` | `/v1/account/*` |
| Quotation acceptance & payment | `src/app/(site)/q/[token]`, `/pay/*` | secret token | `/v1/q/*`, `/v1/pay/*` |
| Public tracking | `src/app/(site)/track` | reference + last name/email/ZIP | `/v1/track/*` |
| Admin (office) | `src/app/admin/**` | staff cookie `eb_admin`, roles OWNER/STAFF/DISPATCHER/ACCOUNTING | `/v1/admin/*` |
| Driver app (PWA, phone-first) | `src/app/driver/**` (own layout, no site chrome) | staff cookie, role DRIVER | `/v1/driver/*` |

## Backend modules
Each module owns `src/server/modules/<name>/` (index.ts exports `platformModule`, already registered in
`src/server/modules/index.ts` and mounted by `app.ts`):
`orders, dispatch, driver, tracking, team, fleet, users, customer, quotations, billing, carriers, storage, protection, notifications, cms, assistant, reports, reference`.
Route scopes: `admin` → `/v1/admin/<path>` (apply `requireAuth` + `requireRole`), `public` → `/v1/<path>` (apply rate limits),
`webhook` → mounted before JSON parsing (use `express.raw`).

## Shared building blocks (do not fork them)
- `src/server/services/orders.ts` — `createOrder`, `transitionOrder` (state machine `ORDER_FLOW`, labels `STATUS_LABEL`), `addOrderEvent`. ALL order creation/status changes go through here.
- `src/server/lib/events.ts` — domain event bus (`emit`/`on`). Notifications, reminders, syncs subscribe here.
- `src/server/providers/` — interfaces (`index.ts`), mocks (`mock.ts`), selection (`registry.ts`). Real adapters live in
  `providers/<vendor>.ts` and call `registerProvider(...)`; import them from the module's index so they load.
  Mock mode is automatic in tests and when keys are missing → everything works offline.
- `src/server/auth.ts` (staff) and `src/server/auth-customer.ts` (customers, `customerOrderScope`).
- `src/server/lib/reference.ts` — references (orders, quotations, claims, storage, tokens).
- `src/server/lib/multipart.ts` (uploads; set `kind/ownerType/ownerId` on Upload), `lib/email.ts` (`sendMail`, `brandedHtml`), `lib/errors.ts`.
- Admin UI: `components/admin/admin-shell.tsx` (AdminShell, AdminTitle, Panel), `components/admin/ui.tsx` (StatCard, DataTable, EmptyState, Field, inputCls, Modal, Tabs, ConfirmButton), `components/admin/labels.tsx` (Badge), `components/admin/api.ts` (`api`, `money`, `dateTime`).
- Public UI: `components/ui/*`, `components/layout/*`, `src/content/site.ts` (facts), `src/lib/seo.ts`.

## Database
Schema is split by area in `prisma/schema/*.prisma` (core, operations, commerce, engagement).
To add tables/fields: create or edit ONLY `prisma/schema/<your-module>.prisma` (new models) — ask the lead for
changes to existing models — then run `npm run db:sync` (diffs live dev DB → applies → `prisma generate`).
Never run `prisma migrate reset`, `db push --accept-data-loss`, or drop data. The lead consolidates migrations.
Money is always integer cents. Dates are `DateTime`. IDs are cuid.

## Non-negotiable product rules (from Carlos)
- Privacy: public pages never show the owner's name/photo/bio, any employee identity or staff counts, the street address, the owner's mobile or private email. A driver's name + job contact may be shown ONLY to the booked customer after assignment.
- No client/hotel/cruise/team/artist names or logos publicly without recorded written permission.
- No "24/7", "guaranteed", "licensed and insured", "always on time", "zero damage", unlimited storage. Same-day/urgent always "subject to capacity and dispatch confirmation".
- No moving / food / catering services anywhere (nav, copy, forms, SEO, AI).
- Pricing is admin-controlled, never hard-coded; public automatic pricing stays OFF until `features.pricingEnabled` (owner approval after 20–30 test orders). Internal cost/margin never leaves admin APIs.
- Protection is not "insurance"; module hidden until legal approval (`features.protectionEnabled`).
- Every account (Stripe, Twilio, EasyPost, Google, QuickBooks, AI) belongs to Express Bags, Inc.
- House copy style: commas, not em dashes. CTA: "Request a Quote".

## Quality bar
TypeScript strict, commented like the existing code, accessible (labels, focus, contrast AA, one h1), mobile-first (390px no horizontal scroll),
role checks on every admin route, audit log on every admin write, zod validation on every input, rate limits on public writes.
Tests: Vitest for services/engines/routes (supertest against the dev DB), Playwright (installed Chrome: `channel: "chrome"`) for UI flows.

## Parallel-work rules
- Own only your module folders. Shared-file changes → report to the lead.
- No `npm install`, no `npx playwright install`, no git commits.
- Next builds: `NEXT_DIST_DIR=.next-<you> npx next build` (never the default `.next`, never port 3000). API dev servers: port 41xx unique per agent (`PORT=41xx npm run api:start`).
- Afterwards revert any `.next-<you>/types` line Next adds to `tsconfig.json` include.
