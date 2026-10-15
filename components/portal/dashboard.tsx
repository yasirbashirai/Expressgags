"use client";

/** Account overview: live orders, quotations awaiting approval, open invoices, recent requests, quick actions. */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, ConciergeBell, FileText, Package, PackageSearch, Plus, Receipt, RotateCcw } from "lucide-react";
import { SERVICE_LABELS, type ServiceType } from "@/lib/quote-schema";
import { canUseConcierge, dateOnly, money, placeLabel, portal } from "./api";
import { useMe } from "./portal-shell";
import { Alert, Card, Empty, Loading, StatusPill } from "./ui";

type Dash = {
  stats: { activeOrders: number; openQuotations: number; openInvoices: number; completedOrders: number };
  activeOrders: { id: string; reference: string; status: string; statusLabel: string; serviceType: string; serviceDate: string; timeWindow: string | null; pickup: unknown; delivery: unknown; guestName: string | null }[];
  quotes: { id: string; reference: string; serviceType: string; status: string; serviceDate: string; createdAt: string }[];
  quotations: { id: string; reference: string; title: string; totalCents: number; depositCents: number; validUntil: string | null; publicToken: string }[];
  invoices: { id: string; number: string; status: string; totalCents: number; paidCents: number; dueAt: string | null; publicToken: string }[];
};

export const serviceName = (s: string) => SERVICE_LABELS[s as ServiceType] ?? s;

export function AccountDashboard() {
  const { me } = useMe();
  const welcome = useSearchParams().get("welcome") === "1";
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    portal<Dash>("/dashboard").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Loading />;

  const stats = [
    { label: "Active orders", value: data.stats.activeOrders, Icon: Package, href: "/account/orders?status=active" },
    { label: "Quotations to review", value: data.stats.openQuotations, Icon: FileText, href: "/account/quotes" },
    { label: "Open invoices", value: data.stats.openInvoices, Icon: Receipt, href: "/account/invoices" },
    { label: "Completed deliveries", value: data.stats.completedOrders, Icon: PackageSearch, href: "/account/orders?status=completed" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Account overview</h1>
      {welcome && <Alert tone="success">Your account is active. Requests and orders made with {me.email} appear here automatically.</Alert>}
      {me.company?.accountStatus === "PENDING" && <Alert tone="info">Your business account application for {me.company.name} is under review. We usually reply within one business day.</Alert>}

      <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map(({ label, value, Icon, href }) => (
          <li key={label}>
            <Link href={href} className="group block rounded-[1.25rem] border border-line bg-white p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-orange/40">
              <Icon className="h-5 w-5 text-orange" aria-hidden />
              <p className="mt-3 font-display text-3xl font-bold text-navy">{value}</p>
              <p className="mt-0.5 text-sm text-slate-ink">{label}</p>
            </Link>
          </li>
        ))}
      </ul>

      {data.quotations.length > 0 && (
        <Card title="Quotations awaiting your approval">
          <ul className="divide-y divide-line">
            {data.quotations.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold text-navy">{q.title}</p>
                  <p className="text-sm text-slate-ink">{q.reference} · {money(q.totalCents)}{q.depositCents ? ` · deposit ${money(q.depositCents)}` : ""}{q.validUntil ? ` · valid until ${dateOnly(q.validUntil)}` : ""}</p>
                </div>
                <Link href={`/q/${q.publicToken}`} className="btn-primary !py-2">Review & approve</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card title="Active orders" className="xl:col-span-3" action={<Link href="/account/orders" className="text-sm font-semibold text-orange-700 hover:underline">All orders</Link>}>
          {data.activeOrders.length === 0 ? (
            <Empty title="No active orders" text="When a booking is confirmed you will follow every handoff here." href="/request-a-quote" cta="Request a Quote" />
          ) : (
            <ul className="space-y-3">
              {data.activeOrders.map((o) => (
                <li key={o.id}>
                  <Link href={`/account/orders/${o.id}`} className="group flex items-center justify-between gap-4 rounded-2xl border border-line p-4 transition hover:border-orange/40 hover:bg-orange-50/40">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-navy">{o.reference}</span>
                        <StatusPill status={o.status} label={o.statusLabel} />
                      </div>
                      <p className="mt-1.5 truncate text-sm text-slate-ink">{placeLabel(o.pickup)} → {placeLabel(o.delivery)}</p>
                      <p className="text-xs text-muted">{serviceName(o.serviceType)} · {dateOnly(o.serviceDate)}{o.guestName ? ` · Guest ${o.guestName}` : ""}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-orange" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6 xl:col-span-2">
          <Card title="Quick actions">
            <div className="grid gap-2">
              <Link href="/request-a-quote" className="btn-primary justify-start"><Plus className="h-4 w-4" aria-hidden /> Request a Quote</Link>
              <Link href="/account/orders?status=completed" className="btn-ghost justify-start"><RotateCcw className="h-4 w-4" aria-hidden /> Book a past order again</Link>
              <Link href="/track" className="btn-ghost justify-start"><PackageSearch className="h-4 w-4" aria-hidden /> Track by reference</Link>
              {canUseConcierge(me) && <Link href="/account/concierge" className="btn-navy justify-start"><ConciergeBell className="h-4 w-4" aria-hidden /> New guest request</Link>}
            </div>
          </Card>
          <Card title="Open invoices">
            {data.invoices.length === 0 ? (
              <p className="text-sm text-slate-ink">You are all caught up.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.invoices.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>
                      <span className="font-semibold text-navy">{i.number}</span>
                      <span className="block text-xs text-muted">Due {dateOnly(i.dueAt)}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold">{money(i.totalCents - i.paidCents)}</span>
                      <Link href={`/invoice/${i.publicToken}`} className="text-xs font-semibold text-orange-700 hover:underline">View & pay</Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card title="Recent quote requests" action={<Link href="/account/quotes" className="text-sm font-semibold text-orange-700 hover:underline">All quotes</Link>}>
        {data.quotes.length === 0 ? (
          <p className="text-sm text-slate-ink">No quote requests yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.quotes.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span><span className="font-mono font-semibold text-navy">{q.reference}</span> <span className="text-slate-ink">· {serviceName(q.serviceType)} · {q.serviceDate}</span></span>
                <StatusPill status={q.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
