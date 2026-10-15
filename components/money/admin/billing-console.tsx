"use client";

/**
 * Billing console: invoices, payments, aging (receivables), new invoice from orders, and
 * policies (cancellation/refund rules, daily housekeeping). Payments/refunds: OWNER + ACCOUNTING.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FilePlus2, RefreshCw } from "lucide-react";
import { api, API_URL, dateTime, money } from "@/components/admin/api";
import { AdminTitle, Panel, useAdminUser } from "@/components/admin/admin-shell";
import { Badge } from "@/components/admin/labels";
import { DataTable, EmptyState, Field, inputCls, StatCard, Tabs, Toolbar } from "@/components/admin/ui";
import { BarList } from "./charts";

export const INVOICE_STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-cloud text-slate-ink ring-line",
  SENT: "bg-navy-50 text-navy ring-navy-100",
  PARTIAL: "bg-amber-50 text-amber-800 ring-amber-200",
  PAID: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  OVERDUE: "bg-rose-50 text-rose-800 ring-rose-200",
  VOID: "bg-cloud text-muted ring-line",
};
export const SYNC_STYLE: Record<string, string> = { SYNCED: "bg-emerald-50 text-emerald-800", FAILED: "bg-rose-50 text-rose-800", PENDING: "bg-amber-50 text-amber-800", DISABLED: "bg-cloud text-muted" };

type Tab = "invoices" | "payments" | "aging" | "new" | "policies";

export function BillingConsole() {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "invoices");
  const change = (t: Tab) => {
    setTab(t);
    router.replace(`/admin/billing?tab=${t}`);
  };
  return (
    <>
      <AdminTitle
        title="Invoices & payments"
        sub="Receivables, online payments, refunds and QuickBooks sync"
        actions={<button className="btn-primary !py-2" onClick={() => change("new")}><FilePlus2 className="h-4 w-4" aria-hidden /> New invoice</button>}
      />
      <Tabs<Tab>
        tabs={[
          { value: "invoices", label: "Invoices" },
          { value: "payments", label: "Payments" },
          { value: "aging", label: "Aging" },
          { value: "new", label: "New invoice" },
          { value: "policies", label: "Policies" },
        ]}
        value={tab}
        onChange={change}
      />
      {tab === "invoices" && <Invoices />}
      {tab === "payments" && <Payments />}
      {tab === "aging" && <Aging />}
      {tab === "new" && <NewInvoice />}
      {tab === "policies" && <Policies />}
    </>
  );
}

type InvRow = { id: string; number: string; status: string; customer: string; customerEmail: string; issuedAt: string | null; dueAt: string | null; totalCents: number; paidCents: number; balanceCents: number; poNumber: string | null; qboSyncStatus: string };

function Invoices() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ invoices: InvRow[]; counts: Record<string, number> } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (q) p.set("q", q);
      api<{ invoices: InvRow[]; counts: Record<string, number> }>(`/billing/invoices?${p}`).then(setData);
    }, 200);
    return () => clearTimeout(t);
  }, [status, q]);
  return (
    <>
      <Toolbar>
        <input aria-label="Search invoices" className={`${inputCls} max-w-xs`} placeholder="Number, customer or PO" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Filter by status" className={`${inputCls} max-w-[180px]`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.keys(INVOICE_STATUS_STYLE).map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()} {data?.counts[s] ? `(${data.counts[s]})` : ""}</option>)}
        </select>
        <a className="btn-ghost !py-2" href={`${API_URL}/v1/admin/billing/invoices.csv`}><Download className="h-4 w-4" aria-hidden /> CSV</a>
      </Toolbar>
      {!data ? <p className="text-sm text-muted">Loading…</p> : (
        <DataTable
          rows={data.invoices}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/admin/billing/invoices/${r.id}`)}
          empty={<EmptyState title="No invoices yet" text="Create one from completed orders in the New invoice tab." />}
          columns={[
            { key: "n", header: "Invoice", cell: (r) => <span className="font-mono text-xs font-semibold text-navy">{r.number}</span> },
            { key: "c", header: "Customer", cell: (r) => <span><span className="font-medium text-navy">{r.customer}</span>{r.poNumber && <span className="block text-xs text-muted">PO {r.poNumber}</span>}</span> },
            { key: "s", header: "Status", cell: (r) => <Badge className={INVOICE_STATUS_STYLE[r.status]}>{r.status}</Badge> },
            { key: "d", header: "Due", cell: (r) => <span className="text-xs">{r.dueAt ? new Date(r.dueAt).toLocaleDateString() : "-"}</span> },
            { key: "t", header: "Total", className: "text-right", cell: (r) => money(r.totalCents) },
            { key: "b", header: "Balance", className: "text-right", cell: (r) => <span className="font-semibold text-navy">{money(r.balanceCents)}</span> },
            { key: "q", header: "QuickBooks", cell: (r) => <Badge className={SYNC_STYLE[r.qboSyncStatus]}>{r.qboSyncStatus.toLowerCase()}</Badge>, mobile: false },
          ]}
        />
      )}
    </>
  );
}

type PayRow = { id: string; method: string; kind: string; status: string; amountCents: number; orderReference: string | null; invoiceNumber: string | null; quotationReference: string | null; customer: string | null; note: string | null; recordedBy: string | null; createdAt: string };

function Payments() {
  const user = useAdminUser();
  const canRefund = user?.role === "OWNER" || user?.role === "ACCOUNTING";
  const [rows, setRows] = useState<PayRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => api<{ payments: PayRow[] }>("/billing/payments").then((r) => setRows(r.payments)), []);
  useEffect(() => {
    load();
  }, [load]);
  const refund = async (p: PayRow) => {
    const v = window.prompt(`Refund amount in dollars (max ${(p.amountCents / 100).toFixed(2)})`, (p.amountCents / 100).toFixed(2));
    if (!v) return;
    try {
      await api(`/billing/payments/${p.id}/refund`, { method: "POST", json: { amountCents: Math.round(Number(v) * 100) } });
      setMsg("Refund recorded.");
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  if (!rows) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <>
      {msg && <p className="mb-3 text-sm text-navy" role="status">{msg}</p>}
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState title="No payments yet" />}
        columns={[
          { key: "d", header: "Date", cell: (r) => <span className="text-xs">{dateTime(r.createdAt)}</span> },
          { key: "k", header: "Type", cell: (r) => <span className="capitalize">{r.kind.toLowerCase()} · {r.method}</span> },
          { key: "f", header: "For", cell: (r) => <span className="text-xs">{r.invoiceNumber ?? r.orderReference ?? r.quotationReference ?? "-"}{r.customer && <span className="block text-muted">{r.customer}</span>}</span> },
          { key: "s", header: "Status", cell: (r) => <Badge className={r.status === "SUCCEEDED" ? "bg-emerald-50 text-emerald-800" : r.status === "FAILED" ? "bg-rose-50 text-rose-800" : "bg-cloud text-muted"}>{r.status.toLowerCase()}</Badge> },
          { key: "a", header: "Amount", className: "text-right", cell: (r) => <span className={`font-semibold ${r.kind === "REFUND" ? "text-rose-700" : "text-navy"}`}>{r.kind === "REFUND" ? "-" : ""}{money(r.amountCents)}</span> },
          { key: "x", header: "", mobile: false, cell: (r) => (canRefund && r.status === "SUCCEEDED" && r.kind !== "REFUND" ? <button className="text-xs font-semibold text-orange-700" onClick={() => refund(r)}>Refund</button> : null) },
        ]}
      />
    </>
  );
}

type AgingData = { totalCents: number; buckets: Record<string, number>; customers: { customerId: string; name: string; balanceCents: number; buckets: Record<string, number> }[]; invoices: { id: string; number: string; customer: string; dueAt: string | null; balanceCents: number; bucket: string; status: string }[] };
const BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"];

function Aging() {
  const [a, setA] = useState<AgingData | null>(null);
  useEffect(() => {
    api<{ aging: AgingData }>("/billing/aging").then((r) => setA(r.aging));
  }, []);
  if (!a) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Outstanding" value={money(a.totalCents)} tone="navy" />
        {BUCKETS.map((b) => <StatCard key={b} label={b === "current" ? "Not yet due" : `${b} days`} value={money(a.buckets[b] ?? 0)} />)}
      </div>
      <Panel title="Receivables by age" action={<a className="btn-ghost !py-1.5 text-xs" href={`${API_URL}/v1/admin/billing/aging.csv`}><Download className="h-3.5 w-3.5" aria-hidden /> CSV</a>}>
        <BarList
          label="Outstanding balance by days past due"
          format={money}
          rows={BUCKETS.map((b) => ({ key: b, label: b === "current" ? "Not yet due" : `${b} days past due`, value: a.buckets[b] ?? 0 }))}
        />
      </Panel>
      <Panel title="By customer">
        <DataTable
          rows={a.customers}
          rowKey={(r) => r.customerId}
          empty={<EmptyState title="Nothing outstanding" text="Every issued invoice is paid." />}
          columns={[
            { key: "n", header: "Customer", cell: (r) => <span className="font-medium text-navy">{r.name}</span> },
            ...BUCKETS.map((b) => ({ key: b, header: b === "current" ? "Current" : b, className: "text-right", cell: (r: AgingData["customers"][number]) => (r.buckets[b] ? money(r.buckets[b]) : <span className="text-muted">-</span>) })),
            { key: "t", header: "Balance", className: "text-right", cell: (r) => <span className="font-semibold text-navy">{money(r.balanceCents)}</span> },
          ]}
        />
      </Panel>
    </div>
  );
}

type OrderRow = { id: string; reference: string; status: string; serviceType: string; serviceDate: string; customerId: string; customer: string; company: string | null; companyId: string | null; retailCents: number; paidCents: number; poNumber: string | null; paymentStatus: string };

function NewInvoice() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [po, setPo] = useState("");
  const [cc, setCc] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDays, setDueDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    api<{ orders: OrderRow[] }>("/billing/uninvoiced-orders").then((r) => setOrders(r.orders));
  }, []);
  const account = useMemo(() => {
    const first = orders?.find((o) => o.id === selected[0]);
    return first ? { companyId: first.companyId, customerId: first.customerId, label: first.company ?? first.customer } : null;
  }, [orders, selected]);
  const visible = (orders ?? []).filter((o) => !filter || `${o.reference} ${o.customer} ${o.company ?? ""}`.toLowerCase().includes(filter.toLowerCase()));
  const compatible = (o: OrderRow) => !account || (account.companyId ? o.companyId === account.companyId : o.customerId === account.customerId);
  const total = (orders ?? []).filter((o) => selected.includes(o.id)).reduce((s, o) => s + o.retailCents - o.paidCents, 0);

  const create = async (send: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ invoice: { id: string } }>("/billing/invoices", { method: "POST", json: { orderIds: selected, poNumber: po || null, costCenter: cc || null, notes: notes || null, send, dueDays: dueDays ? Number(dueDays) : undefined } });
      router.push(`/admin/billing/invoices/${r.invoice.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  if (!orders) return <p className="text-sm text-muted">Loading orders…</p>;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel title="Choose orders to invoice">
        <p className="mb-3 text-sm text-slate-ink">Priced orders not yet on an invoice. Select several orders from one account for a consolidated (for example monthly) invoice. Deposits already paid are credited automatically.</p>
        <input aria-label="Filter orders" className={`${inputCls} mb-3 max-w-xs`} placeholder="Filter by reference or customer" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {visible.length === 0 ? <EmptyState title="No orders to invoice" text="Orders appear here once they have a price." /> : (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {visible.map((o) => {
              const on = selected.includes(o.id);
              const ok = compatible(o) || on;
              return (
                <li key={o.id}>
                  <label className={`flex cursor-pointer items-center gap-3 px-4 py-3 text-sm ${!ok ? "opacity-40" : ""}`}>
                    <input type="checkbox" disabled={!ok} checked={on} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, o.id] : s.filter((x) => x !== o.id)))} className="h-4 w-4 accent-[#002858]" />
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-xs font-semibold text-navy">{o.reference}</span> <span className="text-muted">· {new Date(o.serviceDate).toLocaleDateString()}</span>
                      <span className="block truncate text-slate-ink">{o.company ?? o.customer} · {o.serviceType.replace(/-/g, " ")}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold text-navy">{money(o.retailCents)}</span>
                      {o.paidCents > 0 && <span className="block text-xs text-emerald-700">{money(o.paidCents)} paid</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <section className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{account ? account.label : "No account selected"}</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-navy">{money(total)}</p>
          <p className="text-xs text-muted">{selected.length} order{selected.length === 1 ? "" : "s"} · net of deposits</p>
          <div className="mt-4 grid gap-3">
            <Field label="PO number" htmlFor="ni-po"><input id="ni-po" className={inputCls} value={po} onChange={(e) => setPo(e.target.value)} /></Field>
            <Field label="Cost center" htmlFor="ni-cc"><input id="ni-cc" className={inputCls} value={cc} onChange={(e) => setCc(e.target.value)} /></Field>
            <Field label="Payment terms (days)" htmlFor="ni-due" hint="Blank uses the company's terms (0 = due on receipt)."><input id="ni-due" inputMode="numeric" className={inputCls} value={dueDays} onChange={(e) => setDueDays(e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Notes on invoice" htmlFor="ni-notes"><textarea id="ni-notes" rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
          {err && <p role="alert" className="mt-3 text-sm text-rose-700">{err}</p>}
          <div className="mt-4 grid gap-2">
            <button className="btn-primary" disabled={!selected.length || busy} onClick={() => create(true)}>Create and send</button>
            <button className="btn-ghost" disabled={!selected.length || busy} onClick={() => create(false)}>Save as draft</button>
          </div>
        </section>
      </aside>
    </div>
  );
}

type Rules = { refundPercent: Record<string, number>; feeCents: Record<string, number>; note?: string };
const STAGES = [
  ["before-dispatch", "Before dispatch"],
  ["driver-dispatched", "Driver dispatched"],
  ["after-pickup", "After pickup"],
  ["label-purchased", "Carrier label purchased"],
  ["storage-started", "Storage started"],
] as const;

function Policies() {
  const user = useAdminUser();
  const isOwner = user?.role === "OWNER";
  const [rules, setRules] = useState<Rules | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api<{ rules: Rules }>("/billing/cancellation-rules").then((r) => setRules(r.rules));
  }, []);
  const save = async () => {
    try {
      await api("/billing/cancellation-rules", { method: "PUT", json: rules });
      setMsg("Cancellation rules saved.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const daily = async () => {
    try {
      const r = await api<{ overdue: number; expired: number }>("/billing/jobs/daily", { method: "POST" });
      setMsg(`Marked ${r.overdue} invoice(s) overdue and ${r.expired} quotation(s) expired.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  if (!rules) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel title="Cancellation and refund rules">
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{rules.note || "Placeholder rules. Express Bags must confirm its cancellation policy before launch."} The platform only suggests a refund. Staff always confirm the actual refund.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-muted"><th className="py-2">Stage when cancelled</th><th className="py-2">Refund % of paid</th><th className="py-2">Fee kept ($)</th></tr></thead>
            <tbody className="divide-y divide-line">
              {STAGES.map(([k, label]) => (
                <tr key={k}>
                  <td className="py-2.5 font-medium text-navy">{label}</td>
                  <td className="py-2.5 pr-3"><input aria-label={`${label} refund percent`} inputMode="numeric" disabled={!isOwner} className={inputCls} value={rules.refundPercent[k] ?? 0} onChange={(e) => setRules({ ...rules, refundPercent: { ...rules.refundPercent, [k]: Math.min(100, Number(e.target.value) || 0) } })} /></td>
                  <td className="py-2.5"><input aria-label={`${label} fee`} inputMode="decimal" disabled={!isOwner} className={inputCls} value={(rules.feeCents[k] ?? 0) / 100} onChange={(e) => setRules({ ...rules, feeCents: { ...rules.feeCents, [k]: Math.round((Number(e.target.value) || 0) * 100) } })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <Field label="Policy note" htmlFor="pol-note"><input id="pol-note" disabled={!isOwner} className={inputCls} value={rules.note ?? ""} onChange={(e) => setRules({ ...rules, note: e.target.value })} /></Field>
        </div>
        {isOwner ? <button className="btn-primary mt-4" onClick={save}>Save rules</button> : <p className="mt-4 text-xs text-muted">Only the owner can change these rules.</p>}
      </Panel>
      <Panel title="Housekeeping">
        <p className="text-sm text-slate-ink">Marks unpaid invoices past their due date as overdue and expires quotations past their validity. It also runs automatically whenever lists are opened.</p>
        {isOwner && <button className="btn-ghost mt-4" onClick={daily}><RefreshCw className="h-4 w-4" aria-hidden /> Run now</button>}
        <p className="mt-4 text-sm text-slate-ink">QuickBooks sync and online payments are switched on in <Link href="/admin/settings" className="font-semibold text-orange-700">Settings</Link> once Express Bags connects its own accounts.</p>
      </Panel>
      {msg && <p className="text-sm text-navy lg:col-span-2" role="status">{msg}</p>}
    </div>
  );
}
