#!/usr/bin/env node
/**
 * Dev-only: bring the local database in line with prisma/schema/*.prisma and regenerate the client.
 * Computes the SQL diff (live DB → schema), shows it, applies it in a transaction, then runs `prisma generate`.
 * Production uses real migrations in prisma/migrations (the lead consolidates them before release).
 *
 * Usage: node scripts/db-sync.mjs        (refuses destructive statements unless --allow-drop)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

const allowDrop = process.argv.includes("--allow-drop");
const sql = execFileSync("npx", ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema", "--script"], { encoding: "utf8" });
const body = sql.replace(/^--.*$/gm, "").trim();
if (!body) {
  console.log("db-sync: database already matches the schema.");
} else {
  if (!allowDrop && /\bDROP\s+(TABLE|COLUMN|TYPE)\b/i.test(body)) {
    console.error("db-sync: diff contains DROP statements. Review and rerun with --allow-drop if intended:\n" + body);
    process.exit(1);
  }
  console.log("db-sync: applying\n" + body + "\n");
  const url = process.env.DATABASE_URL || readFileSync(".env", "utf8").match(/DATABASE_URL="?([^"\n]+)"?/)[1];
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("db-sync failed:", e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
execFileSync("npx", ["prisma", "generate"], { stdio: "inherit" });
