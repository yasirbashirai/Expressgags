import { defineConfig } from "@playwright/test";

/**
 * Storage + protection e2e against the storage agent's own servers:
 * API :4202 (WEB_ORIGIN allows :3402) and a production Next build in .next-storage on :3402.
 *   NEXT_PUBLIC_API_URL=http://localhost:4202 NEXT_DIST_DIR=.next-storage npx next build
 *   E2E_API_URL=http://localhost:4202 npx playwright test -c playwright.storage.config.ts
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /storage\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  outputDir: ".qa/storage/test-results",
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3402", channel: "chrome", trace: "retain-on-failure" },
  webServer: [
    {
      command: "PORT=4202 WEB_ORIGIN=http://localhost:3402 LOGIN_RATE_LIMIT=1000 PUBLIC_RATE_LIMIT=1000 npx tsx src/server/index.ts",
      url: "http://localhost:4202/v1/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    { command: "NEXT_DIST_DIR=.next-storage npx next start -p 3402", url: "http://localhost:3402", reuseExistingServer: true, timeout: 60_000 },
  ],
});
