"use client";

/** Reports: revenue & gross margin by service, market, route, customer and month; lead sources; win rate; carriers. CSV per table. */
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { api, API_URL, money } from "@/components/admin/api";
import { AdminTitle, Panel } from "@/components/admin/admin-shell";
import { marketLabel, serviceLabel } from "@/components/admin/labels";
import { inputCls, StatCard, Tabs } from "@/components/admin/ui";
import { BarList } from "./charts";

type R = { key: string; jobs: number; retailCents: number; costCents: number; marginPercent: number | null };
type Report = {
  byService: R[]; byMarket: R[]; byRoute: R[]; byCustomer: R[]; byMonth: R[];
  leadSources: { key: string; requests: number; won: number; conversionPercent: number | null }[];
  quotations: { sent: number; won: number; declined: number; expired: number; winPercent: number | null; wonValueCents: number };
  carriers: { key: string; shipments: number; costCents: number; retailCents: number }[];
};
type TableKey = "byService" | "byMarket" | "byRoute" | "byCustomer" | "byMonth";

const routeLabel = (k: string) => k.split(" → ").map(marketLabel).join(" → ");
const LABELS: Record<TableKey, { title: string; fmt: (k: string) => string }> = {
  byService: { title: "Service", fmt: serviceLabel },
  byMarket: { title: "Market", fmt: marketLabel },
  byRoute: { title: "Route", fmt: routeLabel },
  byCustomer: { title: "Customer", fmt: (k) => k },
  byMonth: { title: "Month", fmt: (k) => new Date(`${k}-15`).toLocaleDateString("en-US", { month: "short", year: "numeric" }) },
};

export function ReportsView() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [tab, setTab] = useState<TableKey>("byService");
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ report: Report }>(`/reports/summary?from=${from}&to=${to}`).then((x) => setR(x.report)).catch((e) => setErr(e.message));
  }, [from, to]);
  const csv = (table: string) => `${API_URL}/v1/admin/reports/summary.csv?table=${table}&from=${from}&to=${to}`;
  const totals = r ? r.byService.reduce((a, x) => ({ retail: a.retail + x.retailCents, cost: a.cost + x.costCents, jobs: a.jobs + x.jobs }), { retail: 0, cost: 0, jobs: 0 }) : null;

  return (
    <>
      <AdminTitle
        title="Reports & insights"
        sub="Booked revenue and gross margin (internal). Cancelled orders excluded."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted">From<input type="date" className={`${inputCls} !py-1.5`} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="text-xs text-muted">To<input type="date" className={`${inputCls} !py-1.5`} value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        }
      />
      {err && <p className="text-sm text-rose-700" role="alert">{err}</p>}
      {!r || !totals ? <p className="text-sm text-muted">Loading…</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Booked revenue" value={money(totals.retail)} tone="navy" />
            <StatCard label="Gross margin" value={totals.retail && totals.cost ? `${Math.round(((totals.retail - totals.cost) / totals.retail) * 1000) / 10}%` : "-"} hint={totals.cost ? `${money(totals.retail - totals.cost)} profit` : "Add internal costs to see margin"} />
            <StatCard label="Jobs" value={totals.jobs} />
            <StatCard label="Quotation win rate" value={r.quotations.winPercent == null ? "-" : `${r.quotations.winPercent}%`} hint={`${r.quotations.won} of ${r.quotations.sent} sent · ${money(r.quotations.wonValueCents)}`} />
          </div>

          <Panel title="Revenue & margin" className="mt-6" action={<a className="btn-ghost !py-1.5 text-xs" href={csv(tab)}><Download className="h-3.5 w-3.5" aria-hidden /> CSV</a>}>
            <Tabs<TableKey> tabs={(Object.keys(LABELS) as TableKey[]).map((k) => ({ value: k, label: `By ${LABELS[k].title.toLowerCase()}` }))} value={tab} onChange={setTab} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wider text-muted"><th className="py-2">{LABELS[tab].title}</th><th className="py-2 text-right">Jobs</th><th className="py-2 text-right">Revenue</th><th className="py-2 text-right">Cost</th><th className="py-2 text-right">Gross margin</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {r[tab].length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-muted">No orders in this period.</td></tr> : r[tab].map((x) => (
                    <tr key={x.key}>
                      <td className="py-2.5 font-medium text-navy">{LABELS[tab].fmt(x.key)}</td>
                      <td className="py-2.5 text-right">{x.jobs}</td>
                      <td className="py-2.5 text-right">{money(x.retailCents)}</td>
                      <td className="py-2.5 text-right text-slate-ink">{x.costCents ? money(x.costCents) : "-"}</td>
                      <td className={`py-2.5 text-right font-semibold ${x.marginPercent != null && x.marginPercent < 30 ? "text-amber-700" : "text-navy"}`}>{x.marginPercent == null ? "-" : `${x.marginPercent}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Panel title="Lead sources → conversion" action={<a className="btn-ghost !py-1.5 text-xs" href={csv("leadSources")}><Download className="h-3.5 w-3.5" aria-hidden /> CSV</a>}>
              <BarList label="Quote requests by lead source" rows={r.leadSources.map((l) => ({ key: l.key, label: l.key.replace(/-/g, " "), value: l.requests, hint: l.conversionPercent == null ? "" : `${l.conversionPercent}% booked` }))} />
            </Panel>
            <Panel title="Carrier usage" action={<a className="btn-ghost !py-1.5 text-xs" href={csv("carriers")}><Download className="h-3.5 w-3.5" aria-hidden /> CSV</a>}>
              {r.carriers.length === 0 ? (
                <p className="text-sm text-muted">Nationwide carrier shipping is not active yet. Carrier cost, volume and margin by carrier will appear here once UPS / FedEx / DHL labels are purchased through the platform, supporting future rate negotiations.</p>
              ) : (
                <BarList label="Shipments by carrier" rows={r.carriers.map((c) => ({ key: c.key, label: c.key, value: c.shipments, hint: `${money(c.retailCents)} sold · ${money(c.costCents)} cost` }))} />
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
