import { defineConfig } from "@playwright/test";

/**
 * Resources module E2E (team, fleet, credentials, users & 2FA) on dedicated ports so it can run
 * beside other agents: API 4103, web 3303 (production build in .next-resources).
 * Prereqs: dev DB running; `NEXT_DIST_DIR=.next-resources NEXT_PUBLIC_API_URL=http://localhost:4103 npx next build`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /resources\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: ".qa/resources/test-results",
  use: { baseURL: "http://localhost:3303", channel: "chrome", trace: "retain-on-failure" },
  webServer: [
    { command: "PORT=4103 LOGIN_RATE_LIMIT=10000 WEB_ORIGIN=http://localhost:3303 npx tsx src/server/index.ts", url: "http://localhost:4103/v1/health", reuseExistingServer: true, timeout: 60_000 },
    { command: "NEXT_DIST_DIR=.next-resources npx next start -p 3303", url: "http://localhost:3303/admin/login", reuseExistingServer: true, timeout: 60_000 },
  ],
});
