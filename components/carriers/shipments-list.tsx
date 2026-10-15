"use client";

/**
 * Carrier shipments overview: nationwide orders awaiting labels (start rate shopping) and every
 * carrier label with status, carrier, tracking number and Express Bags order reference.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FlaskConical, PackagePlus, Search, Settings2 } from "lucide-react";
import { api, dateTime } from "@/components/admin/api";
import { AdminTitle, Panel } from "@/components/admin/admin-shell";
import { Badge } from "@/components/admin/labels";
import { DataTable, EmptyState, inputCls, Tabs } from "@/components/admin/ui";
import { LEVEL_LABEL, SHIPMENT_STATUS_LABEL, SHIPMENT_STATUS_STYLE } from "./labels";

type Shipment = {
  id: string;
  carrier: string;
  service: string;
  ebServiceLevel: string;
  trackingNumber: string | null;
  status: string;
  createdAt: string;
  order: { id: string; reference: string; customer: { name: string } };
};
type Awaiting = { id: string; reference: string; serviceDate: string; status: string; delivery: { address?: string }; customer: { name: string }; _count: { pieces: number } };

const TABS = [
  { value: "", label: "All" },
  { value: "LABELED", label: "Label ready" },
  { value: "TENDERED", label: "Handed over" },
  { value: "IN_TRANSIT", label: "In transit" },
  { value: "EXCEPTION", label: "Exceptions" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "VOIDED", label: "Voided" },
];

export function ShipmentsList() {
  const [status, setStatus] = useState("");
  const [carrier, setCarrier] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Shipment[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [awaiting, setAwaiting] = useState<Awaiting[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Deep link: /admin/shipments?q=<reference> (e.g. right after buying labels)
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) setQ(initial);
  }, []);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ ...(status ? { status } : {}), ...(carrier ? { carrier } : {}), ...(q ? { q } : {}) });
      const [list, wait] = await Promise.all([
        api<{ rows: Shipment[]; counts: Record<string, number> }>(`/carriers/shipments?${params}`),
        api<{ orders: Awaiting[] }>("/carriers/orders/awaiting"),
      ]);
      setRows(list.rows);
      setCounts(list.counts);
      setAwaiting(wait.orders);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [status, carrier, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <AdminTitle
        title="Carrier shipments"
        sub="Nationwide and international luggage shipping through Express Bags' own UPS, FedEx, DHL and USPS accounts."
        actions={
          <>
            <Link href="/admin/shipments/test-pricing" className="btn-ghost !px-4 !py-2"><FlaskConical className="h-4 w-4" aria-hidden /> Test pricing</Link>
            <Link href="/admin/shipments/settings" className="btn-ghost !px-4 !py-2"><Settings2 className="h-4 w-4" aria-hidden /> Carrier settings</Link>
          </>
        }
      />

      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      <Panel title={`Awaiting labels (${awaiting.length})`} className="mb-6">
        {awaiting.length === 0 ? (
          <p className="text-sm text-muted">No nationwide orders are waiting for carrier labels.</p>
        ) : (
          <ul className="divide-y divide-line">
            {awaiting.map((o) => (
              <li key={o.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-navy">{o.reference} <span className="font-normal text-muted">· {o.customer.name}</span></p>
                  <p className="truncate text-sm text-slate-ink">{o._count.pieces} piece(s) to {o.delivery?.address ?? "destination not set"} · ship {new Date(o.serviceDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                </div>
                <Link href={`/admin/shipments/order/${o.id}`} className="btn-primary shrink-0 !px-4 !py-2"><PackagePlus className="h-4 w-4" aria-hidden /> Rate shop &amp; buy labels</Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Tabs tabs={TABS.map((t) => ({ ...t, count: t.value ? counts[t.value] ?? 0 : total }))} value={status} onChange={setStatus} />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_200px]">
        <label className="relative block">
          <span className="sr-only">Search tracking number or order reference</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tracking number or EB reference" className={`${inputCls} pl-9`} />
        </label>
        <label>
          <span className="sr-only">Carrier</span>
          <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className={inputCls}>
            <option value="">All carriers</option>
            {["UPS", "FedEx", "DHL", "USPS"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {rows === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => (window.location.href = `/admin/shipments/${r.id}`)}
          empty={<EmptyState title="No carrier shipments yet" text="Labels appear here once they are purchased for a nationwide order." />}
          columns={[
            { key: "tracking", header: "Carrier tracking", cell: (r) => <span className="font-mono text-sm text-navy">{r.trackingNumber ?? "-"}</span> },
            { key: "order", header: "Express Bags order", cell: (r) => <span><span className="font-semibold">{r.order.reference}</span><span className="block text-xs text-muted">{r.order.customer.name}</span></span> },
            { key: "carrier", header: "Carrier", cell: (r) => <span>{r.carrier}<span className="block text-xs text-muted">{r.service}</span></span> },
            { key: "level", header: "Sold as", cell: (r) => LEVEL_LABEL[r.ebServiceLevel] ?? r.ebServiceLevel },
            { key: "status", header: "Status", cell: (r) => <Badge className={SHIPMENT_STATUS_STYLE[r.status]}>{SHIPMENT_STATUS_LABEL[r.status] ?? r.status}</Badge> },
            { key: "created", header: "Created", cell: (r) => <span className="text-sm text-muted">{dateTime(r.createdAt)}</span>, mobile: false },
          ]}
        />
      )}
    </>
  );
}
