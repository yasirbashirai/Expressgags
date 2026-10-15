import { defineConfig } from "@playwright/test";

/** CREATIVE agent's isolated run: Next on 3406 (NEXT_DIST_DIR=.next-creative), installed Chrome. */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /creative\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  outputDir: ".qa/creative/test-results",
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3406", channel: "chrome" },
  webServer: [{ command: "NEXT_DIST_DIR=.next-creative npx next start -p 3406", url: "http://localhost:3406", reuseExistingServer: true, timeout: 90_000 }],
});
