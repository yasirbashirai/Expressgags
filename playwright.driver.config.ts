import { defineConfig } from "@playwright/test";

/**
 * Driver app e2e (phone viewport) against a dedicated build + API port so it can run beside other agents.
 * Prereqs: dev DB running, and `NEXT_DIST_DIR=.next-driver NEXT_PUBLIC_API_URL=http://localhost:4102 npx next build`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /driver\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: ".qa/driver/test-results",
  use: { baseURL: "http://localhost:3302", channel: "chrome", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, trace: "retain-on-failure" },
  webServer: [
    { command: "PORT=4102 LOGIN_RATE_LIMIT=1000 DRIVER_RATE_LIMIT=1000 WEB_ORIGIN=http://localhost:3302 npx tsx src/server/index.ts", url: "http://localhost:4102/v1/health", reuseExistingServer: true, timeout: 60_000 },
    { command: "NEXT_DIST_DIR=.next-driver npx next start -p 3302", url: "http://localhost:3302/driver/login", reuseExistingServer: true, timeout: 60_000 },
  ],
});
