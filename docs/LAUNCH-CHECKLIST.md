# Express Bags Platform — Launch Checklist

Everything in the platform is built and tested. Launch depends on the items below, most of which
only Express Bags, Inc. can provide (every account must be in the company's name).

Legend: **[C]** Carlos / Express Bags · **[Y]** Yasir · **[C+Y]** together

## 1. Approvals (before any public launch)
- [ ] **[C]** Written OK to deliver a custom platform (Next.js + Node + PostgreSQL) instead of WordPress on GoDaddy (the July agreement specified WordPress). Ownership terms are unchanged: Express Bags owns all code, data and accounts; portable to any host.
- [ ] **[C]** Confirm public facts: P.O. Box 667538, Miami, FL 33166 · office (305) 783-2860 · hours · tagline "Handled with Care. Delivered with Confidence."
- [ ] **[C]** Written permission for any client/project names to show publicly (Admin → Website content → History & names). Default: none named.
- [ ] **[C]** Decide: full Spanish site beyond the pages already built? (Spanish home, services, 8 markets, quote form, emails and the AI assistant are done.)

## 2. Brand & content
- [ ] **[C]** Vector logo (SVG/AI/EPS/PDF). Current logo is built from the PNG/JPEG supplied.
- [ ] **[C]** Real photos (fleet, team in action without identifiable faces unless consented, ports/airports where permitted) → Admin → Website content → Gallery.
- [ ] **[C]** Testimonials with written permission (or collect them through the post-delivery survey).
- [ ] **[C]** Insurance/credential facts you want shown (only documented company-level items).
- [ ] **[Y]** Replace demo data: `npm run seed:demo:clean` (never run demo seeds in production).

## 3. Accounts (all owned by Express Bags, Inc.) — see docs/DEPLOY.md for step-by-step
- [ ] **[C]** GitHub organization (code repository) — Yasir invited as collaborator
- [ ] **[C]** Neon (PostgreSQL database, point-in-time recovery)
- [ ] **[C]** Render (API server + background job worker + 10 GB disk for uploads)
- [ ] **[C]** Vercel (website)
- [ ] **[C]** Microsoft 365: shared mailboxes info@, accounting@, marketing@ (no extra licenses) + a licensed notifications@ sender with SMTP AUTH
- [ ] **[C]** Stripe (payments, deposits, invoices) + webhook
- [ ] **[C]** EasyPost with Express Bags' own UPS / FedEx / DHL / USPS accounts (nationwide shipping)
- [ ] **[C]** Twilio (SMS/WhatsApp; A2P 10DLC registration takes several days)
- [ ] **[C]** QuickBooks Online app connection
- [ ] **[C]** Anthropic API key (AI assistant; works in scripted mode without it)
- [ ] **[C]** Google Analytics 4, Google Ads, Meta Pixel IDs (+ optional Meta Conversions API token), Google Business Profile, Google review link
- [ ] **[C]** HubSpot (CRM sync; Apollo can connect to HubSpot later)

## 4. Domain & email DNS (GoDaddy)
- [ ] **[C+Y]** GoDaddy delegate access for DNS
- [ ] **[Y]** `www.express-bags.com` + apex → Vercel · `api.express-bags.com` → Render (the API must be on the same site for secure cookies and images)
- [ ] **[Y]** SPF, DKIM, DMARC records for Microsoft 365 sending
- [ ] **[Y]** 301 redirects from old site URLs (already in the code)

## 5. Configuration
- [ ] **[Y]** Set production environment variables (docs/ENV.md) on Render (API + worker) and Vercel (web)
- [ ] **[Y]** `npx prisma migrate deploy` (runs automatically on Render pre-deploy) → `npm run db:seed` with the real owner email
- [ ] **[C]** Owner signs in, changes password, enables two-factor sign-in
- [ ] **[C]** Create staff users (dispatchers, accounting, drivers) — Admin → Users & security; add team & fleet
- [ ] **[C]** Settings & pricing: real local zone prices, storage rates, carrier margins, minimums, deposits, cancellation rules (all current values are placeholders)
- [ ] **[C]** Storage locations + capacities, the private processing-point address
- [ ] **[C]** Notification settings, staff alert recipients, Google review link

## 6. Testing before go-live
- [ ] **[C+Y]** Run 20–30 realistic test orders in Admin → Shipments → Test pricing (required before instant pricing can be switched on)
- [ ] **[C+Y]** End-to-end dry run: real job, real driver phone, scan, photo, signature, notification, invoice, payment (Stripe test mode)
- [ ] **[Y]** `npm run verify` + `npx playwright test` green on the release commit
- [ ] **[Y]** Restore test of the database backup (docs/OPERATIONS.md)
- [ ] **[Y]** Uptime monitor on `https://api.express-bags.com/v1/health` and the website

## 7. Feature switches (Admin → Settings & pricing) — all OFF until approved
| Switch | Turn on when |
|---|---|
| Public instant pricing + online booking | Owner approves after 20–30 test orders (recorded in Test pricing) |
| Nationwide carrier shipping | EasyPost + carrier accounts connected and tested |
| Optional protection & claims | Florida legal structure approved (approver, date, terms URL) — never called "insurance" |
| SMS / WhatsApp | Twilio registration approved |
| QuickBooks sync | QuickBooks connected, bookkeeper confirmed |
| HubSpot sync | HubSpot token set |
| AI assistant | On by default (scripted mode without a key) |
| Surveys & review requests | On by default; add the Google review link |

## 8. After launch
- [ ] Submit sitemap in Google Search Console; verify Google Business Profile
- [ ] Weekly review of exceptions, notifications log and AI handoffs
- [ ] Quarterly backup-restore test
- [ ] Remove the "Draft for owner/legal review" notes once the Privacy, Terms and Accessibility pages are reviewed by counsel
