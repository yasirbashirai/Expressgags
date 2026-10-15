/**
 * Prisma client singleton (Prisma 7 + node-postgres driver adapter).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as { __ebPrisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  // DB_POOL_MAX=1 for the local Prisma dev server (PGlite serves one connection at a time);
  // production Postgres uses the default pool size.
  const max = process.env.DB_POOL_MAX ? Number(process.env.DB_POOL_MAX) : undefined;
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, ...(max ? { max } : {}) }) });
}

export const prisma: PrismaClient = globalForPrisma.__ebPrisma ?? (globalForPrisma.__ebPrisma = createClient());
