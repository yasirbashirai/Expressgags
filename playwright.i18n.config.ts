import { defineConfig } from "@playwright/test";

/**
 * I18N e2e against its own servers: API :4303 (WEB_ORIGIN allows :3503), production build in .next-i18n on :3503.
 *   NEXT_PUBLIC_API_URL=http://localhost:4303 NEXT_DIST_DIR=.next-i18n npx next build
 *   E2E_API_URL=http://localhost:4303 npx playwright test -c playwright.i18n.config.ts
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /(i18n|flows|carriers|portal|assistant|creative)\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  outputDir: ".qa/i18n/test-results",
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3503", channel: "chrome", trace: "retain-on-failure", storageState: "tests/e2e/consent-state.json" },
  webServer: [
    {
      command: "PORT=4303 WEB_ORIGIN=http://localhost:3503 LOGIN_RATE_LIMIT=1000 PUBLIC_RATE_LIMIT=1000 npx tsx src/server/index.ts",
      url: "http://localhost:4303/v1/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    { command: "NEXT_DIST_DIR=.next-i18n npx next start -p 3503", url: "http://localhost:3503", reuseExistingServer: true, timeout: 60_000 },
  ],
});
