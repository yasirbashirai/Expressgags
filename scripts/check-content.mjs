#!/usr/bin/env node
/**
 * Express Bags content guardrail check.
 * Scans the rendered HTML of every built page (default: .next/server/app) and fails if any
 * private fact or banned claim appears publicly. Rules come from Carlos's completed form (A2–A16, B13).
 *
 * Usage: node scripts/check-content.mjs [htmlDir]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { notableProjectsPublic } from "./notable-permissions.mjs";

const dir = process.argv[2] || join(process.env.NEXT_DIST_DIR || ".next", "server", "app");

/** Hard failures: private data and banned claims. */
const RULES = [
  { id: "street-address", re: /7500\s*N\.?W\.?\s*55|55th\s+St/i, why: "Street office address is private (use the P.O. Box)" },
  { id: "owner-mobile", re: /874[\s.-]?0832/, why: "Owner's mobile number is private" },
  { id: "owner-email", re: /cjdelgado/i, why: "Owner's private email" },
  { id: "owner-name", re: /\b(Carlos|Delgado)\b/, why: "Owner identity must never be public" },
  { id: "licensed-insured", re: /licensed\s*(and|&|&amp;)\s*insured/i, why: "Unverified claim (form B13)" },
  { id: "24-7", re: /\b24\s*\/\s*7\b|twenty-four\s+seven/i, why: "Absolute availability claim (form B13)" },
  { id: "guaranteed", re: /\bguarantee(d)?\b/i, why: "No guarantees unless documented (form B13, Q15)" },
  { id: "always-on-time", re: /always\s+on[\s-]time/i, why: "Absolute promise (form B13)" },
  { id: "zero-damage", re: /zero[\s-]damage/i, why: "Absolute promise (form B13)" },
  { id: "unlimited-storage", re: /unlimited\s+storage/i, why: "Unsupported storage claim (form B1)" },
  { id: "moving-service", re: /\b(moving\s+(services?|company|companies)|local\s+movers?|we\s+(also\s+)?move\s+homes|apartment\s+moves?)\b/i, why: "No moving services (form B13)" },
  { id: "food-delivery", re: /\b(food|catering)\s+delivery\b(?![^<]{0,40}(not|no)\b)/i, why: "No food/catering delivery — only allowed in an exclusion sentence", allowIf: /no\s+food\s+or\s+catering|not\s+(market|offer|accept)[^<]{0,60}(food|catering)|food\s+or\s+catering\s+delivery\s*<?/i },
  { id: "insurance-product", re: /luggage\s+insurance|buy\s+insurance/i, why: "Protection must not be sold as insurance (legal approval pending)" },
  { id: "lorem", re: /lorem ipsum|TODO|FIXME|\[placeholder\]/i, why: "Unfinished content" },
];

/** Named end-clients that need written permission before publication (form B13 / history doc). */
const PERMISSION_NAMES = [
  { id: "u2", re: /\bU2\b/ },
  { id: "madonna", re: /Madonna/ },
  { id: "roger-waters", re: /Roger\s+Waters/ },
  { id: "nba", re: /76ers|Pacers/ },
  { id: "rbc-groups", re: /Royal\s+Bank|\bRBC\b/ },
  { id: "ny-life", re: /New\s+York\s+Life/ },
  { id: "oklahoma", re: /University\s+of\s+Oklahoma/ },
  { id: "royal-family", re: /Dutch\s+Royal/ },
];

function walk(d, out = []) {
  let entries;
  try { entries = readdirSync(d); } catch { return out; }
  for (const e of entries) {
    const p = join(d, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (p.endsWith(".html")) out.push(p);
  }
  return out;
}

/** Strip scripts/styles/tags to compare against visible text + attributes that matter. */
function visible(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, (m) => (m.includes("application/ld+json") ? m : " "))
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

const files = walk(dir);
if (files.length === 0) {
  console.error(`check-content: no HTML found in ${dir}. Run "npm run build" first.`);
  process.exit(2);
}

const failures = [];
const warnings = [];
const allowed = new Set(notableProjectsPublic);

for (const f of files) {
  const text = visible(readFileSync(f, "utf8"));
  for (const r of RULES) {
    const m = text.match(r.re);
    if (m && !(r.allowIf && r.allowIf.test(text.slice(Math.max(0, m.index - 80), m.index + 120)))) {
      failures.push(`${f}: [${r.id}] "${m[0]}" — ${r.why}`);
    }
  }
  for (const n of PERMISSION_NAMES) {
    const m = text.match(n.re);
    if (m && !allowed.has(n.id)) failures.push(`${f}: [permission:${n.id}] "${m[0]}" — named end-client without recorded written permission`);
  }
  const dashes = (text.replace(/<[^>]+>/g, " ").match(/ — /g) || []).length;
  if (dashes > 0) warnings.push(`${f}: ${dashes} em dash(es) in visible copy (house style: use commas)`);
}

for (const w of warnings) console.warn("WARN", w);
if (failures.length) {
  console.error(`\ncheck-content: ${failures.length} problem(s) in ${files.length} pages:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`check-content: ${files.length} pages clean ✓`);
