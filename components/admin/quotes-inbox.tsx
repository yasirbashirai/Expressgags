"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { markets } from "@/content/site";
import { SERVICE_TYPES } from "@/lib/quote-schema";
import { api, API_URL, dateTime, type QuoteSummary } from "./api";
import { AdminTitle, useAdminUser } from "./admin-shell";
import { Badge, marketLabel, ROUTE_LABEL, ROUTE_STYLE, serviceLabel, STATUS_STYLE } from "./labels";

const STATUSES = ["NEW", "REVIEWING", "QUOTED", "WON", "LOST", "ARCHIVED"];
const FILTERS = ["status", "route", "service", "market", "from", "to", "q", "page"] as const;

export function QuotesInbox() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const user = useAdminUser();
  const [data, setData] = useState<{ total: number; page: number; pageSize: number; quotes: QuoteSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(params.get("q") ?? "");

  const query = useMemo(() => {
    const qs = new URLSearchParams();
    for (const k of FILTERS) {
      const v = params.get(k);
      if (v) qs.set(k, v);
    }
    return qs.toString();
  }, [params]);

  useEffect(() => {
    setData(null);
    api<{ total: number; page: number; pageSize: number; quotes: QuoteSummary[] }>(`/quotes${query ? `?${query}` : ""}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [query]);

  function setFilter(key: string, value: string) {
    const qs = new URLSearchParams(params.toString());
    if (value) qs.set(key, value);
    else qs.delete(key);
    if (key !== "page") qs.delete("page");
    router.replace(`${pathname}${qs.toString() ? `?${qs}` : ""}`);
  }

  const select = "rounded-xl border border-line bg-white px-3 py-2 text-sm text-slate-ink focus:border-navy focus:outline-none";
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <AdminTitle
        title="Quote requests"
        sub={data ? `${data.total} matching request${data.total === 1 ? "" : "s"}` : "Loading…"}
        actions={
          user?.role !== "DISPATCHER" && (
            <a href={`${API_URL}/v1/admin/quotes/export.csv${query ? `?${query}` : ""}`} className="btn-ghost !py-2">
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </a>
          )
        }
      />

      <div className="card mb-4 grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-6">
        <form className="relative md:col-span-2" onSubmit={(e) => { e.preventDefault(); setFilter("q", search.trim()); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input aria-label="Search by reference, name, email or company" placeholder="Reference, name, email, company" value={search} onChange={(e) => setSearch(e.target.value)} className={`${select} w-full pl-9`} />
        </form>
        <select aria-label="Status" className={select} value={params.get("status") ?? ""} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select aria-label="Route" className={select} value={params.get("route") ?? ""} onChange={(e) => setFilter("route", e.target.value)}>
          <option value="">All routes</option>
          {Object.entries(ROUTE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Service" className={select} value={params.get("service") ?? ""} onChange={(e) => setFilter("service", e.target.value)}>
          <option value="">All services</option>
          {SERVICE_TYPES.map((s) => <option key={s} value={s}>{serviceLabel(s)}</option>)}
        </select>
        <select aria-label="Pickup market" className={select} value={params.get("market") ?? ""} onChange={(e) => setFilter("market", e.target.value)}>
          <option value="">All markets</option>
          {markets.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
          <option value="other-florida">Other Florida route</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-muted md:col-span-1 xl:col-span-3">From
          <input type="date" className={`${select} flex-1`} value={params.get("from") ?? ""} onChange={(e) => setFilter("from", e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted md:col-span-1 xl:col-span-3">To
          <input type="date" className={`${select} flex-1`} value={params.get("to") ?? ""} onChange={(e) => setFilter("to", e.target.value)} />
        </label>
      </div>

      {error && <p className="mb-4 text-sm text-rose-700">{error}</p>}

      {/* Desktop table */}
      <div className="card hidden overflow-hidden md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-cloud text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Reference</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Service</th>
              <th className="px-4 py-3 font-semibold">Market</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Pcs</th>
              <th className="px-4 py-3 font-semibold">Route</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data?.quotes.map((q) => (
              <tr key={q.id} className="cursor-pointer hover:bg-cloud/60" onClick={() => router.push(`/admin/quotes/${q.id}`)}>
                <td className="px-4 py-3"><Link href={`/admin/quotes/${q.id}`} className="font-mono font-semibold text-navy hover:underline">{q.reference}</Link><p className="text-xs text-muted">{dateTime(q.createdAt)}</p></td>
                <td className="px-4 py-3"><p className="font-medium text-charcoal">{q.customerName}</p><p className="text-xs text-muted">{q.customerEmail}</p></td>
                <td className="px-4 py-3 text-slate-ink">{serviceLabel(q.serviceType)}</td>
                <td className="px-4 py-3 text-slate-ink">{marketLabel(q.pickupMarket)}</td>
                <td className="px-4 py-3 text-slate-ink">{q.serviceDate}</td>
                <td className="px-4 py-3 text-slate-ink">{q.totalPieces}</td>
                <td className="px-4 py-3"><Badge className={ROUTE_STYLE[q.route]}>{ROUTE_LABEL[q.route]}</Badge></td>
                <td className="px-4 py-3"><Badge className={STATUS_STYLE[q.status]}>{q.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.quotes.length === 0 && <p className="p-6 text-center text-sm text-muted">No requests match these filters.</p>}
      </div>

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {data?.quotes.map((q) => (
          <li key={q.id}>
            <Link href={`/admin/quotes/${q.id}`} className="card block p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono text-sm font-semibold text-navy">{q.reference}</p>
                <Badge className={STATUS_STYLE[q.status]}>{q.status}</Badge>
              </div>
              <p className="mt-1 text-sm font-medium text-charcoal">{q.customerName}</p>
              <p className="text-xs text-muted">{serviceLabel(q.serviceType)} · {marketLabel(q.pickupMarket)} · {q.totalPieces} pcs · {q.serviceDate}</p>
              <div className="mt-2"><Badge className={ROUTE_STYLE[q.route]}>{ROUTE_LABEL[q.route]}</Badge></div>
            </Link>
          </li>
        ))}
        {data && data.quotes.length === 0 && <li className="card p-6 text-center text-sm text-muted">No requests match these filters.</li>}
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
