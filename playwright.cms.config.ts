import { defineConfig } from "@playwright/test";

/**
 * CMS end-to-end tests on dedicated ports (API 4205, site 3405) so they can run beside other work.
 * Build first: NEXT_DIST_DIR=.next-cms NEXT_PUBLIC_API_URL=http://localhost:4205 REVALIDATE_SECRET=cms-e2e-secret npx next build
 */
process.env.E2E_API_URL = "http://localhost:4205";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /cms\.spec\.ts/,
  outputDir: ".qa/cms/test-results",
  timeout: 90_000,
  workers: 1,
  // The shared local Prisma dev DB (PGlite) can drop a query under concurrent load from other work; production Postgres does not.
  retries: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3405", channel: "chrome", trace: "retain-on-failure" },
  webServer: [
    {
      command: "PORT=4205 REVALIDATE_SECRET=cms-e2e-secret WEB_INTERNAL_URL=http://localhost:3405 WEB_ORIGIN=http://localhost:3405 LOGIN_RATE_LIMIT=10000 npx tsx src/server/index.ts",
      url: "http://localhost:4205/v1/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    { command: "NEXT_DIST_DIR=.next-cms NEXT_PUBLIC_API_URL=http://localhost:4205 REVALIDATE_SECRET=cms-e2e-secret npx next start -p 3405", url: "http://localhost:3405", reuseExistingServer: true, timeout: 90_000 },
  ],
});
