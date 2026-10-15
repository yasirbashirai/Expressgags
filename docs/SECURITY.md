# Express Bags Platform — Security

Review date: 2026-10-15 (wave-3 security pass over the whole platform: website, portals, driver app, admin, API, integrations).

## 1. Threat model

| Asset | Who might attack it | Main threats |
|---|---|---|
| Customer data (names, phones, addresses, itineraries, PODs, invoices) | Opportunistic attackers, competitors, curious customers | IDOR between customers, enumeration of references/tokens, leaks through public links |
| Employee identities (Carlos's hard privacy rule) | Anyone | Exposure through tracking, AI assistant, notifications, public pages |
| Internal economics (cost, margin, pricing rules) | Customers, competitors | Leakage via quotation/invoice/instant-pricing APIs |
| Staff accounts (owner, dispatch, accounting) | Credential stuffing, phishing, CSRF | Account takeover → full data access, payouts, refunds |
| Money flows (Stripe checkout, refunds, claims payouts) | Fraudsters | Forged webhooks, tampered prices, unauthorized refunds |
| Uploaded files (résumés, IDs, claim evidence, photos) | Attackers uploading malware/HTML | Stored XSS through served files, malware distribution, EXIF location leaks |
| Integrations (EasyPost, Twilio, Stripe, QuickBooks, HubSpot, AI) | Attackers abusing our server | SSRF, webhook forgery, cost abuse (AI tokens, SMS) |

Trust boundaries: browser ↔ Next.js site (static/ISR) · browser ↔ Express API (cookie sessions, cross-site in production) ·
API ↔ Postgres · API ↔ third-party providers (outbound + signed webhooks).

## 2. Controls in place

**Authentication & sessions**
- Staff: bcrypt (12 rounds), JWT in httpOnly `eb_admin` cookie (Secure + SameSite=None in production), `tokenVersion` revocation (password change/reset or "sign out everywhere" kills old sessions), TOTP 2FA with encrypted secrets + hashed single-use recovery codes, replay protection, lockout after 5 failures (15 min), password policy, equal-time responses for unknown emails, hashed single-use reset/invite tokens.
- Customers: separate signing domain (`eb_customer`), verified-email linking (prevents account pre-claiming), deactivation checked on every request, **sessions bound to a fingerprint of the current password hash** (password change/reset signs out every other device — added in this review).
- Drivers: staff sessions with role DRIVER; blocked from every `/v1/admin` route; only see their own assignments.

**Authorization**
- Every admin route uses `requireAuth` + `requireRole`; role separation verified by an automated matrix test that walks **every registered route** (`src/server/__tests__/security/authz-matrix.test.ts`, 300+ routes): no session → 401, DRIVER → 403 everywhere in admin, ACCOUNTING blocked from dispatch/quotations/storage/CMS/users, DISPATCHER blocked from billing/quotations/protection/customers/CMS/users, STAFF blocked from user management. New routes are covered automatically.
- Customer data scoped with `customerOrderScope` / portal scope helpers → cross-customer access returns 404 (tested).

**CSRF** (added): `csrfGuard` in `src/server/lib/security.ts` — every POST/PUT/PATCH/DELETE under `/v1` must carry an allowed `Origin` (or `Referer`) matching the CORS allow-list; `Origin: null` refused; in production, cookie-carrying requests without any origin are refused. Signed provider webhooks are exempt (they verify HMAC signatures).

**Input & output**
- zod validation on every input; JSON body limit 1 MB; honeypots on public forms.
- XSS: React escaping everywhere; the only `dangerouslySetInnerHTML` uses are JSON-LD (escaped `<`), and the CMS markdown renderer (escape-first, link/image allow-list, XSS-tested). Email templates escape all interpolated values.
- SQL: Prisma everywhere; the only raw statements use hash-derived integers (`pg_advisory_xact_lock`) or constant SQL (readiness check).
- CSV exports: formula-injection neutralization in every export (added for billing invoices/aging and reports, which lacked it; numbers stay numeric).
- SSRF (added): carrier label downloads go through `fetchProviderFile` — https only, EasyPost host allow-list, private/loopback hosts refused, no redirects, 5 MB and 15 s limits. No other code fetches user-supplied URLs.

**Uploads** (hardened)
- Allowed types: PDF, JPG, PNG, WEBP, HEIC, DOC/DOCX, XLS/XLSX, CSV; 10 MB limit; random stored names outside the web root.
- **Magic-byte sniffing** (added): contents must match the extension — HTML/SVG/scripts/executables renamed as PDF/images are rejected (415).
- Public website images are **re-encoded to strip EXIF/GPS metadata** (added); undecodable images are rejected.
- Private files are only served through authenticated, ownership-checked endpoints with `X-Content-Type-Options: nosniff`; public media only for CMS files flagged public.
- Original filenames sanitized (control and path characters removed) and only used in `Content-Disposition`.

**Transport & headers**
- API (helmet): HSTS, nosniff, frame-ancestors none, `Cross-Origin-Resource-Policy: same-site` (site + API must share the registrable domain, e.g. `www.` + `api.express-bags.com`).
- Website (added in `next.config.ts`): Content-Security-Policy (default-src self; script/connect/img hosts allow-listed for the API origin, Google Analytics/Ads and Meta only; object-src none; base-uri self; form-action self; frame-ancestors none), `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, HSTS (production), Referrer-Policy, Permissions-Policy (camera/geolocation only for `/driver`).
- Marketing tags load only after consent (Google Consent Mode v2 defaults denied).

**Abuse & cost controls**
- Per-endpoint rate limits on logins, 2FA, resets, verification, tracking, quotes, uploads, careers, contact, assistant, attribution, driver actions; **plus global per-IP limits** (added): 600 writes / 3,000 requests per 15 min in production (`GLOBAL_WRITE_RATE_LIMIT`, `GLOBAL_RATE_LIMIT`).
- Tracking needs reference + verifier; wrong verifier and unknown reference return identical responses (tested).
- Public tokens (quotations, invoices, surveys…): 32 chars from a 32-symbol alphabet (160 bits), unique-indexed; guessed tokens → 404 (tested).
- AI assistant: 1,500-char messages, bounded history, max 4 tool rounds, capped tokens, per-IP limits, deterministic refusals before the model is called, output filter (prices, banned claims, non-office phone/email).
- IPs stored only as salted hashes, except the IP recorded in an electronic quotation acceptance (ESIGN evidence, by design).

**Secrets & configuration**
- No secrets in client bundles (production build scanned: 183 client files, 0 hits for secret env values or key patterns).
- **Production boot check** (added, `assertProductionConfig` in `src/server/index.ts`): refuses to start without DATABASE_URL, JWT_SECRET (≥32 chars, not a placeholder), https WEB_ORIGIN, PUBLIC_WEB_URL, non-default IP_HASH_SALT, UPLOAD_DIR; refuses `PROVIDERS_MODE=mock` and localhost databases.
- Mock checkout and dev-only endpoints are disabled in production (tested); production error responses are generic (no stacks/SQL — tested).
- Logs never contain passwords, tokens, TOTP codes or card data; the SMS fallback logger no longer prints message bodies in production (added).

**Webhooks**: Stripe (signature + event de-duplication), EasyPost (HMAC + de-dup), Twilio (signature) — all before JSON parsing, raw body verified.

## 3. Findings from this review

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | High | No CSRF protection for non-JSON (form/multipart/text) cross-site writes while production cookies are SameSite=None | **Fixed** — Origin/Referer guard on all state-changing `/v1` requests |
| 2 | Medium | Uploads trusted the browser-supplied MIME type/extension (HTML/SVG/executables could be stored as `.pdf`/`.png` and later served inline) | **Fixed** — magic-byte sniffing |
| 3 | Medium | Customer sessions survived a password change/reset (no revocation) | **Fixed** — password-fingerprint binding (tested) |
| 4 | Medium | Billing (invoices, aging) and reports CSV exports had no formula-injection guard (customer-controlled names) | **Fixed** — shared `csvSafe` |
| 5 | Medium | No Content-Security-Policy on the website; X-Frame-Options SAMEORIGIN | **Fixed** — CSP + DENY + COOP + HSTS (prod) |
| 6 | Medium | Carrier label download fetched any provider-returned URL (SSRF if the provider response were tampered/misconfigured) | **Fixed** — `fetchProviderFile` allow-list |
| 7 | Low | API could start in production with weak/missing secrets or mock providers | **Fixed** — boot-time config check |
| 8 | Low | Public website images kept EXIF (GPS of where a fleet photo was taken) | **Fixed** — re-encode on CMS upload |
| 9 | Low | SMS fallback logger printed full message bodies (tracking/survey links) | **Fixed** — redacted in production |
| 10 | Low | No global per-IP request cap (some public endpoints relied only on module limits) | **Fixed** — global limits |
| 11 | Low | `/v1/ready` is public and reports configuration warnings | Open — owned by the deployment module; recommend returning details only with a `READY_TOKEN` header |
| 12 | Low | DISPATCHER can read pricing rules (Settings) and staff rate-shop views show cost/margin | Accepted — internal admin data; revisit if dispatchers are contractors |
| 13 | Info | `POST /v1/admin/billing/invoices/:id/sync` answers 200 for unknown ids | Open (cosmetic) |
| 14 | Info | npm audit (production): `postcss` (high) bundled inside next 15.5.27 | Accepted — build-time only, processes our own CSS; not reachable at runtime. Upgrade with the next Next.js 15 patch that bundles postcss ≥ 8.5.23 |

## 4. Residual risks

- **CSP allows `'unsafe-inline'` scripts**: static/ISR pages can't carry per-request nonces, and the Next.js bootstrap needs inline scripts. XSS defense relies on React escaping + the sanitized markdown renderer; external script hosts are tightly allow-listed. Moving to nonces requires dynamic rendering (trade-off with performance).
- **Cross-site cookies**: if the API is hosted on a different registrable domain from the site (e.g. `*.onrender.com`), browsers increasingly block third-party cookies → host the API at `api.express-bags.com`.
- **Single-instance rate limits** use memory; with multiple API instances use a shared store (Redis) for express-rate-limit.
- **Real provider adapters** (Stripe, EasyPost, Twilio, QuickBooks, Anthropic) are tested in mock mode only; verify webhook secrets and signatures in staging with real keys.
- **Malware scanning** of uploads is not performed (type sniffing only). Consider a scanning service before staff open documents from unknown senders.
- **Credential identifiers** (badge numbers) are stored in plain text behind staff auth.

## 5. Production checklist

- [ ] API on `https://api.express-bags.com`, site on `https://www.express-bags.com` (same site → cookies + CORP work).
- [ ] `NODE_ENV=production`, strong `JWT_SECRET` (≥32 random chars), unique `IP_HASH_SALT`, `WEB_ORIGIN=https://www.express-bags.com,https://express-bags.com`, `PUBLIC_WEB_URL`, persistent `UPLOAD_DIR` (or object storage), `NEXT_PUBLIC_API_URL` set at build time (it feeds the CSP).
- [ ] Owner account created with a unique password; **enable 2FA for every staff account** (owner first).
- [ ] Stripe, EasyPost, Twilio webhook secrets set; test each webhook in staging.
- [ ] Database: managed Postgres with TLS, daily backups + restore test, least-privilege DB user.
- [ ] Remove demo seed data and demo accounts before launch.
- [ ] Keep `PROVIDERS_MODE` unset; mock checkout must stay unreachable (verify `/v1/pay/mock/...` → 404).
- [ ] Run `npm audit --omit=dev` and `npx vitest run src/server/__tests__/security` before each release.
- [ ] Review the audit log weekly; rotate secrets if staff with access leave.

## 6. Security tests

`src/server/__tests__/security/`:
- `authz-matrix.test.ts` — every route × session/role (route inventory via `route-inventory.ts`)
- `csrf-uploads.test.ts` — CSRF guard, upload sniffing, CSV neutralization, production config check
- `production-mode.test.ts` — production behavior (origin checks, mock checkout disabled, no error leakage)
- `privacy-leaks.test.ts` — deep scan of tracking, portal, quotation/invoice links, driver, public content for internal economics, credentials, employee identities, private address, other customers' data; IDOR + enumeration
- `sessions.test.ts` — customer session revocation after password change

Run: `npx vitest run src/server/__tests__/security`
