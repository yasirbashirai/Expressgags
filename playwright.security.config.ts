import { defineConfig } from "@playwright/test";

/**
 * Security agent's isolated run of the whole e2e suite against a PRODUCTION build (CSP active).
 * Build: NEXT_DIST_DIR=.next-security NEXT_PUBLIC_API_URL=http://localhost:4301 REVALIDATE_SECRET=sec-e2e npx next build
 * Run:   E2E_API_URL=http://localhost:4301 npx playwright test -c playwright.security.config.ts
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: ".qa/security/test-results",
  use: { baseURL: "http://localhost:3501", channel: "chrome", trace: "retain-on-failure", storageState: "tests/e2e/consent-state.json" },
  webServer: [
    {
      command: "PORT=4301 WEB_ORIGIN=http://localhost:3501 PUBLIC_WEB_URL=http://localhost:3501 LOGIN_RATE_LIMIT=10000 PUBLIC_RATE_LIMIT=10000 REVALIDATE_SECRET=sec-e2e WEB_INTERNAL_URL=http://localhost:3501 npx tsx src/server/index.ts",
      url: "http://localhost:4301/v1/health",
      reuseExistingServer: true,
      timeout: 90_000,
    },
    { command: "NEXT_DIST_DIR=.next-security NEXT_PUBLIC_API_URL=http://localhost:4301 REVALIDATE_SECRET=sec-e2e npx next start -p 3501", url: "http://localhost:3501", reuseExistingServer: true, timeout: 90_000 },
  ],
});
