"use client";

/** Quotations list with status tabs, search and internal margin at a glance. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, dateTime, money } from "@/components/admin/api";
import { AdminTitle } from "@/components/admin/admin-shell";
import { Badge } from "@/components/admin/labels";
import { DataTable, EmptyState, inputCls, Tabs, Toolbar } from "@/components/admin/ui";

type Row = { id: string; reference: string; title: string; status: string; source: string; customerName: string; customerEmail: string; totalCents: number; costCents: number | null; marginPct: number | null; depositCents: number; validUntil: string | null; sentAt: string | null; acceptedAt: string | null; orderReference: string | null; createdAt: string };

export const QUOTATION_STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-cloud text-slate-ink ring-line",
  SENT: "bg-navy-50 text-navy ring-navy-100",
  VIEWED: "bg-sky-50 text-sky-800 ring-sky-200",
  ACCEPTED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CONVERTED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  DECLINED: "bg-rose-50 text-rose-800 ring-rose-200",
  EXPIRED: "bg-amber-50 text-amber-800 ring-amber-200",
};

const TABS = ["ALL", "DRAFT", "SENT", "VIEWED", "CONVERTED", "DECLINED", "EXPIRED"] as const;

export function QuotationsList() {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("ALL");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ quotations: Row[]; counts: Record<string, number> } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (tab !== "ALL") p.set("status", tab);
      if (q) p.set("q", q);
      api<{ quotations: Row[]; counts: Record<string, number> }>(`/quotations?${p}`).then(setData).catch((e) => setErr(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [tab, q]);

  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <>
      <AdminTitle title="Quotations" sub="Itemized offers, electronic acceptance and deposits" actions={<Link href="/admin/quotations/new" className="btn-primary !py-2"><Plus className="h-4 w-4" aria-hidden /> New quotation</Link>} />
      <Tabs tabs={TABS.map((t) => ({ value: t, label: t === "ALL" ? "All" : t === "CONVERTED" ? "Accepted" : t[0] + t.slice(1).toLowerCase(), count: t === "ALL" ? total : data?.counts[t] ?? 0 }))} value={tab} onChange={setTab} />
      <Toolbar>
        <input aria-label="Search quotations" className={`${inputCls} max-w-sm`} placeholder="Search reference, title or customer" value={q} onChange={(e) => setQ(e.target.value)} />
      </Toolbar>
      {err && <p className="text-sm text-rose-700" role="alert">{err}</p>}
      {!data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <DataTable
          rows={data.quotations}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/admin/quotations/${r.id}`)}
          empty={<EmptyState title="No quotations yet" text="Open a quote request and choose Build quotation, or start a blank one." action={<Link href="/admin/quotations/new" className="btn-primary">New quotation</Link>} />}
          columns={[
            { key: "ref", header: "Reference", cell: (r) => <span className="font-mono text-xs font-semibold text-navy">{r.reference}</span> },
            { key: "customer", header: "Customer", cell: (r) => <span><span className="font-medium text-navy">{r.customerName}</span><span className="block text-xs text-muted">{r.title}</span></span> },
            { key: "status", header: "Status", cell: (r) => <Badge className={QUOTATION_STATUS_STYLE[r.status]}>{r.status === "CONVERTED" ? "ACCEPTED" : r.status}</Badge> },
            { key: "total", header: "Total", className: "text-right", cell: (r) => <span className="font-semibold text-navy">{money(r.totalCents)}</span> },
            { key: "margin", header: "Margin", className: "text-right", cell: (r) => (r.marginPct == null || !r.costCents ? <span className="text-muted">-</span> : <span className={r.marginPct < 30 ? "font-semibold text-amber-700" : "text-slate-ink"}>{r.marginPct}%</span>) },
            { key: "order", header: "Order", cell: (r) => r.orderReference ?? <span className="text-muted">-</span>, mobile: false },
            { key: "date", header: "Updated", cell: (r) => <span className="text-xs text-muted">{dateTime(r.acceptedAt ?? r.sentAt ?? r.createdAt)}</span> },
          ]}
        />
      )}
    </>
  );
}
