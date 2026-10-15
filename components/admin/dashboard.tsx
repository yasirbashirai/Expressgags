"use client";

/**
 * Owner & Operations Dashboard (requirement #1, form Q34/Q35).
 * Role-aware: DISPATCHER sees operations only; ACCOUNTING sees money and KPIs; OWNER/STAFF see everything.
 * Data: GET /v1/admin/reports/dashboard (+ /dashboard for inbox counts).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Briefcase, CalendarClock, CircleDollarSign, FilePlus2, Inbox, Mail, PackagePlus, Receipt, Route, Truck, Users } from "lucide-react";
import { api, dateTime, money } from "./api";
import { AdminTitle, Panel, useAdminUser } from "./admin-shell";
import { Badge, marketLabel, serviceLabel } from "./labels";
import { StatCard } from "./ui";
import { BarList, Meter, TrendChart } from "@/components/money/admin/charts";

type Dash = {
  role: string;
  generatedAt: string;
  ops: { todayOrders: { id: string; reference: string; status: string; serviceType: string; market: string; timeWindow: string | null; customer: string; assigned: boolean }[]; assignments: { drivers: number; helpers: number; trucks: number; unassignedToday: number } } | null;
  counts: { newQuotes: number; pendingOrders: number; awaitingAcceptance: number; activeDeliveries: number; openExceptions: number; todayJobs: number };
  activity: { at: string; kind: string; text: string; href: string }[];
  kpis: {
    windowDays: number; avgQuoteResponseHours: number | null; quoteToBookingPercent: number | null; quotationWinPercent: number | null;
    jobsByService: { key: string; jobs: number }[]; jobsByMarket: { key: string; jobs: number }[]; marginByService: { key: string; marginPercent: number | null; retailCents: number }[];
    repeatBookingPercent: number | null; podCompletionPercent: number | null; onTimePercent: number | null; deliveredCount: number;
  };
  targets: { key: string; label: string; value: number | null; target: number; unit: string; note?: string }[];
  money: null | {
    booked: Record<"day" | "week" | "month" | "year", number>;
    collected: Record<"day" | "week" | "month" | "year", number>;
    ordersThisMonth: number;
    outstanding: { totalCents: number; buckets: Record<string, number>; overdueInvoices: number; openInvoices: number };
    trend: { date: string; bookedCents: number; collectedCents: number }[];
  };
};
type Inbox = { counts: { careersNew: number; messagesNew: number } };

const STATUS_TEXT: Record<string, string> = { CONFIRMED: "Confirmed", DRIVER_ASSIGNED: "Assigned", EN_ROUTE: "En route", PICKED_UP: "Picked up", AT_FACILITY: "At facility", TRANSFERRED_TO_CARRIER: "With carrier", IN_TRANSIT: "In transit", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered" };
const pct = (v: number | null) => (v == null ? "-" : `${v}%`);

export function Dashboard() {
  const user = useAdminUser();
  const [d, setD] = useState<Dash | null>(null);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("month");

  useEffect(() => {
    api<Dash>("/reports/dashboard").then(setD).catch((e) => setError(e.message));
    api<Inbox>("/dashboard").then(setInbox).catch(() => undefined);
  }, []);

  if (error) return <p className="text-sm text-rose-700" role="alert">{error}</p>;
  if (!d) return <p className="text-sm text-muted" aria-live="polite">Loading dashboard…</p>;
  const showMoney = !!d.money;
  const showOps = !!d.ops;
  const hello = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <AdminTitle
        title={`${hello}${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        sub={`Express Bags operations · ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`}
        actions={
          <>
            {d.role !== "DISPATCHER" && d.role !== "ACCOUNTING" && <Link href="/admin/quotations/new" className="btn-primary !py-2"><FilePlus2 className="h-4 w-4" aria-hidden /> Create quotation</Link>}
            {showOps && <Link href="/admin/orders/new" className="btn-ghost !py-2"><PackagePlus className="h-4 w-4" aria-hidden /> Create order</Link>}
            {showOps && <Link href="/admin/dispatch" className="btn-ghost !py-2"><Route className="h-4 w-4" aria-hidden /> Assign driver</Link>}
            {showMoney && <Link href="/admin/billing?tab=invoices" className="btn-ghost !py-2"><Receipt className="h-4 w-4" aria-hidden /> Record payment</Link>}
          </>
        }
      />

      {/* Live operational overview */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi href="/admin/quotes?status=NEW" label="New quote requests" value={d.counts.newQuotes} Icon={Inbox} accent={d.counts.newQuotes > 0} />
        <Kpi href="/admin/orders?date=today" label="Jobs today" value={d.counts.todayJobs} Icon={CalendarClock} />
        <Kpi href="/admin/orders?status=CONFIRMED" label="Pending bookings" value={d.counts.pendingOrders} Icon={PackagePlus} hint={d.counts.awaitingAcceptance ? `${d.counts.awaitingAcceptance} quotations awaiting acceptance` : undefined} />
        <Kpi href="/admin/dispatch" label="Active deliveries" value={d.counts.activeDeliveries} Icon={Truck} />
        <Kpi href="/admin/exceptions" label="Open exceptions" value={d.counts.openExceptions} Icon={AlertTriangle} accent={d.counts.openExceptions > 0} />
        {inbox ? <Kpi href="/admin/messages" label="New messages & applications" value={inbox.counts.messagesNew + inbox.counts.careersNew} Icon={Mail} hint={`${inbox.counts.messagesNew} messages · ${inbox.counts.careersNew} applications`} /> : <Kpi href="/admin/careers" label="Applications" value={0} Icon={Briefcase} />}
      </div>

      {showMoney && d.money && (
        <section className="mt-6 grid gap-6 xl:grid-cols-3" aria-label="Revenue">
          <div className="card min-w-0 p-5 xl:col-span-2 md:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-base font-bold text-navy">Revenue</h2>
              <div role="tablist" className="flex rounded-full border border-line p-0.5 text-xs">
                {(["day", "week", "month", "year"] as const).map((p) => (
                  <button key={p} role="tab" aria-selected={period === p} onClick={() => setPeriod(p)} className={`rounded-full px-3 py-1 font-medium capitalize ${period === p ? "bg-navy text-white" : "text-slate-ink"}`}>{p === "day" ? "Today" : `This ${p}`}</button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Booked" value={money(d.money.booked[period])} hint="Order value, excluding cancellations" tone="navy" Icon={CircleDollarSign} />
              <StatCard label="Collected" value={money(d.money.collected[period])} hint="Payments received, less refunds" />
              <StatCard label="Outstanding" value={money(d.money.outstanding.totalCents)} hint={`${d.money.outstanding.openInvoices} open · ${d.money.outstanding.overdueInvoices} past due`} tone={d.money.outstanding.overdueInvoices ? "orange" : "white"} />
            </div>
            <div className="mt-6">
              <TrendChart
                title="Last 30 days"
                data={d.money.trend.map((t) => ({ date: t.date, booked: t.bookedCents, collected: t.collectedCents }))}
                series={[{ key: "booked", label: "Booked" }, { key: "collected", label: "Collected" }]}
              />
            </div>
          </div>
          <Panel title="Receivables by age" action={<Link href="/admin/billing?tab=aging" className="text-sm font-semibold text-orange-700">Aging</Link>}>
            <BarList
              label="Outstanding balance by age"
              format={money}
              rows={[["current", "Not yet due"], ["1-30", "1–30 days past due"], ["31-60", "31–60 days"], ["61-90", "61–90 days"], ["90+", "Over 90 days"]].map(([k, l]) => ({ key: k, label: l, value: d.money!.outstanding.buckets[k] ?? 0 }))}
            />
          </Panel>
        </section>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {showOps && d.ops && (
          <Panel title="Today's jobs" className="xl:col-span-2" action={<Link href="/admin/dispatch" className="inline-flex items-center gap-1 text-sm font-semibold text-orange-700">Dispatch board <ArrowRight className="h-4 w-4" aria-hidden /></Link>}>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Mini Icon={Users} label="Drivers out" value={d.ops.assignments.drivers} />
              <Mini Icon={Users} label="Helpers" value={d.ops.assignments.helpers} />
              <Mini Icon={Truck} label="Trucks in use" value={d.ops.assignments.trucks} />
              <Mini Icon={AlertTriangle} label="Unassigned" value={d.ops.assignments.unassignedToday} warn={d.ops.assignments.unassignedToday > 0} />
            </div>
            {d.ops.todayOrders.length === 0 ? (
              <p className="text-sm text-muted">No jobs scheduled for today.</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.ops.todayOrders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-navy-50/40">
                      <span className="min-w-0">
                        <span className="font-mono text-xs font-semibold text-navy">{o.reference}</span>
                        <span className="block truncate text-sm text-charcoal">{o.customer} · {serviceLabel(o.serviceType)} · {marketLabel(o.market)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {o.timeWindow && <span className="text-xs capitalize text-muted">{o.timeWindow.replace(/-/g, " ")}</span>}
                        {!o.assigned && <Badge className="bg-orange-50 text-orange-700 ring-orange-200">No driver</Badge>}
                        <Badge className="bg-navy-50 text-navy">{STATUS_TEXT[o.status] ?? o.status}</Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
        <Panel title="Customer activity" className={showOps ? "" : "xl:col-span-3"}>
          {d.activity.length === 0 ? (
            <p className="text-sm text-muted">Activity appears here as requests, bookings and payments come in.</p>
          ) : (
            <ol className="space-y-3">
              {d.activity.map((a, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.kind === "payment" ? "bg-emerald-600" : a.kind === "quote" ? "bg-orange" : "bg-navy-600"}`} aria-hidden />
                  <span className="min-w-0">
                    <Link href={a.href} className="text-charcoal hover:underline">{a.text}</Link>
                    <span className="block text-xs text-muted">{dateTime(a.at)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <section className="mt-6" aria-label="Business performance">
        <h2 className="mb-3 font-display text-lg font-bold text-navy">Business performance <span className="text-sm font-normal text-muted">· last {d.kpis.windowDays} days</span></h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Quote response" value={d.kpis.avgQuoteResponseHours == null ? "-" : `${d.kpis.avgQuoteResponseHours}h`} hint="Request → quotation sent" />
          <StatCard label="Quote → booking" value={pct(d.kpis.quoteToBookingPercent)} hint="Requests that became orders" />
          <StatCard label="Quotation win rate" value={pct(d.kpis.quotationWinPercent)} hint="Sent quotations accepted" />
          <StatCard label="Repeat bookings" value={pct(d.kpis.repeatBookingPercent)} hint="Customers with 2+ orders" />
          <StatCard label="Proof of delivery" value={pct(d.kpis.podCompletionPercent)} hint={`${d.kpis.deliveredCount} delivered`} />
          <StatCard label="On time" value={pct(d.kpis.onTimePercent)} hint="Within the confirmed window" />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Panel title="Jobs by service">
            <BarList label="Jobs by service" rows={d.kpis.jobsByService.map((r) => ({ key: r.key, label: serviceLabel(r.key), value: r.jobs }))} />
          </Panel>
          <Panel title="Jobs by market">
            <BarList label="Jobs by market" rows={d.kpis.jobsByMarket.map((r) => ({ key: r.key, label: marketLabel(r.key), value: r.jobs }))} />
          </Panel>
          {showMoney ? (
            <Panel title="Gross margin by service" action={<Link href="/admin/reports" className="text-sm font-semibold text-orange-700">Reports</Link>}>
              <BarList label="Gross margin by service" format={(v) => `${v}%`} rows={d.kpis.marginByService.filter((r) => r.marginPercent != null).map((r) => ({ key: r.key, label: serviceLabel(r.key), value: r.marginPercent!, hint: money(r.retailCents) }))} />
            </Panel>
          ) : (
            <Panel title="Six-month targets">
              <TargetList targets={d.targets} />
            </Panel>
          )}
        </div>
        {showMoney && (
          <Panel title="Six-month definition of success" className="mt-6">
            <p className="mb-4 text-xs text-muted">Proposed targets from the requirements form (Q34). The owner can adjust them before launch.</p>
            <TargetList targets={d.targets} />
          </Panel>
        )}
      </section>
    </>
  );
}

function TargetList({ targets }: { targets: Dash["targets"] }) {
  return <div className="grid gap-5 md:grid-cols-2">{targets.map((t) => <Meter key={t.key} label={t.label} value={t.value} target={t.target} unit={t.unit} note={t.note} />)}</div>;
}

function Kpi({ href, label, value, Icon, accent, hint }: { href: string; label: string; value: number; Icon: typeof Inbox; accent?: boolean; hint?: string }) {
  return (
    <Link href={href} className={`card group p-5 transition hover:shadow-[var(--shadow-lift)] ${accent ? "!border-orange/40 !bg-orange-50" : ""}`}>
      <Icon className={`h-5 w-5 ${accent ? "text-orange-700" : "text-navy-600"}`} aria-hidden />
      <p className="mt-4 font-display text-3xl font-extrabold text-navy">{value}</p>
      <p className="mt-1 text-xs font-medium text-muted">{label}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-ink">{hint}</p>}
    </Link>
  );
}

function Mini({ Icon, label, value, warn }: { Icon: typeof Inbox; label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${warn ? "border-orange/40 bg-orange-50" : "border-line bg-cloud"}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted"><Icon className="h-3.5 w-3.5" aria-hidden /> {label}</p>
      <p className="mt-1 font-display text-xl font-bold text-navy">{value}</p>
    </div>
  );
}
