/**
 * Prisma 7 configuration. Loads .env (Node 22 built-in) so CLI commands see DATABASE_URL.
 */
import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env file — rely on real environment variables (production)
}

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Prisma CLI (migrate deploy) uses the DIRECT connection when given (Neon: the non "-pooler" host);
    // the running app always uses DATABASE_URL (pooled) through @prisma/adapter-pg.
    url: process.env["DIRECT_DATABASE_URL"] || process.env["DATABASE_URL"],
  },
});
