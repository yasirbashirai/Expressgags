# Express Bags Platform

Website + booking/quote platform for **Express Bags, Inc.** (Miami, est. 2010): Florida luggage logistics, hospitality transfers, courier & last-mile, luggage storage and cargo-van/box-truck logistics.

Built by Yasir Bashir. Requirements live in `../express-bags-client/` (read `START-HERE.md` and `BUILD-PLAN.md`).

## Stack
- **Web:** Next.js 15 (React 19, App Router) + Tailwind CSS 4 — `src/app`, `components/`, `public/`
- **API:** Node + Express 5, Prisma 7, PostgreSQL — `src/server/`, `prisma/`
- **Tests:** Vitest (unit/API), Playwright (end-to-end), `scripts/check-content.mjs` (privacy & claims guardrails)

## Key files
- `src/content/site.ts` — single source of truth for every public fact (contact, services, markets, airports, ports, FAQ, history). Change facts here only.
- `src/lib/quote-schema.ts` — shared quote-request contract (website + API).
- `scripts/check-content.mjs` — fails the build if private data or banned claims appear on any page.

## Commands
```bash
npm run dev            # website on http://localhost:3000
npm run db:dev         # local Postgres (Prisma dev server)
npm run api:dev        # API on http://localhost:4000
npm run verify         # typecheck + lint + unit tests + build + content guardrails
npm run test:e2e       # Playwright end-to-end tests
```

## Privacy rules (from the client — never break)
Public contact = P.O. Box 667538, Miami, FL 33166 and office (305) 783-2860 only. Never the street address, the owner's mobile, the owner's email, the owner's name/photo/bio, or any employee identity. No client names/logos without written permission. No "24/7", "guaranteed", "licensed and insured", moving or food delivery.
