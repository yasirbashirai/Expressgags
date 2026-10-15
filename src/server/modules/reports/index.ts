/**
 * Reports module (/v1/admin/reports).
 *  GET /dashboard  — Owner & Operations Dashboard (role-aware: DISPATCHER sees no money, ACCOUNTING sees no ops list)
 *  GET /summary    — revenue & margin by service / market / route / customer / month, lead sources, win rate, carriers
 *  GET /summary.csv?table=… — CSV export of one table
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../auth";
import { asyncHandler } from "../../lib/errors";
import type { PlatformModule } from "../types";
import { dashboardData, revenueReport } from "./service";

export const adminRouter = Router();
adminRouter.use(asyncHandler(async (req, res, next) => requireAuth(req, res, next)));

adminRouter.get(
  "/dashboard",
  requireRole("STAFF", "DISPATCHER", "ACCOUNTING"),
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    const data = await dashboardData({ includeMoney: role !== "DISPATCHER", includeOps: role !== "ACCOUNTING" });
    res.json({ ok: true, role, ...data });
  }),
);

const range = z.object({ from: z.string().max(30).optional(), to: z.string().max(30).optional() });
function parseRange(q: unknown) {
  const r = range.parse(q);
  const to = r.to ? new Date(`${r.to}T23:59:59.999`) : new Date();
  const from = r.from ? new Date(`${r.from}T00:00:00`) : new Date(to.getFullYear(), 0, 1);
  return { from, to };
}

adminRouter.get(
  "/summary",
  requireRole("STAFF", "ACCOUNTING"),
  asyncHandler(async (req, res) => {
    const { from, to } = parseRange(req.query);
    res.json({ ok: true, report: await revenueReport(from, to) });
  }),
);

adminRouter.get(
  "/summary.csv",
  requireRole("STAFF", "ACCOUNTING"),
  asyncHandler(async (req, res) => {
    const { from, to } = parseRange(req.query);
    const table = z.enum(["byService", "byMarket", "byRoute", "byCustomer", "byMonth", "leadSources", "carriers"]).parse(req.query.table ?? "byService");
    const r = await revenueReport(from, to);
    const rows = r[table] as Record<string, unknown>[];
    const cols = rows.length ? Object.keys(rows[0]) : ["key"];
    const cell = (v: unknown, k: string) => {
      if (v == null) return "";
      const s = /Cents$/.test(k) ? (Number(v) / 100).toFixed(2) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="express-bags-${table}.csv"`);
    res.send([cols.map((c) => c.replace(/Cents$/, " ($)")).join(","), ...rows.map((row) => cols.map((c) => cell(row[c], c)).join(","))].join("\n"));
  }),
);

export const platformModule: PlatformModule = {
  name: "reports",
  routes: [{ scope: "admin", path: "/reports", router: adminRouter }],
};
