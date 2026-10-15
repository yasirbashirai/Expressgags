"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Search } from "lucide-react";
import { markets } from "@/content/site";
import { SERVICE_TYPES } from "@/lib/quote-schema";
import { api, money } from "@/components/admin/api";
import { AdminTitle } from "@/components/admin/admin-shell";
import { Badge, marketLabel, serviceLabel } from "@/components/admin/labels";
import { inputCls } from "@/components/admin/ui";
import { ORDER_STATUS_LABEL, ORDER_STATUS_STYLE, PRIORITY_STYLE, shortDate, stopText, TIME_WINDOW_LABEL } from "./labels";

type Row = {
  id: string;
  reference: string;
  status: string;
  serviceType: string;
  market: string;
  priority: string;
  paymentStatus: string;
  serviceDate: string;
  timeWindow: string | null;
  pickup: unknown;
  delivery: unknown;
  guestName: string | null;
  customer: { name: string; email: string };
  company: { name: string } | null;
  pieces: number;
  openExceptions: number;
  crew: string[];
  retailCents: number | null;
};
type ListResponse = { total: number; page: number; pageSize: number; statusCounts: Record<string, number>; orders: Row[] };

const FILTERS = ["q", "status", "market", "service", "priority", "paymentStatus", "from", "to", "page"] as const;
const QUICK = [
  { value: "open", label: "Open" },
  { value: "active", label: "On the road" },
  { value: "CONFIRMED", label: "Needs a driver" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "", label: "All" },
];

/** Orders list: quick status tabs, filters (market, service, priority, payment, dates) and search by reference / name / piece ID. */
export function OrdersList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(params.get("q") ?? "");

  const query = useMemo(() => {
    const qs = new URLSearchParams();
    for (const k of FILTERS) {
      const v = params.get(k);
      if (v) qs.set(k, v);
    }
    if (!params.has("status")) qs.set("status", "open");
    return qs.toString();
  }, [params]);

  useEffect(() => {
    setData(null);
    api<ListResponse>(`/orders?${query}`).then(setData).catch((e) => setError(e.message));
  }, [query]);

  function setFilter(key: string, value: string) {
    const qs = new URLSearchParams(params.toString());
    if (value || key === "status") qs.set(key, value);
    else qs.delete(key);
    if (key !== "page") qs.delete("page");
    router.replace(`${pathname}?${qs}`);
  }

  const status = params.has("status") ? params.get("status")! : "open";
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const sel = `${inputCls} !py-2`;

  return (
    <>
      <AdminTitle
        title="Orders"
        sub={data ? `${data.total} order${data.total === 1 ? "" : "s"} match` : "Loading…"}
        actions={
          <>
            <Link href="/admin/dispatch" className="btn-ghost !py-2">Dispatch board</Link>
            <Link href="/admin/orders/new" className="btn-primary !py-2"><Plus className="h-4 w-4" aria-hidden /> New order</Link>
          </>
        }
      />

      <div role="tablist" aria-label="Order status" className="mb-4 flex gap-1 overflow-x-auto rounded-full border border-line bg-white p-1">
        {QUICK.map((t) => (
          <button key={t.label} role="tab" aria-selected={status === t.value} onClick={() => setFilter("status", t.value)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition ${status === t.value ? "bg-navy text-white" : "text-slate-ink hover:bg-cloud"}`}>
            {t.label}
            {data && /^[A-Z_]+$/.test(t.value) && <span className="ml-1.5 font-normal">{data.statusCounts[t.value] ?? 0}</span>}
          </button>
        ))}
      </div>

      <div className="card mb-4 grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-6">
        <form className="relative md:col-span-2" onSubmit={(e) => { e.preventDefault(); setFilter("q", search.trim()); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input aria-label="Search orders" placeholder="Reference, piece ID, guest, customer, PO" value={search} onChange={(e) => setSearch(e.target.value)} className={`${sel} pl-9`} />
        </form>
        <select aria-label="Market" className={sel} value={params.get("market") ?? ""} onChange={(e) => setFilter("market", e.target.value)}>
          <option value="">All markets</option>
          {markets.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
          <option value="other-florida">Other Florida route</option>
        </select>
        <select aria-label="Service" className={sel} value={params.get("service") ?? ""} onChange={(e) => setFilter("service", e.target.value)}>
          <option value="">All services</option>
          {SERVICE_TYPES.map((s) => <option key={s} value={s}>{serviceLabel(s)}</option>)}
        </select>
        <select aria-label="Priority" className={sel} value={params.get("priority") ?? ""} onChange={(e) => setFilter("priority", e.target.value)}>
          <option value="">Any priority</option>
          <option value="RUSH">Rush</option>
          <option value="VIP">VIP</option>
          <option value="NORMAL">Normal</option>
        </select>
        <select aria-label="Payment" className={sel} value={params.get("paymentStatus") ?? ""} onChange={(e) => setFilter("paymentStatus", e.target.value)}>
          <option value="">Any payment status</option>
          {["UNPAID", "DEPOSIT_PAID", "PAID", "INVOICED", "ACCOUNT", "REFUNDED"].map((s) => <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-muted md:col-span-1 xl:col-span-3">Service from
          <input type="date" className={`${sel} flex-1`} value={params.get("from") ?? ""} onChange={(e) => setFilter("from", e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted md:col-span-1 xl:col-span-3">to
          <input type="date" className={`${sel} flex-1`} value={params.get("to") ?? ""} onChange={(e) => setFilter("to", e.target.value)} />
        </label>
      </div>

      {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-cloud text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Order</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Route</th>
              <th className="px-4 py-3 font-semibold">Service date</th>
              <th className="px-4 py-3 font-semibold">Pcs</th>
              <th className="px-4 py-3 font-semibold">Crew</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data?.orders.map((o) => (
              <tr key={o.id} className="cursor-pointer hover:bg-cloud/60" onClick={() => router.push(`/admin/orders/${o.id}`)}>
                <td className="px-4 py-3">
                  <Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold text-navy hover:underline">{o.reference}</Link>
                  <p className="text-xs text-muted">{serviceLabel(o.serviceType)} · {marketLabel(o.market)}</p>
                  <div className="mt-1 flex gap-1">
                    {o.priority !== "NORMAL" && <Badge className={PRIORITY_STYLE[o.priority]}>{o.priority}</Badge>}
                    {o.openExceptions > 0 && <Badge className="bg-rose-50 text-rose-800 ring-rose-200"><AlertTriangle className="mr-1 h-3 w-3" aria-hidden />{o.openExceptions}</Badge>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-charcoal">{o.company?.name ?? o.customer.name}</p>
                  <p className="text-xs text-muted">{o.guestName ? `Guest: ${o.guestName}` : o.customer.email}</p>
                </td>
                <td className="max-w-[280px] px-4 py-3 text-xs text-slate-ink">
                  <p className="truncate"><span className="font-semibold text-muted">From </span>{stopText(o.pickup)}</p>
                  <p className="truncate"><span className="font-semibold text-muted">To </span>{stopText(o.delivery)}</p>
                </td>
                <td className="px-4 py-3 text-slate-ink">{shortDate(o.serviceDate)}<p className="text-xs text-muted">{o.timeWindow ? TIME_WINDOW_LABEL[o.timeWindow] ?? o.timeWindow : ""}</p></td>
                <td className="px-4 py-3 text-slate-ink">{o.pieces}</td>
                <td className="px-4 py-3 text-xs text-slate-ink">{o.crew.length ? o.crew.join(", ") : <span className="text-orange-700">Unassigned</span>}</td>
                <td className="px-4 py-3"><Badge className={ORDER_STATUS_STYLE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>{o.retailCents != null && <p className="mt-1 text-xs text-muted">{money(o.retailCents)}</p>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.orders.length === 0 && <p className="p-8 text-center text-sm text-muted">No orders match these filters.</p>}
      </div>

      <ul className="space-y-3 md:hidden">
        {data?.orders.map((o) => (
          <li key={o.id}>
            <Link href={`/admin/orders/${o.id}`} className="card block p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono text-sm font-semibold text-navy">{o.reference}</p>
                <Badge className={ORDER_STATUS_STYLE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
              </div>
              <p className="mt-1 text-sm font-medium text-charcoal">{o.company?.name ?? o.customer.name}</p>
              <p className="text-xs text-muted">{shortDate(o.serviceDate)} · {o.pieces} pcs · {marketLabel(o.market)}</p>
              <p className="mt-1 truncate text-xs text-slate-ink">To {stopText(o.delivery)}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {o.priority !== "NORMAL" && <Badge className={PRIORITY_STYLE[o.priority]}>{o.priority}</Badge>}
                {o.openExceptions > 0 && <Badge className="bg-rose-50 text-rose-800 ring-rose-200">{o.openExceptions} exception{o.openExceptions > 1 ? "s" : ""}</Badge>}
                {!o.crew.length && <Badge className="bg-orange-50 text-orange-700 ring-orange-200">Unassigned</Badge>}
              </div>
            </Link>
          </li>
        ))}
        {data && data.orders.length === 0 && <li className="card p-6 text-center text-sm text-muted">No orders match these filters.</li>}
      </ul>

      {data && pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button className="btn-ghost !py-2" disabled={data.page <= 1} onClick={() => setFilter("page", String(data.page - 1))}>Previous</button>
          <span className="text-muted">Page {data.page} of {pages}</span>
          <button className="btn-ghost !py-2" disabled={data.page >= pages} onClick={() => setFilter("page", String(data.page + 1))}>Next</button>
        </div>
      )}
    </>
  );
}
