/**
 * Readiness check for GET /v1/ready (load balancers, uptime monitors, deploy verification).
 * Reports only names and booleans — never secret values.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../db";
import { env, isProd } from "./env";

/** Env vars the API cannot run correctly without in production. */
const REQUIRED_PROD = ["DATABASE_URL", "JWT_SECRET", "WEB_ORIGIN", "PUBLIC_WEB_URL", "PUBLIC_API_URL", "IP_HASH_SALT"] as const;
/** Missing these degrades a feature (reported as warnings, not failures). */
const RECOMMENDED = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM", "REVALIDATE_SECRET", "WEB_INTERNAL_URL", "UPLOAD_DIR"] as const;

function appliedMigrationsExpected(): string[] {
  try {
    return readdirSync(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

export async function readiness() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};
  const warnings: string[] = [];

  // 1. Database reachable
  const t = Date.now();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    checks.database = { ok: true, detail: `${Date.now() - t} ms` };
  } catch (e) {
    checks.database = { ok: false, detail: (e as Error).name };
  }

  // 2. Migrations applied (every folder in prisma/migrations finished in _prisma_migrations)
  if (checks.database.ok) {
    try {
      const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
        `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      );
      const applied = new Set(rows.map((r) => r.migration_name));
      const pending = appliedMigrationsExpected().filter((m) => !applied.has(m));
      checks.migrations = pending.length ? { ok: false, detail: `${pending.length} pending` } : { ok: true, detail: `${applied.size} applied` };
    } catch {
      checks.migrations = { ok: false, detail: "migration table missing" };
    }
  }

  // 3. Required configuration present (production only)
  const missing = isProd ? REQUIRED_PROD.filter((k) => !process.env[k]) : [];
  if (isProd && env.jwtSecret.length < 32) missing.push("JWT_SECRET(>=32 chars)" as never);
  checks.config = missing.length ? { ok: false, detail: `missing: ${missing.join(", ")}` } : { ok: true };
  for (const k of RECOMMENDED) if (isProd && !process.env[k]) warnings.push(`${k} not set`);

  // 4. Background jobs heartbeat (warning only: the worker is a separate service)
  try {
    const q = await prisma.jobState.findUnique({ where: { name: "notifications.queue" } });
    const ageMin = q?.lastFinishedAt ? Math.round((Date.now() - q.lastFinishedAt.getTime()) / 60000) : null;
    if (isProd && process.env.NOTIFICATION_WORKER === "off" && (ageMin === null || ageMin > 10)) warnings.push(`job worker heartbeat ${ageMin === null ? "never" : `${ageMin} min ago`}`);
  } catch {
    /* JobState may not exist on very old schemas */
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return { ok, status: ok ? "ready" : "not-ready", environment: env.nodeEnv, checks, warnings };
}
