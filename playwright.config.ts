import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests against the production build + real API + local Postgres.
 * Prereqs: `npx prisma dev -n express-bags -d` running, migrations applied, `npm run build` done.
 * Uses the installed Google Chrome (no Playwright browser download).
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  // storageState: the cookie banner starts answered ("necessary only") so it never covers UI under test;
  // tests/e2e/engagement.spec.ts clears it to test the banner itself.
  use: { baseURL: "http://localhost:3000", channel: "chrome", trace: "retain-on-failure", storageState: "tests/e2e/consent-state.json" },
  webServer: [
    { command: "LOGIN_RATE_LIMIT=1000 PUBLIC_RATE_LIMIT=1000 REVALIDATE_SECRET=e2e-revalidate-secret WEB_INTERNAL_URL=http://localhost:3000 npm run api:start", url: "http://localhost:4000/v1/health", reuseExistingServer: true, timeout: 60_000 },
    { command: "REVALIDATE_SECRET=e2e-revalidate-secret npx next start -p 3000", url: "http://localhost:3000", reuseExistingServer: true, timeout: 60_000 },
  ],
});
