import { defineConfig } from "@playwright/test";

/**
 * Operations e2e (orders → dispatch → tracking) against the ops agent's own servers:
 * API :4101 (WEB_ORIGIN allows :3301) and a production Next build in .next-ops on :3301.
 *   NEXT_PUBLIC_API_URL=http://localhost:4101 NEXT_DIST_DIR=.next-ops npx next build
 *   npx playwright test -c playwright.ops.config.ts
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /ops\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3301", channel: "chrome", trace: "retain-on-failure" },
  webServer: [
    {
      command: "PORT=4101 WEB_ORIGIN=http://localhost:3301 LOGIN_RATE_LIMIT=1000 PUBLIC_RATE_LIMIT=1000 TRACK_RATE_LIMIT=1000 npx tsx src/server/index.ts",
      url: "http://localhost:4101/v1/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    { command: "NEXT_DIST_DIR=.next-ops npx next start -p 3301", url: "http://localhost:3301", reuseExistingServer: true, timeout: 60_000 },
  ],
});
