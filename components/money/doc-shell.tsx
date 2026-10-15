import Image from "next/image";
import type { ReactNode } from "react";
import { company, contact } from "@/content/site";

/**
 * Premium "paper" document frame for quotations and invoices on the public site.
 * Shows only public contact facts (P.O. Box, office phone).
 */
export function DocShell({ kind, number, status, children, aside }: { kind: string; number: string; status?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="bg-cloud py-10 md:py-16">
      <div className="container-eb grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="overflow-hidden rounded-[1.75rem] border border-line bg-white shadow-[var(--shadow-lift)]">
          <div className="h-1.5 bg-orange" aria-hidden />
          <header className="flex flex-col gap-6 border-b border-line px-6 py-7 sm:flex-row sm:items-start sm:justify-between md:px-10">
            <Image src="/brand/express-bags-logo-transparent.png" alt={company.name} width={600} height={244} className="h-14 w-auto" />
            <div className="sm:text-right">
              <p className="font-display text-2xl font-extrabold uppercase tracking-wide text-navy">{kind}</p>
              <p className="mt-1 font-mono text-sm text-muted">{number}</p>
              {status && <div className="mt-3 sm:flex sm:justify-end">{status}</div>}
            </div>
          </header>
          <div className="px-6 py-8 md:px-10">{children}</div>
          <footer className="border-t border-line bg-cloud px-6 py-5 text-xs text-muted md:px-10">
            {company.name} · {contact.addressLine} · {contact.phoneDisplay} · {contact.visits}
          </footer>
        </article>
        {aside && <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">{aside}</aside>}
      </div>
    </section>
  );
}

const STATUS_TONE: Record<string, string> = {
  VIEWED: "bg-navy-50 text-navy ring-navy-100",
  SENT: "bg-navy-50 text-navy ring-navy-100",
  ACCEPTED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CONVERTED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  PAID: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  PARTIAL: "bg-amber-50 text-amber-800 ring-amber-200",
  OVERDUE: "bg-rose-50 text-rose-800 ring-rose-200",
  DECLINED: "bg-rose-50 text-rose-800 ring-rose-200",
  EXPIRED: "bg-cloud text-muted ring-line",
  VOID: "bg-cloud text-muted ring-line",
};
const STATUS_TEXT: Record<string, string> = { VIEWED: "Awaiting your approval", SENT: "Awaiting your approval", ACCEPTED: "Accepted", CONVERTED: "Accepted", PAID: "Paid in full", PARTIAL: "Partially paid", OVERDUE: "Past due", DECLINED: "Declined", EXPIRED: "Expired", VOID: "Cancelled" };

export function DocStatus({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_TONE[status] ?? "bg-cloud text-muted ring-line"}`}>
      {STATUS_TEXT[status] ?? status}
    </span>
  );
}

export type DocLine = { description: string; quantity: number; unit?: string | null; unitCents: number; totalCents: number };

export function DocLines({ lines, fmt, qtyFmt }: { lines: DocLine[]; fmt: (c: number) => string; qtyFmt: (q: number) => string }) {
  return (
    <>
      <ul className="divide-y divide-line border-y-2 border-navy sm:hidden" aria-label="Line items">
        {lines.map((l, i) => (
          <li key={i} className="py-3 text-sm">
            <p className="text-charcoal">{l.description}</p>
            <p className="mt-1 flex justify-between gap-3 text-slate-ink">
              <span>{qtyFmt(l.quantity)}{l.unit ? ` ${l.unit}` : ""} × {fmt(l.unitCents)}</span>
              <span className="font-semibold text-navy">{fmt(l.totalCents)}</span>
            </p>
          </li>
        ))}
      </ul>
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full min-w-[520px] text-left text-sm">
        <caption className="sr-only">Line items</caption>
        <thead>
          <tr className="border-b-2 border-navy text-xs uppercase tracking-wider text-navy">
            <th scope="col" className="py-3 pr-4 font-semibold">Description</th>
            <th scope="col" className="py-3 pr-4 text-right font-semibold">Qty</th>
            <th scope="col" className="py-3 pr-4 text-right font-semibold">Rate</th>
            <th scope="col" className="py-3 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="py-3.5 pr-4 text-charcoal">{l.description}</td>
              <td className="whitespace-nowrap py-3.5 pr-4 text-right text-slate-ink">{qtyFmt(l.quantity)}{l.unit ? ` ${l.unit}` : ""}</td>
              <td className="whitespace-nowrap py-3.5 pr-4 text-right text-slate-ink">{fmt(l.unitCents)}</td>
              <td className="whitespace-nowrap py-3.5 text-right font-medium text-navy">{fmt(l.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

export function DocTotals({ rows }: { rows: { label: string; value: string; strong?: boolean }[] }) {
  return (
    <dl className="ml-auto mt-6 w-full max-w-sm space-y-2 text-sm">
      {rows.map((r) => (
        <div key={r.label} className={`flex justify-between gap-6 ${r.strong ? "rounded-xl bg-navy px-4 py-3 text-white" : "px-4 text-slate-ink"}`}>
          <dt className={r.strong ? "font-semibold" : ""}>{r.label}</dt>
          <dd className={r.strong ? "font-display text-lg font-bold" : "font-medium text-navy"}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
