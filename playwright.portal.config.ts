import { defineConfig } from "@playwright/test";

/**
 * Customer-portal end-to-end tests (real API on :4104 + production build in .next-portal on :3304).
 * Prereqs: dev database running; `NEXT_PUBLIC_API_URL=http://localhost:4104 NEXT_DIST_DIR=.next-portal npx next build`;
 * demo accounts: `DEMO_PORTAL_PASSWORD=... npx tsx prisma/seed-demo/portal.ts`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /portal\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: ".qa/portal/test-results",
  use: { baseURL: "http://localhost:3304", channel: "chrome", trace: "retain-on-failure" },
  webServer: [
    { command: "PORT=4104 WEB_ORIGIN=http://localhost:3304 LOGIN_RATE_LIMIT=1000 PUBLIC_RATE_LIMIT=1000 npm run api:start", url: "http://localhost:4104/v1/health", reuseExistingServer: true, timeout: 60_000 },
    { command: "NEXT_DIST_DIR=.next-portal npx next start -p 3304", url: "http://localhost:3304", reuseExistingServer: true, timeout: 60_000 },
  ],
});
