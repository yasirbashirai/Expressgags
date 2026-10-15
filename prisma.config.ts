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
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
