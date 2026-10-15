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
  workers: 2,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000", channel: "chrome", trace: "retain-on-failure" },
  webServer: [
    { command: "LOGIN_RATE_LIMIT=1000 PUBLIC_RATE_LIMIT=1000 npm run api:start", url: "http://localhost:4000/v1/health", reuseExistingServer: true, timeout: 60_000 },
    { command: "npx next start -p 3000", url: "http://localhost:3000", reuseExistingServer: true, timeout: 60_000 },
  ],
});
