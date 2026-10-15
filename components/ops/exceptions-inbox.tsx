"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Eye, RefreshCw, RotateCcw } from "lucide-react";
import { api, dateTime } from "@/components/admin/api";
import { AdminTitle } from "@/components/admin/admin-shell";
import { Badge, marketLabel } from "@/components/admin/labels";
import { EmptyState, Field, inputCls, Modal, StatCard, Tabs } from "@/components/admin/ui";
import { EXCEPTION_LABEL, ORDER_STATUS_LABEL, SEVERITY_STYLE, shortDate } from "./labels";

type Ex = {
  id: string;
  type: string;
  severity: string;
  status: string;
  detail: string | null;
  reportedBy: string | null;
  resolution: string | null;
  resolvedBy: string | null;
  createdAt: string;
  order: { id: string; reference: string; status: string; serviceDate: string; market: string; priority: string; customer: { name: string } };
};

const age = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
};

/** Exception inbox: the office works what needs action (severity → age), not every normal order. */
export function ExceptionsInbox() {
  const [tab, setTab] = useState<"open" | "RESOLVED" | "all">("open");
  const [data, setData] = useState<{ exceptions: Ex[]; openBySeverity: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Ex | null>(null);
  const [note, setNote] = useState("");
  const [sweepMsg, setSweepMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ exceptions: Ex[]; openBySeverity: Record<string, number> }>(`/orders/exceptions?status=${tab}`).then(setData).catch((e) => setError(e.message));
  }, [tab]);
  useEffect(load, [load]);

  async function update(id: string, status: string, resolution?: string) {
    try {
      await api(`/orders/exceptions/${id}`, { method: "PATCH", json: { status, resolution } });
      setResolving(null);
      setNote("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function sweep() {
    try {
      const r = await api<{ created: unknown[] }>("/orders/exceptions/sweep", { method: "POST" });
      setSweepMsg(r.created.length ? `${r.created.length} new exception${r.created.length > 1 ? "s" : ""} flagged.` : "Nothing new to flag.");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const sev = data?.openBySeverity ?? {};
  return (
    <>
      <AdminTitle title="Exceptions" sub="Orders at risk. Critical and oldest first." actions={<button onClick={sweep} className="btn-ghost !py-2"><RefreshCw className="h-4 w-4" aria-hidden /> Run late / stale check</button>} />
      {sweepMsg && <p className="mb-4 rounded-xl bg-navy-50 px-4 py-3 text-sm text-navy" role="status">{sweepMsg}</p>}
      {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</p>}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Critical" value={sev.CRITICAL ?? 0} tone={sev.CRITICAL ? "orange" : "white"} />
        <StatCard label="High" value={sev.HIGH ?? 0} />
        <StatCard label="Medium" value={sev.MEDIUM ?? 0} />
        <StatCard label="Low" value={sev.LOW ?? 0} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "open", label: "Needs action" }, { value: "RESOLVED", label: "Resolved" }, { value: "all", label: "All" }]} />
      {!data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : data.exceptions.length === 0 ? (
        <EmptyState title={tab === "open" ? "No open exceptions" : "Nothing here"} text={tab === "open" ? "Every order is on plan. New issues reported by drivers, staff or the automatic check appear here." : undefined} />
      ) : (
        <ul className="space-y-3">
          {data.exceptions.map((x) => (
            <li key={x.id} className={`card flex flex-col gap-3 p-4 md:flex-row md:items-center ${x.severity === "CRITICAL" && x.status !== "RESOLVED" ? "border-rose-300" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={SEVERITY_STYLE[x.severity]}>{x.severity}</Badge>
                  <span className="font-display font-bold text-navy">{EXCEPTION_LABEL[x.type] ?? x.type}</span>
                  <Link href={`/admin/orders/${x.order.id}`} className="font-mono text-xs font-semibold text-orange-700 hover:underline">{x.order.reference}</Link>
                  <span className="text-xs text-muted">{x.status === "RESOLVED" ? "resolved" : `${x.status.toLowerCase()} · open ${age(x.createdAt)}`}</span>
                </div>
                <p className="mt-1 text-sm text-slate-ink">{x.detail}</p>
                <p className="mt-1 text-xs text-muted">{x.order.customer.name} · {marketLabel(x.order.market)} · {shortDate(x.order.serviceDate)} · order {ORDER_STATUS_LABEL[x.order.status].toLowerCase()} · reported by {x.reportedBy} {dateTime(x.createdAt)}</p>
                {x.resolution && <p className="mt-1 text-xs text-emerald-800">Resolved by {x.resolvedBy}: {x.resolution}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                {x.status === "OPEN" && <button onClick={() => update(x.id, "ACKNOWLEDGED")} className="btn-ghost !px-3 !py-1.5 text-xs"><Eye className="h-3.5 w-3.5" aria-hidden /> Acknowledge</button>}
                {x.status !== "RESOLVED" && <button onClick={() => setResolving(x)} className="btn-navy !px-3 !py-1.5 text-xs"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Resolve</button>}
                {x.status === "RESOLVED" && <button onClick={() => update(x.id, "OPEN")} className="btn-ghost !px-3 !py-1.5 text-xs"><RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reopen</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!resolving} onClose={() => setResolving(null)} title="Resolve exception" footer={<><button className="btn-ghost" onClick={() => setResolving(null)}>Close</button><button className="btn-primary" disabled={note.trim().length < 3} onClick={() => resolving && update(resolving.id, "RESOLVED", note.trim())}>Mark resolved</button></>}>
        <p className="mb-3 text-sm text-slate-ink">{resolving && `${EXCEPTION_LABEL[resolving.type]} on ${resolving.order.reference}: ${resolving.detail}`}</p>
        <Field label="What was done (recorded on the order timeline)" htmlFor="ex-res"><textarea id="ex-res" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field>
      </Modal>
    </>
  );
}
