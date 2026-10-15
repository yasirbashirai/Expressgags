import { defineConfig } from "@playwright/test";

/** QA agent runs against already-started servers: API 4304, web 3504 (see .qa/qa). */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /lifecycle\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: ".qa/qa/test-results",
  use: { baseURL: "http://localhost:3504", channel: "chrome", trace: "retain-on-failure", storageState: "tests/e2e/consent-state.json" },
});
