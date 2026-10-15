"use client";

/** Invoice detail (admin): lines, payments, send/void, PDF, manual payment, refunds, QuickBooks status + retry. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FileDown, RefreshCw, Send } from "lucide-react";
import { api, API_URL, dateTime, money } from "@/components/admin/api";
import { AdminTitle, Panel, useAdminUser } from "@/components/admin/admin-shell";
import { Badge } from "@/components/admin/labels";
import { ConfirmButton, Field, inputCls, Modal } from "@/components/admin/ui";
import { INVOICE_STATUS_STYLE, SYNC_STYLE } from "./billing-console";

type Inv = {
  id: string; number: string; status: string; issuedAt: string | null; dueAt: string | null; poNumber: string | null; costCenter: string | null; notes: string | null;
  subtotalCents: number; taxCents: number; totalCents: number; paidCents: number; publicToken: string; qboSyncStatus: string; qboError: string | null;
  customer: { name: string; email: string; company: { name: string } | null }; company: { name: string; billingEmail: string | null } | null;
  lines: { id: string; description: string; quantity: number; unitCents: number; totalCents: number; order: { id: string; reference: string; status: string } | null }[];
  payments: { id: string; method: string; kind: string; status: string; amountCents: number; note: string | null; recordedBy: string | null; createdAt: string }[];
};

export function InvoiceDetail({ id }: { id: string }) {
  const user = useAdminUser();
  const canMoney = user?.role === "OWNER" || user?.role === "ACCOUNTING";
  const [d, setD] = useState<{ invoice: Inv; syncLog: { id: string; status: string; error: string | null; createdAt: string }[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ method: "check", amount: "", note: "" });
  const load = useCallback(() => api<{ invoice: Inv; syncLog: { id: string; status: string; error: string | null; createdAt: string }[] }>(`/billing/invoices/${id}`).then(setD).catch((e) => setMsg(e.message)), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  if (!d) return <p className="text-sm text-muted">{msg ?? "Loading invoice…"}</p>;
  const inv = d.invoice;
  const balance = inv.totalCents - inv.paidCents;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");

  return (
    <>
      <AdminTitle
        title={`Invoice ${inv.number}`}
        sub={`${inv.company?.name ?? inv.customer.name} · ${inv.company?.billingEmail ?? inv.customer.email}`}
        actions={
          <>
            <Badge className={INVOICE_STATUS_STYLE[inv.status]}>{inv.status}</Badge>
            <a className="btn-ghost !py-2" target="_blank" rel="noopener noreferrer" href={`${API_URL}/v1/admin/billing/invoices/${inv.id}/pdf`}><FileDown className="h-4 w-4" aria-hidden /> PDF</a>
            {inv.status !== "VOID" && inv.status !== "PAID" && (
              <button className="btn-primary !py-2" onClick={() => act(() => api(`/billing/invoices/${inv.id}/send`, { method: "POST", json: {} }), inv.status === "DRAFT" ? "Invoice sent." : "Invoice re-sent.")}>
                <Send className="h-4 w-4" aria-hidden /> {inv.status === "DRAFT" ? "Send" : "Resend"}
              </button>
            )}
          </>
        }
      />
      {msg && <p className="mb-4 rounded-xl bg-navy-50 p-3 text-sm text-navy" role="status">{msg}</p>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Lines">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wider text-muted"><th className="py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Rate</th><th className="py-2 text-right">Amount</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {inv.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 pr-3">{l.description}{l.order && <Link href={`/admin/orders/${l.order.id}`} className="ml-2 text-xs font-semibold text-orange-700">open order</Link>}</td>
                      <td className="py-2.5 text-right">{l.quantity}</td>
                      <td className="py-2.5 text-right">{money(l.unitCents)}</td>
                      <td className="py-2.5 text-right font-medium text-navy">{money(l.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Total</dt><dd className="font-medium text-navy">{money(inv.totalCents)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd className="font-medium text-emerald-700">{money(inv.paidCents)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1"><dt className="font-semibold text-navy">Balance</dt><dd className="font-display text-lg font-bold text-navy">{money(balance)}</dd></div>
            </dl>
          </Panel>
          <Panel title="Payments" action={canMoney && balance > 0 && inv.status !== "VOID" ? <button className="btn-ghost !py-1.5 text-xs" onClick={() => setPayOpen(true)}>Record payment</button> : undefined}>
            {inv.payments.length === 0 ? <p className="text-sm text-muted">No payments yet.</p> : (
              <ul className="divide-y divide-line text-sm">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span><span className="capitalize">{p.kind.toLowerCase()}</span> · {p.method} · {p.status.toLowerCase()}<span className="block text-xs text-muted">{dateTime(p.createdAt)}{p.recordedBy ? ` · ${p.recordedBy}` : ""}{p.note ? ` · ${p.note}` : ""}</span></span>
                    <span className="flex items-center gap-3">
                      <span className={`font-semibold ${p.kind === "REFUND" ? "text-rose-700" : "text-navy"}`}>{p.kind === "REFUND" ? "-" : ""}{money(p.amountCents)}</span>
                      {canMoney && p.status === "SUCCEEDED" && p.kind !== "REFUND" && (
                        <ConfirmButton className="text-xs font-semibold text-orange-700" confirmText="Confirm full refund" onConfirm={() => act(() => api(`/billing/payments/${p.id}/refund`, { method: "POST", json: {} }), "Refund recorded.")}>Refund</ConfirmButton>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <aside className="space-y-4">
          <Panel title="Details">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Issued</dt><dd>{inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : "Not sent"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Due</dt><dd>{inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : "-"}</dd></div>
              {inv.poNumber && <div className="flex justify-between"><dt className="text-muted">PO</dt><dd>{inv.poNumber}</dd></div>}
              {inv.costCenter && <div className="flex justify-between"><dt className="text-muted">Cost center</dt><dd>{inv.costCenter}</dd></div>}
            </dl>
            {inv.status !== "DRAFT" && <p className="mt-3 break-all rounded-lg bg-cloud p-2 text-xs text-slate-ink">Customer link: {site}/invoice/{inv.publicToken}</p>}
          </Panel>
          <Panel title="QuickBooks">
            <Badge className={SYNC_STYLE[inv.qboSyncStatus]}>{inv.qboSyncStatus.toLowerCase()}</Badge>
            {inv.qboError && <p className="mt-2 text-xs text-rose-700">{inv.qboError}</p>}
            {inv.status !== "DRAFT" && inv.status !== "VOID" && (
              <button className="btn-ghost mt-3 w-full !py-2 text-sm" onClick={() => act(() => api(`/billing/invoices/${inv.id}/sync`, { method: "POST" }), "Sync attempted.")}><RefreshCw className="h-4 w-4" aria-hidden /> Retry sync</button>
            )}
            {d.syncLog.length > 0 && <ul className="mt-3 space-y-1 text-xs text-muted">{d.syncLog.map((s) => <li key={s.id}>{dateTime(s.createdAt)} · {s.status.toLowerCase()}{s.error ? ` · ${s.error.slice(0, 80)}` : ""}</li>)}</ul>}
          </Panel>
          {canMoney && inv.status !== "VOID" && inv.status !== "PAID" && (
            <ConfirmButton className="btn-ghost w-full !text-rose-700" confirmText="Click again to void" onConfirm={() => act(() => api(`/billing/invoices/${inv.id}/void`, { method: "POST" }), "Invoice voided.")}>Void invoice</ConfirmButton>
          )}
          <Link href="/admin/billing" className="inline-block text-sm font-medium text-orange-700">← All invoices</Link>
        </aside>
      </div>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record a payment"
        footer={<>
          <button className="btn-ghost" onClick={() => setPayOpen(false)}>Cancel</button>
          <button className="btn-primary" onClick={() => act(async () => { await api("/billing/payments", { method: "POST", json: { method: pay.method, amountCents: Math.round(Number(pay.amount) * 100), invoiceId: inv.id, note: pay.note || undefined } }); setPayOpen(false); }, "Payment recorded.")}>Save payment</button>
        </>}
      >
        <div className="grid gap-3">
          <Field label="Method" htmlFor="pm-m"><select id="pm-m" className={inputCls} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="check">Check</option><option value="ach">ACH / bank transfer</option><option value="cash">Cash</option><option value="account">Account credit</option></select></Field>
          <Field label="Amount ($)" htmlFor="pm-a" hint={`Balance ${money(balance)}`}><input id="pm-a" inputMode="decimal" className={inputCls} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
          <Field label="Reference / note" htmlFor="pm-n"><input id="pm-n" className={inputCls} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} placeholder="Check #, ACH trace…" /></Field>
        </div>
      </Modal>
    </>
  );
}
