"use client";

/**
 * Portal UI primitives: inputs, buttons with busy state, alerts, status pills, cards, empty states.
 * Consistent with the public site's navy/orange system.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export const input =
  "block w-full rounded-xl border border-line bg-white px-4 py-3 text-base text-charcoal shadow-sm transition placeholder:text-muted/70 hover:border-navy/30 focus:border-navy focus:outline-none focus:ring-4 focus:ring-navy/10 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-100";

export function Field({ id, label, error, hint, optional, children }: { id: string; label: string; error?: string; hint?: string; optional?: boolean; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-semibold text-navy">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-muted">Optional</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

/** Props for an input wired to Field: id, aria-invalid, aria-describedby. */
export const aria = (id: string, error?: string, hint?: string) => ({
  id,
  name: id,
  "aria-invalid": error ? (true as const) : undefined,
  "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
});

export function SubmitButton({ busy, children, className = "btn-primary" }: { busy?: boolean; children: ReactNode; className?: string }) {
  return (
    <button type="submit" disabled={busy} aria-busy={busy || undefined} className={className}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {children}
    </button>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const t = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    info: "border-navy-100 bg-navy-50 text-navy",
  }[tone];
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${t}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  CONFIRMED: "bg-navy-50 text-navy ring-navy-100",
  DRIVER_ASSIGNED: "bg-sky-50 text-sky-800 ring-sky-200",
  EN_ROUTE: "bg-orange-50 text-orange-700 ring-orange-200",
  PICKED_UP: "bg-orange-50 text-orange-700 ring-orange-200",
  AT_FACILITY: "bg-violet-50 text-violet-800 ring-violet-200",
  TRANSFERRED_TO_CARRIER: "bg-violet-50 text-violet-800 ring-violet-200",
  IN_TRANSIT: "bg-orange-50 text-orange-700 ring-orange-200",
  OUT_FOR_DELIVERY: "bg-orange-100 text-orange-800 ring-orange-200",
  DELIVERED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CANCELLED: "bg-cloud text-muted ring-line",
  NEW: "bg-orange-50 text-orange-700 ring-orange-200",
  REVIEWING: "bg-navy-50 text-navy ring-navy-100",
  QUOTED: "bg-sky-50 text-sky-800 ring-sky-200",
  WON: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  LOST: "bg-cloud text-muted ring-line",
  ARCHIVED: "bg-cloud text-muted ring-line",
  SENT: "bg-orange-50 text-orange-700 ring-orange-200",
  VIEWED: "bg-orange-50 text-orange-700 ring-orange-200",
  ACCEPTED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CONVERTED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  DECLINED: "bg-cloud text-muted ring-line",
  EXPIRED: "bg-cloud text-muted ring-line",
  PAID: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  PARTIAL: "bg-sky-50 text-sky-800 ring-sky-200",
  OVERDUE: "bg-red-50 text-red-800 ring-red-200",
  VOID: "bg-cloud text-muted ring-line",
  ACTIVE: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  INVITED: "bg-orange-50 text-orange-700 ring-orange-200",
  DEACTIVATED: "bg-cloud text-muted ring-line",
};

const STATUS_WORDS: Record<string, string> = {
  NEW: "Received", REVIEWING: "In review", QUOTED: "Quoted", WON: "Booked", LOST: "Closed", ARCHIVED: "Closed",
  SENT: "Awaiting your approval", VIEWED: "Awaiting your approval", ACCEPTED: "Accepted", CONVERTED: "Booked", DECLINED: "Declined", EXPIRED: "Expired",
  PAID: "Paid", PARTIAL: "Partially paid", OVERDUE: "Overdue", VOID: "Void", ACTIVE: "Active", INVITED: "Invited", DEACTIVATED: "Deactivated",
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_TONES[status] ?? "bg-cloud text-slate-ink ring-line"}`}>
      {label ?? STATUS_WORDS[status] ?? status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

export function Card({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-[1.25rem] border border-line bg-white p-5 shadow-[var(--shadow-card)] md:p-6 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, text, href, cta }: { title: string; text?: string; href?: string; cta?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-cloud/60 px-6 py-10 text-center">
      <p className="font-display text-base font-bold text-navy">{title}</p>
      {text && <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-ink">{text}</p>}
      {href && cta && <Link href={href} className="btn-primary mt-5">{cta}</Link>}
    </div>
  );
}

export function PageTitle({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold md:text-4xl">{title}</h1>
        {sub && <p className="mt-2 max-w-2xl text-slate-ink">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}
