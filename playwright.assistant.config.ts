import { defineConfig } from "@playwright/test";

process.env.E2E_API_URL ??= "http://localhost:4203";

/** Assistant e2e on its own ports (API 4203, web 3403). Build first: NEXT_PUBLIC_API_URL=http://localhost:4203 NEXT_DIST_DIR=.next-assistant npx next build */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /assistant\.spec\.ts/,
  timeout: 60_000,
  workers: 1,
  outputDir: ".qa/assistant/test-results",
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3403", channel: "chrome", trace: "retain-on-failure" },
  webServer: [
    { command: "PORT=4203 WEB_ORIGIN=http://localhost:3403 LOGIN_RATE_LIMIT=1000 PUBLIC_RATE_LIMIT=1000 ASSISTANT_RATE_LIMIT=1000 npm run api:start", url: "http://localhost:4203/v1/health", reuseExistingServer: true, timeout: 60_000 },
    { command: "NEXT_DIST_DIR=.next-assistant npx next start -p 3403", url: "http://localhost:3403", reuseExistingServer: true, timeout: 60_000 },
  ],
});
