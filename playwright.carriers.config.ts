import { defineConfig } from "@playwright/test";

process.env.E2E_API_URL ??= "http://localhost:4201";

/**
 * Carriers module end-to-end tests on isolated ports (other agents' servers are untouched).
 * Prereqs: Prisma dev DB running; `NEXT_DIST_DIR=.next-carriers NEXT_PUBLIC_API_URL=http://localhost:4201 npx next build`.
 * The lead runs the same spec with the main playwright.config.ts (ports 3000/4000).
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /carriers\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: ".qa/carriers/test-results",
  use: { baseURL: "http://localhost:3401", channel: "chrome", trace: "retain-on-failure" },
  webServer: [
    {
      command: "PORT=4201 WEB_ORIGIN=http://localhost:3401 PUBLIC_WEB_URL=http://localhost:3401 LOGIN_RATE_LIMIT=1000 PUBLIC_RATE_LIMIT=1000 PROVIDERS_MODE=mock npm run api:start",
      url: "http://localhost:4201/v1/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    { command: "NEXT_DIST_DIR=.next-carriers npx next start -p 3401", url: "http://localhost:3401", reuseExistingServer: true, timeout: 60_000 },
  ],
});
