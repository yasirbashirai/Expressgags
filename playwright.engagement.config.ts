import { defineConfig } from "@playwright/test";

process.env.E2E_API_URL ??= "http://localhost:4204";

/**
 * Engagement module end-to-end tests on isolated ports (API 4204, web 3404).
 * Prereq: `NEXT_DIST_DIR=.next-engagement NEXT_PUBLIC_API_URL=http://localhost:4204 npx next build`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /engagement\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: ".qa/engagement/test-results",
  use: { baseURL: "http://localhost:3404", channel: "chrome", trace: "retain-on-failure", storageState: "tests/e2e/consent-state.json" },
  webServer: [
    {
      command: "PORT=4204 WEB_ORIGIN=http://localhost:3404 PUBLIC_WEB_URL=http://localhost:3404 LOGIN_RATE_LIMIT=1000 PUBLIC_RATE_LIMIT=1000 PROVIDERS_MODE=mock NOTIFICATION_WORKER=off npm run api:start",
      url: "http://localhost:4204/v1/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    { command: "NEXT_DIST_DIR=.next-engagement npx next start -p 3404", url: "http://localhost:3404", reuseExistingServer: true, timeout: 60_000 },
  ],
});
