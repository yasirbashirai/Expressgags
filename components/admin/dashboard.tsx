"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Briefcase, Inbox, Mail, TrendingUp } from "lucide-react";
import { api, dateTime, type QuoteSummary } from "./api";
import { AdminTitle, Panel } from "./admin-shell";
import { Badge, marketLabel, ROUTE_LABEL, ROUTE_STYLE, serviceLabel, STATUS_STYLE } from "./labels";

type Counts = {
  byStatus: Record<string, number>;
  byService: Record<string, number>;
  byMarket: Record<string, number>;
  byRoute: Record<string, number>;
  last30Days: number;
  careersNew: number;
  messagesNew: number;
};

export function Dashboard() {
  const [data, setData] = useState<{ counts: Counts; latest: QuoteSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ counts: Counts; latest: QuoteSummary[] }>("/dashboard").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-rose-700">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading dashboard…</p>;
  const { counts, latest } = data;
  const total = Object.values(counts.byStatus).reduce((a, b) => a + b, 0);

  const kpis = [
    { label: "New requests", value: counts.byStatus.NEW ?? 0, Icon: Inbox, href: "/admin/quotes?status=NEW", accent: true },
    { label: "Last 30 days", value: counts.last30Days, Icon: TrendingUp, href: "/admin/quotes" },
    { label: "Custom quotes", value: counts.byRoute.CUSTOM_QUOTE ?? 0, Icon: AlertTriangle, href: "/admin/quotes?route=CUSTOM_QUOTE" },
    { label: "New messages", value: counts.messagesNew, Icon: Mail, href: "/admin/messages" },
    { label: "New applications", value: counts.careersNew, Icon: Briefcase, href: "/admin/careers" },
  ];

  return (
    <>
      <AdminTitle title="Dashboard" sub={`${total} quote request${total === 1 ? "" : "s"} in total`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map(({ label, value, Icon, href, accent }) => (
          <Link key={label} href={href} className={`card group p-5 transition hover:shadow-[var(--shadow-lift)] ${accent ? "!border-orange/40 !bg-orange-50" : ""}`}>
            <Icon className={`h-5 w-5 ${accent ? "text-orange-700" : "text-navy-600"}`} aria-hidden />
            <p className="mt-4 font-display text-3xl font-extrabold text-navy">{value}</p>
            <p className="mt-1 text-xs font-medium text-muted">{label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel title="Latest requests" className="xl:col-span-2" action={<Link href="/admin/quotes" className="inline-flex items-center gap-1 text-sm font-semibold text-orange-700">View all <ArrowRight className="h-4 w-4" /></Link>}>
          {latest.length === 0 ? (
            <p className="text-sm text-muted">No quote requests yet. They will appear here as soon as the website receives one.</p>
          ) : (
            <ul className="divide-y divide-line">
              {latest.map((q) => (
                <li key={q.id}>
                  <Link href={`/admin/quotes/${q.id}`} className="flex flex-col gap-1 py-3 hover:bg-cloud/60 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-navy">{q.reference}</p>
                      <p className="truncate text-sm text-slate-ink">{q.customerName} · {serviceLabel(q.serviceType)} · {marketLabel(q.pickupMarket)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge className={ROUTE_STYLE[q.route]}>{ROUTE_LABEL[q.route]}</Badge>
                      <Badge className={STATUS_STYLE[q.status]}>{q.status}</Badge>
                      <span className="hidden text-xs text-muted md:inline">{dateTime(q.createdAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Breakdown title="By service" rows={counts.byService} label={serviceLabel} />
          <Breakdown title="By pickup market" rows={counts.byMarket} label={marketLabel} />
          <Panel title="Exceptions">
            <p className="text-sm text-muted">Late pickups, carrier delays, bag-count mismatches and other at-risk orders will surface here when dispatch and tracking go live (Phase 2).</p>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Breakdown({ title, rows, label }: { title: string; rows: Record<string, number>; label: (k: string) => string }) {
  const entries = Object.entries(rows).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <Panel title={title}>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">No data yet.</p>
      ) : (
        <ul className="space-y-3">
          {entries.map(([k, v]) => (
            <li key={k}>
              <div className="flex justify-between text-sm"><span className="text-slate-ink">{label(k)}</span><span className="font-semibold text-navy">{v}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-cloud"><div className="h-1.5 rounded-full bg-orange" style={{ width: `${(v / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
