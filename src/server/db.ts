/**
 * Prisma client singleton (Prisma 7 + node-postgres driver adapter).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as { __ebPrisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma: PrismaClient = globalForPrisma.__ebPrisma ?? (globalForPrisma.__ebPrisma = createClient());
