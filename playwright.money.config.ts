import { defineConfig } from "@playwright/test";

/**
 * Money module end-to-end tests (isolated ports so other agents' servers are untouched).
 * Prereqs: Prisma dev DB running; `NEXT_DIST_DIR=.next-money NEXT_PUBLIC_API_URL=http://localhost:4105 npx next build`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /money\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  // Own output folder: other agents run Playwright in parallel and clean the shared test-results/
  outputDir: ".qa/money/test-results",
  use: { baseURL: "http://localhost:3305", channel: "chrome", trace: "retain-on-failure" },
  webServer: [
    {
      command: "PORT=4105 WEB_ORIGIN=http://localhost:3305 PUBLIC_WEB_URL=http://localhost:3305 LOGIN_RATE_LIMIT=1000 PUBLIC_RATE_LIMIT=1000 PROVIDERS_MODE=mock npm run api:start",
      url: "http://localhost:4105/v1/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    { command: "NEXT_DIST_DIR=.next-money npx next start -p 3305", url: "http://localhost:3305", reuseExistingServer: true, timeout: 60_000 },
  ],
});
