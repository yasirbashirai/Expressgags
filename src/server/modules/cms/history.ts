/**
 * Company history content model (History & Roadmap brief §10) and the naming-permission rules.
 *
 * Evidence levels: contracting-customer · end-client-project · company-recollection · operating-environment.
 * Visibility: HIDDEN (never public) · GENERIC (generic title + safe summary, no names) · NAMED (written permission
 * recorded → named title and "supported through <partner>" may be shown).
 * The DB table NotableProjectPermission (projectId = HistoryEntry.id) is the source of truth for naming permission.
 */
import { createHash } from "node:crypto";
import { notableProjects } from "@/content/site";
import { prisma } from "../../db";

export const EVIDENCE_LEVELS = ["contracting-customer", "end-client-project", "company-recollection", "operating-environment"] as const;
export const VISIBILITY = ["HIDDEN", "GENERIC", "NAMED"] as const;

/** Opaque public key (project ids can themselves be names, e.g. "madonna"). */
export const publicKey = (id: string) => createHash("sha256").update(`eb-history:${id}`).digest("hex").slice(0, 12);

/**
 * Imports the notable projects from the history brief (src/content/site.ts) as HistoryEntry rows.
 * Idempotent: existing rows are left untouched; entries start GENERIC unless the DB already records permission.
 */
export async function importHistoryFromBrief() {
  let created = 0;
  for (const [i, p] of notableProjects.entries()) {
    const exists = await prisma.historyEntry.findUnique({ where: { id: p.id } });
    if (exists) continue;
    const perm = await prisma.notableProjectPermission.findUnique({ where: { projectId: p.id } });
    await prisma.historyEntry.create({
      data: {
        id: p.id,
        year: p.period,
        title: p.title,
        endClient: p.title,
        contractingCustomer: p.through ?? null,
        projectType: p.type,
        locations: [],
        evidenceLevel: p.evidence,
        visibility: perm?.permissionGranted ? "NAMED" : "GENERIC",
        genericSummary: p.summary,
        sortOrder: i,
      },
    });
    await prisma.historyEntryDisplay.upsert({
      where: { entryId: p.id },
      update: {},
      create: { entryId: p.id, genericTitle: p.genericTitle },
    });
    created++;
  }
  return { created, total: notableProjects.length };
}

export type PublicHistoryEntry = {
  key: string;
  year: string;
  title: string;
  type: string | null;
  summary: string;
  /** "Supported through …" line: partner name only when NAMED; generic wording otherwise */
  through: string | null;
  locations: string[];
  named: boolean;
};

/** Public view: HIDDEN rows excluded; names, partners and locations only with recorded permission. */
export async function publicHistory(): Promise<PublicHistoryEntry[]> {
  const [rows, displays, perms] = await Promise.all([
    prisma.historyEntry.findMany({ where: { visibility: { in: ["GENERIC", "NAMED"] } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.historyEntryDisplay.findMany(),
    prisma.notableProjectPermission.findMany({ where: { permissionGranted: true } }),
  ]);
  const generic = new Map(displays.map((d) => [d.entryId, d.genericTitle]));
  const granted = new Set(perms.map((p) => p.projectId));
  return rows.map((r) => {
    // NAMED requires BOTH the visibility flag and a recorded permission row
    const named = r.visibility === "NAMED" && granted.has(r.id);
    return {
      key: publicKey(r.id),
      year: r.year,
      title: named ? r.title : generic.get(r.id) ?? r.projectType ?? "Logistics assignment",
      type: r.projectType,
      summary: r.genericSummary ?? "",
      through: r.contractingCustomer ? (named ? r.contractingCustomer : "a contracting partner") : null,
      locations: named ? r.locations : [],
      named,
    };
  });
}

/** IDs with written naming permission (used by the content guardrail export). */
export async function grantedProjectIds() {
  const perms = await prisma.notableProjectPermission.findMany({ where: { permissionGranted: true }, select: { projectId: true } });
  return perms.map((p) => p.projectId).sort();
}
