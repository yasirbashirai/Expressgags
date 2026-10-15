"use client";

/**
 * Team (Employee Management): people list with filters, "Add team member" dialog and a week
 * availability board. Identities shown here are private to signed-in staff.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BellRing, Plus, Search, UserRound } from "lucide-react";
import { AdminTitle, useAdminUser } from "@/components/admin/admin-shell";
import { api, ApiError } from "@/components/admin/api";
import { Badge } from "@/components/admin/labels";
import { DataTable, EmptyState, Field, inputCls, Modal, StatCard, Tabs } from "@/components/admin/ui";
import { AvailabilityWeek } from "./availability-week";
import { ErrorNote, ExpiryBadge, MARKET_OPTIONS, marketName, ROLE_LABEL, selectCls, StatusBadge, useApi } from "./shared";

export type EmployeeRow = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  phone: string | null;
  email: string | null;
  homeMarket: string | null;
  status: string;
  licenseExpiresAt: string | null;
  login: { id: string; email: string; role: string; active: boolean } | null;
  assignmentsToday: number;
  expiringCredentials: number;
};

export function TeamList() {
  const router = useRouter();
  const user = useAdminUser();
  const canWrite = user?.role === "OWNER" || user?.role === "STAFF";
  const [tab, setTab] = useState<"people" | "availability">("people");
  const [filters, setFilters] = useState({ role: "", market: "", status: "ACTIVE", q: "" });
  const [adding, setAdding] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  const qs = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString(), [filters]);
  const { data, error, reload } = useApi<{ employees: EmployeeRow[] }>(`/team${qs ? `?${qs}` : ""}`);
  const rows = data?.employees ?? [];
  const drivers = rows.filter((r) => r.role === "DRIVER").length;
  const helpers = rows.filter((r) => r.role === "HELPER").length;
  const attention = rows.filter((r) => r.expiringCredentials > 0).length;

  async function runReminders() {
    setRunning("Checking expirations…");
    try {
      const r = await api<{ due: number; emailed: number; emailStatus: string }>("/team/reminders/run", { method: "POST" });
      setRunning(`${r.due} item${r.due === 1 ? "" : "s"} due within 30 days · ${r.emailed} emailed${r.emailStatus === "NO_RECIPIENT" ? " (set a notification email in Settings)" : ""}`);
    } catch (e) {
      setRunning((e as Error).message);
    }
  }

  return (
    <>
      <AdminTitle
        title="Team"
        sub="Drivers, helpers, dispatch and office. Private to staff, never shown on the website."
        actions={
          <>
            {canWrite && (
              <button className="btn-ghost !py-2" onClick={runReminders}>
                <BellRing className="h-4 w-4" aria-hidden /> Run reminders now
              </button>
            )}
            {canWrite && (
              <button className="btn-primary !py-2" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" aria-hidden /> Add team member
              </button>
            )}
          </>
        }
      />
      {running && <p className="mb-4 rounded-xl bg-navy-50 px-4 py-3 text-sm text-navy" role="status">{running}</p>}
      <ErrorNote message={error} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Shown" value={data ? rows.length : "…"} hint="matching the filters" />
        <StatCard label="Drivers" value={data ? drivers : "…"} />
        <StatCard label="Helpers" value={data ? helpers : "…"} />
        <StatCard label="Need attention" value={data ? attention : "…"} hint="license or credential expiring ≤30 days" tone={attention ? "orange" : "white"} />
      </div>

      <Tabs tabs={[{ value: "people", label: "People" }, { value: "availability", label: "Availability" }]} value={tab} onChange={setTab} />

      {tab === "people" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <span className="sr-only">Search team</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input className={`${inputCls} !pl-9`} placeholder="Search name, email or phone" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
            </label>
            <select aria-label="Role" className={selectCls} value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
              <option value="">All roles</option>
              {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select aria-label="Home market" className={selectCls} value={filters.market} onChange={(e) => setFilters({ ...filters, market: e.target.value })}>
              <option value="">All markets</option>
              {MARKET_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select aria-label="Status" className={selectCls} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Any status</option>
              <option value="ACTIVE">Active</option>
              <option value="ON_LEAVE">On leave</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          {!data && !error ? (
            <p className="py-10 text-center text-sm text-muted">Loading team…</p>
          ) : (
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/admin/team/${r.id}`)}
              empty={<EmptyState title="No team members match" text="Adjust the filters or add a team member." />}
              columns={[
                {
                  key: "name",
                  header: "Name",
                  cell: (r) => (
                    <Link href={`/admin/team/${r.id}`} className="flex items-center gap-3 font-semibold text-navy hover:underline" onClick={(e) => e.stopPropagation()}>
                      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy md:inline-flex" aria-hidden>
                        <UserRound className="h-4 w-4" />
                      </span>
                      {r.firstName} {r.lastName}
                    </Link>
                  ),
                },
                { key: "role", header: "Role", cell: (r) => ROLE_LABEL[r.role] ?? r.role },
                { key: "market", header: "Home market", cell: (r) => marketName(r.homeMarket) },
                { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
                { key: "license", header: "License", cell: (r) => <ExpiryBadge date={r.licenseExpiresAt} /> },
                {
                  key: "flags",
                  header: "Flags",
                  cell: (r) => (
                    <span className="flex flex-wrap justify-end gap-1 md:justify-start">
                      {r.expiringCredentials > 0 && <Badge className="bg-orange-50 text-orange-700 ring-orange-200">{r.expiringCredentials} expiring</Badge>}
                      {r.login && <Badge className={r.login.active ? "bg-navy-50 text-navy ring-navy-100" : "bg-cloud text-muted ring-line"}>{r.login.active ? "App login" : "Login off"}</Badge>}
                      {r.assignmentsToday > 0 && <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-200">{r.assignmentsToday} today</Badge>}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </>
      ) : (
        <AvailabilityWeek employees={rows.filter((r) => r.status !== "INACTIVE")} canEdit={user?.role !== "ACCOUNTING"} />
      )}

      <AddEmployee open={adding} onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); reload(); router.push(`/admin/team/${id}`); }} />
    </>
  );
}

function AddEmployee({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", role: "DRIVER", phone: "", email: "", homeMarket: "miami", employmentType: "employee" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const r = await api<{ employee: { id: string } }>("/team", { method: "POST", json: form });
      setForm({ firstName: "", lastName: "", role: "DRIVER", phone: "", email: "", homeMarket: "miami", employmentType: "employee" });
      onCreated(r.employee.id);
    } catch (err) {
      const ae = err as ApiError;
      setError(ae.message);
      setErrors(Object.fromEntries((ae.details ?? []).map((d) => [d.path, d.message])));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add team member"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="add-employee" className="btn-primary" disabled={busy || !form.firstName || !form.lastName}>{busy ? "Saving…" : "Add team member"}</button>
        </>
      }
    >
      <form id="add-employee" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <ErrorNote message={error} />
        <Field label="First name" htmlFor="emp-first" error={errors.firstName}><input id="emp-first" className={inputCls} value={form.firstName} onChange={set("firstName")} required autoComplete="off" /></Field>
        <Field label="Last name" htmlFor="emp-last" error={errors.lastName}><input id="emp-last" className={inputCls} value={form.lastName} onChange={set("lastName")} required autoComplete="off" /></Field>
        <Field label="Role" htmlFor="emp-role">
          <select id="emp-role" className={inputCls} value={form.role} onChange={set("role")}>
            {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Home market" htmlFor="emp-market">
          <select id="emp-market" className={inputCls} value={form.homeMarket} onChange={set("homeMarket")}>
            {MARKET_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Phone" htmlFor="emp-phone"><input id="emp-phone" type="tel" className={inputCls} value={form.phone} onChange={set("phone")} autoComplete="off" /></Field>
        <Field label="Email" htmlFor="emp-email" error={errors.email}><input id="emp-email" type="email" className={inputCls} value={form.email} onChange={set("email")} autoComplete="off" /></Field>
        <Field label="Employment type" htmlFor="emp-type">
          <select id="emp-type" className={inputCls} value={form.employmentType} onChange={set("employmentType")}>
            <option value="employee">Employee</option>
            <option value="contractor">Contractor</option>
          </select>
        </Field>
        <p className="text-xs text-muted sm:col-span-2">License, credentials, documents and an app login can be added on the profile.</p>
      </form>
    </Modal>
  );
}
