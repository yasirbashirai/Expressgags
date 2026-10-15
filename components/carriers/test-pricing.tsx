"use client";

/**
 * "Test pricing" sandbox (Master Requirements §16): run 25 representative scenarios through the same
 * engines the website would use, review price + decision for each, keep the run as evidence, and
 * (owner only) approve switching public instant pricing on, or switch it back off.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, FlaskConical, Loader2, Power, ShieldCheck } from "lucide-react";
import { api, dateTime, money } from "@/components/admin/api";
import { AdminTitle, Panel, useAdminUser } from "@/components/admin/admin-shell";
import { Badge } from "@/components/admin/labels";
import { ConfirmButton, Field, inputCls, StatCard, Tabs } from "@/components/admin/ui";
import { LEVEL_LABEL, pct } from "./labels";

type Result = {
  id: string;
  label: string;
  group: "local" | "storage" | "nationwide" | "custom";
  decision: string;
  reasons: string[];
  engine: string | null;
  retailCents: number | null;
  costCents: number | null;
  profitCents: number | null;
  marginPercent: number | null;
  manualReview: boolean;
  notes: string[];
  offers?: { level: string; carrier: string; service: string; transitDays: number; retailCents: number; costCents: number; marginPercent: number; manualReview: boolean }[];
};
type Run = { id: string; createdAt: string; scenarioCount: number; runByEmail: string | null; notes: string | null };
type Status = { flags: { pricingEnabled: boolean; instantBookingEnabled: boolean; carrierShippingEnabled: boolean }; approvals: { id: string; action: string; createdAt: string; approvedByEmail: string | null; statement: string | null; testRunId: string | null }[] };

const GROUP_LABEL = { local: "Local", storage: "Storage", nationwide: "Nationwide", custom: "Custom triggers" } as const;
const DECISION_STYLE: Record<string, string> = {
  "standard-quote": "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "custom-quote": "bg-navy text-white",
  "special-route": "bg-orange-100 text-orange-700",
  error: "bg-rose-50 text-rose-800 ring-rose-200",
};

export function TestPricing() {
  const user = useAdminUser();
  const isOwner = user?.role === "OWNER";
  const canRun = isOwner || user?.role === "STAFF";
  const [runs, setRuns] = useState<Run[]>([]);
  const [results, setResults] = useState<Result[] | null>(null);
  const [current, setCurrent] = useState<Run | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [group, setGroup] = useState<"all" | Result["group"]>("all");
  const [notes, setNotes] = useState("");
  const [statement, setStatement] = useState("");
  const [carrierShipping, setCarrierShipping] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const [r, s] = await Promise.all([api<{ runs: Run[] }>("/carriers/sandbox/runs"), api<Status>("/carriers/sandbox/status")]);
    setRuns(r.runs);
    setStatus(s);
  }, []);
  useEffect(() => void refresh().catch((e) => setMsg({ ok: false, text: (e as Error).message })), [refresh]);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ run: Run; results: Result[] }>("/carriers/sandbox/run", { method: "POST", json: notes.trim() ? { notes: notes.trim() } : {} });
      setResults(r.results);
      setCurrent({ ...r.run, runByEmail: user?.email ?? null, notes: notes.trim() || null });
      await refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function openRun(id: string) {
    const r = await api<{ run: Run & { results: Result[] } }>(`/carriers/sandbox/runs/${id}`);
    setResults(r.run.results);
    setCurrent(r.run);
  }

  async function approve(enable: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      await api("/carriers/sandbox/approve", { method: "POST", json: enable ? { enable, carrierShipping, testRunId: current?.id, statement } : { enable } });
      setMsg({ ok: true, text: enable ? "Public instant pricing is now ON." : "Public instant pricing is now OFF. The website is quote-only." });
      await refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const shown = useMemo(() => (results ?? []).filter((r) => group === "all" || r.group === group), [results, group]);
  const summary = useMemo(() => {
    const priced = (results ?? []).filter((r) => r.retailCents != null);
    const review = (results ?? []).filter((r) => r.manualReview).length;
    const avg = priced.length ? priced.reduce((s, r) => s + (r.marginPercent ?? 0), 0) / priced.length : null;
    return { priced: priced.length, review, avg, routed: (results ?? []).length - priced.length };
  }, [results]);
  const on = status?.flags.pricingEnabled && status.flags.instantBookingEnabled;

  return (
    <>
      <Link href="/admin/shipments" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden /> Shipments</Link>
      <AdminTitle
        title="Test pricing"
        sub="Run representative real-world scenarios through the live pricing engines before customers ever see automatic prices."
      />
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mb-4 rounded-xl border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{msg.text}</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Public instant pricing" value={on ? "ON" : "OFF"} tone={on ? "orange" : "navy"} Icon={Power} hint={on ? `Carrier shipping ${status?.flags.carrierShippingEnabled ? "on" : "off"}` : "Website is quote-only"} />
        <StatCard label="Priced in this run" value={results ? summary.priced : "-"} hint={results ? `${summary.routed} routed to a written quote` : "Run the scenarios"} />
        <StatCard label="Needs review" value={results ? summary.review : "-"} hint="Below price or profit floors" />
        <StatCard label="Average margin" value={summary.avg == null ? "-" : pct(summary.avg)} hint="Across priced scenarios" />
      </div>

      <Panel title="Run the scenarios" className="mb-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <Field label="Reviewer notes (saved with the run)" htmlFor="tp-notes">
            <input id="tp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Reviewed with dispatch, Keys trips look right" className={inputCls} />
          </Field>
          <button type="button" disabled={!canRun || busy} onClick={() => void run()} className="btn-primary">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FlaskConical className="h-4 w-4" aria-hidden />} Run 25 scenarios
          </button>
        </div>
        {runs.length > 0 && (
          <div className="mt-4 flex min-w-0 flex-wrap gap-2 text-xs">
            <span className="text-muted">Previous runs:</span>
            {runs.slice(0, 8).map((r) => (
              <button key={r.id} type="button" onClick={() => void openRun(r.id)} className={`rounded-full border px-3 py-1 ${current?.id === r.id ? "border-navy bg-navy text-white" : "border-line hover:bg-cloud"}`}>
                {dateTime(r.createdAt)} · {r.scenarioCount}
              </button>
            ))}
          </div>
        )}
      </Panel>

      {results && (
        <Panel title={`Results${current ? ` · ${dateTime(current.createdAt)}` : ""}`} className="mb-6">
          <Tabs
            tabs={[{ value: "all" as const, label: "All", count: results.length }, ...(["local", "storage", "nationwide", "custom"] as const).map((g) => ({ value: g, label: GROUP_LABEL[g], count: results.filter((r) => r.group === g).length }))]}
            value={group}
            onChange={setGroup}
          />
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
            {shown.map((r) => (
              <li key={r.id} className="min-w-0 rounded-2xl border border-line p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy">{r.label}</p>
                    <p className="text-xs text-muted">{r.reasons[0]}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Badge className={DECISION_STYLE[r.decision] ?? ""}>{r.decision.replace("-", " ")}</Badge>
                    {r.manualReview && <Badge className="bg-rose-50 text-rose-800 ring-rose-200">Review</Badge>}
                  </div>
                </div>
                {r.retailCents != null && (
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    {[["Retail", money(r.retailCents)], ["Cost", money(r.costCents)], ["Profit", money(r.profitCents)], ["Margin", pct(r.marginPercent)]].map(([k, v]) => (
                      <div key={k}><dt className="text-xs uppercase tracking-wider text-muted">{k}</dt><dd className="font-semibold text-navy">{v}</dd></div>
                    ))}
                  </dl>
                )}
                {r.offers && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-xs">
                      <thead className="text-muted"><tr><th className="py-1">Level</th><th>Carrier</th><th>Days</th><th>Retail</th><th>Cost</th><th>Margin</th></tr></thead>
                      <tbody>{r.offers.map((o) => <tr key={o.level} className="border-t border-line"><td className="py-1">{LEVEL_LABEL[o.level] ?? o.level}</td><td>{o.carrier} {o.service}</td><td>{o.transitDays}</td><td>{money(o.retailCents)}</td><td>{money(o.costCents)}</td><td>{pct(o.marginPercent)}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
                {r.notes.length > 0 && <p className="mt-2 text-xs text-muted">{r.notes.join(" · ")}</p>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Owner approval">
        {!isOwner ? (
          <p className="text-sm text-slate-ink">Only the owner can switch public instant pricing on or off. Share the latest run with the owner for approval.</p>
        ) : on ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-ink">Customers currently see instant prices for qualifying requests and can book and pay online.</p>
            <ConfirmButton className="btn-navy" confirmText="Switch to quote-only?" onConfirm={() => void approve(false)}><Power className="h-4 w-4" aria-hidden /> Turn instant pricing off</ConfirmButton>
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="text-sm text-slate-ink">
              Approve only after reviewing a run of at least 20 scenarios from the last 30 days: real carrier account rates, dimensional weight, surcharges, pickup costs,
              margins, minimum prices and profit, service levels, oversize rules, cancellation and refund terms. {current ? `Selected run: ${dateTime(current.createdAt)} (${current.scenarioCount} scenarios).` : "Run or open a test run first."}
            </p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#E06010]" checked={carrierShipping} onChange={(e) => setCarrierShipping(e.target.checked)} /> Include nationwide carrier shipping prices</label>
            <Field label="Approval statement" htmlFor="tp-statement" hint="What you reviewed. Saved with your name and the time.">
              <textarea id="tp-statement" rows={3} value={statement} onChange={(e) => setStatement(e.target.value)} className={inputCls} />
            </Field>
            <div>
              <ConfirmButton className="btn-primary" confirmText="Confirm: turn instant pricing ON" onConfirm={() => void approve(true)}><ShieldCheck className="h-4 w-4" aria-hidden /> Approve &amp; enable instant pricing</ConfirmButton>
            </div>
          </div>
        )}
        {status && status.approvals.length > 0 && (
          <ul className="mt-6 divide-y divide-line border-t border-line text-sm">
            {status.approvals.map((a) => (
              <li key={a.id} className="py-2">
                <span className="font-semibold text-navy">{a.action === "ENABLE" ? "Enabled" : "Disabled"}</span> by {a.approvedByEmail ?? "owner"} · {dateTime(a.createdAt)}
                {a.statement && <span className="block text-xs text-muted">“{a.statement}”</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
