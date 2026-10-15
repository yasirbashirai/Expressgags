"use client";

/**
 * Credentials register (form Q33): one table across people, vehicles and company-level documents
 * (COI, DOT / MC, bonding). Filter by facility, holder, type and expiry window (30 / 60 / 90 days).
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { AdminTitle, useAdminUser } from "@/components/admin/admin-shell";
import { inputCls, DataTable, EmptyState, StatCard } from "@/components/admin/ui";
import { CredentialForm, type Credential } from "./credential-form";
import { CREDENTIAL_TYPE_LABEL, daysUntil, ErrorNote, ExpiryBadge, facilityLabel, fileUrl, selectCls, useApi } from "./shared";

export function CredentialsRegister() {
  const user = useAdminUser();
  const canWrite = user?.role === "OWNER" || user?.role === "STAFF";
  const params = useSearchParams();
  const [filters, setFilters] = useState({ facility: "", holder: "", type: "", within: params.get("within") ?? "", q: "" });
  const [form, setForm] = useState<{ open: boolean; existing?: Credential | null }>({ open: false });
  const qs = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString(), [filters]);
  const { data, error, reload } = useApi<{ credentials: Credential[]; facilities: string[] }>(`/team/credentials${qs ? `?${qs}` : ""}`);
  const rows = data?.credentials ?? [];
  const focus = params.get("focus");
  const expired = rows.filter((c) => (daysUntil(c.expiresAt) ?? 1) < 0).length;
  const in30 = rows.filter((c) => { const d = daysUntil(c.expiresAt); return d !== null && d >= 0 && d <= 30; }).length;

  return (
    <>
      <AdminTitle
        title="Credentials register"
        sub="Airport badges, TWIC, port passes, vehicle permits and company documents. Private, never published."
        actions={canWrite && <button className="btn-primary !py-2" onClick={() => setForm({ open: true, existing: null })}><Plus className="h-4 w-4" aria-hidden /> Company credential</button>}
      />
      <ErrorNote message={error} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Shown" value={data ? rows.length : "…"} />
        <StatCard label="Expired" value={data ? expired : "…"} tone={expired ? "orange" : "white"} />
        <StatCard label="Expiring ≤30 days" value={data ? in30 : "…"} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search credentials</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className={`${inputCls} !pl-9`} placeholder="Number, facility or notes" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </label>
        <select aria-label="Expiring within" className={selectCls} value={filters.within} onChange={(e) => setFilters({ ...filters, within: e.target.value })}>
          <option value="">Any expiry</option>
          <option value="30">Expiring ≤30 days</option>
          <option value="60">Expiring ≤60 days</option>
          <option value="90">Expiring ≤90 days</option>
        </select>
        <select aria-label="Holder" className={selectCls} value={filters.holder} onChange={(e) => setFilters({ ...filters, holder: e.target.value })}>
          <option value="">All holders</option>
          <option value="employee">People</option>
          <option value="vehicle">Vehicles</option>
          <option value="company">Company</option>
        </select>
        <select aria-label="Facility" className={selectCls} value={filters.facility} onChange={(e) => setFilters({ ...filters, facility: e.target.value })}>
          <option value="">All facilities</option>
          {(data?.facilities ?? []).map((f) => <option key={f} value={f}>{facilityLabel(f)}</option>)}
        </select>
        <select aria-label="Type" className={selectCls} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">All types</option>
          {Object.entries(CREDENTIAL_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {!data && !error ? <p className="py-10 text-center text-sm text-muted">Loading register…</p> : (
        <DataTable
          rows={rows}
          rowKey={(c) => c.id}
          onRowClick={canWrite ? (c) => setForm({ open: true, existing: c }) : undefined}
          empty={<EmptyState title="No credentials match" text="Add credentials on a team member or vehicle profile, or add a company-level document here." />}
          columns={[
            { key: "type", header: "Credential", cell: (c) => <span className={`font-semibold text-navy ${focus === c.id ? "rounded bg-orange-50 px-1" : ""}`}>{CREDENTIAL_TYPE_LABEL[c.type] ?? c.type}</span> },
            { key: "facility", header: "Facility", cell: (c) => facilityLabel(c.facility) },
            {
              key: "holder",
              header: "Holder",
              cell: (c) =>
                c.employee ? <Link className="text-navy underline" href={`/admin/team/${c.employee.id}`} onClick={(e) => e.stopPropagation()}>{c.employee.firstName} {c.employee.lastName}</Link>
                : c.vehicle ? <Link className="text-navy underline" href={`/admin/fleet/${c.vehicle.id}`} onClick={(e) => e.stopPropagation()}>Unit {c.vehicle.unitNumber}</Link>
                : <span className="text-slate-ink">Express Bags (company)</span>,
            },
            { key: "identifier", header: "Number", cell: (c) => <span className="font-mono text-xs">{c.identifier || "-"}</span>, mobile: false },
            { key: "expires", header: "Expires", cell: (c) => <ExpiryBadge date={c.expiresAt} /> },
            { key: "file", header: "Scan", cell: (c) => (c.uploadId ? <a className="text-navy underline" href={fileUrl("team", c.uploadId)} onClick={(e) => e.stopPropagation()}>Open</a> : <span className="text-muted">-</span>), mobile: false },
          ]}
        />
      )}
      {form.open && (
        <CredentialForm
          open
          existing={form.existing}
          onClose={() => setForm({ open: false })}
          onSaved={() => { setForm({ open: false }); reload(); }}
        />
      )}
    </>
  );
}
