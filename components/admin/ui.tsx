"use client";

/**
 * Shared admin UI kit — use these in every admin module for a consistent look:
 * StatCard, DataTable (desktop table + mobile cards), EmptyState, Field/inputCls, Modal, Tabs, Toolbar, ConfirmButton.
 * Page chrome: AdminShell/AdminTitle/Panel from ./admin-shell; badges from ./labels.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export const inputCls =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-charcoal shadow-sm outline-none transition placeholder:text-muted focus:border-navy focus:ring-2 focus:ring-navy/15 disabled:bg-cloud";

export function StatCard({ label, value, hint, tone = "white", Icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "white" | "navy" | "orange"; Icon?: React.ComponentType<{ className?: string }> }) {
  const t = { white: "bg-white text-navy border-line", navy: "bg-navy text-white border-navy", orange: "bg-orange-600 text-white border-orange-600" }[tone];
  return (
    <div className={`rounded-2xl border p-5 shadow-[var(--shadow-card)] ${t}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${tone === "white" ? "text-muted" : "text-white"}`}>{label}</p>
        {Icon && <Icon className={`h-4 w-4 ${tone === "white" ? "text-orange" : "text-white/80"}`} />}
      </div>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
      {hint && <p className={`mt-1 text-xs ${tone === "white" ? "text-slate-ink" : "text-white"}`}>{hint}</p>}
    </div>
  );
}

export type Column<T> = { key: string; header: string; cell: (row: T) => ReactNode; className?: string; mobile?: boolean };

/** Responsive table: real <table> on md+, stacked cards on phones. */
export function DataTable<T>({ rows, columns, rowKey, onRowClick, empty }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; empty?: ReactNode }) {
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-cloud text-xs uppercase tracking-wider text-muted">
            <tr>{columns.map((c) => <th key={c.key} scope="col" className={`px-4 py-3 font-semibold ${c.className ?? ""}`}>{c.header}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? "cursor-pointer hover:bg-navy-50/50" : ""}>
                {columns.map((c) => <td key={c.key} className={`px-4 py-3 align-top ${c.className ?? ""}`}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)}>
            <button type="button" disabled={!onRowClick} onClick={onRowClick ? () => onRowClick(r) : undefined} className="block w-full rounded-2xl border border-line bg-white p-4 text-left">
              <dl className="grid gap-1.5 text-sm">
                {columns.filter((c) => c.mobile !== false).map((c) => (
                  <div key={c.key} className="flex justify-between gap-3">
                    <dt className="text-xs uppercase tracking-wider text-muted">{c.header}</dt>
                    <dd className="min-w-0 text-right">{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white p-10 text-center">
      <p className="font-display text-lg font-bold text-navy">{title}</p>
      {text && <p className="mx-auto mt-2 max-w-md text-sm text-slate-ink">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-navy">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-rose-700" role="alert">{error}</p>}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

/** Accessible modal dialog (focus trapped to the dialog, Esc closes). */
export function Modal({ open, onClose, title, children, footer, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button aria-label="Close dialog" className="absolute inset-0 bg-navy-950/50" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-[var(--shadow-lift)] outline-none sm:rounded-3xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}>
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-6 py-4">
          <h2 id={id} className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-muted hover:bg-cloud"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-white px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto rounded-full border border-line bg-white p-1">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition ${value === t.value ? "bg-navy text-white" : "text-slate-ink hover:bg-cloud"}`}>
          {t.label}{typeof t.count === "number" && <span className="ml-1.5 font-normal">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Two-step confirm for destructive or important actions. */
export function ConfirmButton({ onConfirm, children, confirmText = "Click again to confirm", className = "btn-ghost" }: { onConfirm: () => void; children: ReactNode; confirmText?: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={className} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmText : children}
    </button>
  );
}
