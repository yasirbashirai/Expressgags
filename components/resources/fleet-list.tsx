"use client";

/**
 * Fleet: vehicle list with filters, fleet report (status mix, expirations, maintenance spend),
 * CSV export and "Add vehicle".
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Download, Plus, Search, Truck, Wrench } from "lucide-react";
import { AdminTitle, Panel, useAdminUser } from "@/components/admin/admin-shell";
import { api, API_URL, ApiError, money } from "@/components/admin/api";
import { DataTable, EmptyState, Field, inputCls, Modal, StatCard } from "@/components/admin/ui";
import { ErrorNote, ExpiryBadge, MARKET_OPTIONS, marketName, selectCls, shortDate, StatusBadge, useApi, VEHICLE_CLASS_LABEL, VEHICLE_STATUS_LABEL } from "./shared";

export type VehicleRow = {
  id: string;
  unitNumber: string;
  vehicleClassCode: string;
  make: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
  homeMarket: string | null;
  status: string;
  odometer: number | null;
  registrationExpiresAt: string | null;
  insuranceExpiresAt: string | null;
  inspectionExpiresAt: string | null;
  nextMaintenance: { id: string; type: string; scheduledFor: string | null } | null;
};

type Report = {
  byStatus: Record<string, number>;
  byClass: Record<string, number>;
  expiring: { id: string; unitNumber: string; registrationExpiresAt: string | null; insuranceExpiresAt: string | null; inspectionExpiresAt: string | null }[];
  maintenanceSpendYtdCents: number;
  maintenanceJobsYtd: number;
  maintenanceSpend12mCents: number;
  upcomingMaintenance: { id: string; type: string; scheduledFor: string | null; vehicle: { id: string; unitNumber: string } }[];
};

/** The soonest of the three expirations, for the list column. */
const nextExpiry = (v: Pick<VehicleRow, "registrationExpiresAt" | "insuranceExpiresAt" | "inspectionExpiresAt">) => {
  const all = [
    { label: "Reg.", d: v.registrationExpiresAt },
    { label: "Ins.", d: v.insuranceExpiresAt },
    { label: "Insp.", d: v.inspectionExpiresAt },
  ].filter((x) => x.d);
  return all.sort((a, b) => new Date(a.d!).getTime() - new Date(b.d!).getTime())[0];
};

export function FleetList() {
  const router = useRouter();
  const user = useAdminUser();
  const canWrite = user?.role === "OWNER" || user?.role === "STAFF";
  const [filters, setFilters] = useState({ status: "", class: "", market: "", q: "" });
  const [adding, setAdding] = useState(false);
  const qs = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString(), [filters]);
  const { data, error, reload } = useApi<{ vehicles: VehicleRow[] }>(`/fleet${qs ? `?${qs}` : ""}`);
  const { data: report } = useApi<Report>("/fleet/report");
  const total = report ? Object.values(report.byStatus).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <AdminTitle
        title="Fleet"
        sub="Cargo vans and 15, 20 and 26-foot box trucks. Fleet size is private and never shown on the website."
        actions={
          <>
            <a href={`${API_URL}/v1/admin/fleet/export.csv`} className="btn-ghost !py-2"><Download className="h-4 w-4" aria-hidden /> Export CSV</a>
            {canWrite && <button className="btn-primary !py-2" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden /> Add vehicle</button>}
          </>
        }
      />
      <ErrorNote message={error} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Vehicles" value={report ? total : "…"} hint={report ? `${report.byStatus.AVAILABLE ?? 0} available now` : undefined} Icon={Truck} />
        <StatCard label="In maintenance" value={report ? (report.byStatus.MAINTENANCE ?? 0) + (report.byStatus.OUT_OF_SERVICE ?? 0) : "…"} hint="maintenance or out of service" tone={report && (report.byStatus.MAINTENANCE || report.byStatus.OUT_OF_SERVICE) ? "orange" : "white"} Icon={Wrench} />
        <StatCard label="Expiring ≤60 days" value={report ? report.expiring.length : "…"} hint="registration, insurance or inspection" />
        <StatCard label="Maintenance YTD" value={report ? money(report.maintenanceSpendYtdCents) : "…"} hint={report ? `${report.maintenanceJobsYtd} jobs · 12 mo ${money(report.maintenanceSpend12mCents)}` : undefined} tone="navy" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <div className="xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[200px] flex-1">
              <span className="sr-only">Search vehicles</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input className={`${inputCls} !pl-9`} placeholder="Unit, plate, make or model" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
            </label>
            <select aria-label="Status" className={selectCls} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Any status</option>
              {Object.entries(VEHICLE_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select aria-label="Vehicle class" className={selectCls} value={filters.class} onChange={(e) => setFilters({ ...filters, class: e.target.value })}>
              <option value="">All classes</option>
              {Object.entries(VEHICLE_CLASS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select aria-label="Home market" className={selectCls} value={filters.market} onChange={(e) => setFilters({ ...filters, market: e.target.value })}>
              <option value="">All markets</option>
              {MARKET_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          {!data && !error ? (
            <p className="py-10 text-center text-sm text-muted">Loading fleet…</p>
          ) : (
            <DataTable
              rows={data?.vehicles ?? []}
              rowKey={(v) => v.id}
              onRowClick={(v) => router.push(`/admin/fleet/${v.id}`)}
              empty={<EmptyState title="No vehicles match" text="Adjust the filters or add a vehicle." />}
              columns={[
                { key: "unit", header: "Unit", cell: (v) => <Link href={`/admin/fleet/${v.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-navy hover:underline">{v.unitNumber}</Link> },
                { key: "class", header: "Class", cell: (v) => VEHICLE_CLASS_LABEL[v.vehicleClassCode] ?? v.vehicleClassCode },
                { key: "vehicle", header: "Vehicle", cell: (v) => [v.year, v.make, v.model].filter(Boolean).join(" ") || "-", mobile: false },
                { key: "market", header: "Market", cell: (v) => marketName(v.homeMarket) },
                { key: "status", header: "Status", cell: (v) => <StatusBadge status={v.status} /> },
                { key: "next", header: "Next expiry", cell: (v) => { const n = nextExpiry(v); return n ? <ExpiryBadge date={n.d} label={n.label} /> : <span className="text-muted">-</span>; } },
              ]}
            />
          )}
        </div>
        <div className="space-y-5">
          <Panel title="Upcoming maintenance">
            {!report ? <p className="text-sm text-muted">Loading…</p> : report.upcomingMaintenance.length === 0 ? <p className="text-sm text-muted">Nothing scheduled.</p> : (
              <ul className="divide-y divide-line text-sm">
                {report.upcomingMaintenance.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 py-2.5">
                    <Link href={`/admin/fleet/${m.vehicle.id}`} className="font-medium text-navy hover:underline">Unit {m.vehicle.unitNumber}<span className="block text-xs font-normal text-slate-ink">{m.type}</span></Link>
                    <span className="shrink-0 text-xs text-muted">{shortDate(m.scheduledFor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Fleet mix">
            {report && (
              <ul className="space-y-2 text-sm">
                {Object.entries(VEHICLE_CLASS_LABEL).map(([code, label]) => {
                  const n = report.byClass[code] ?? 0;
                  return (
                    <li key={code}>
                      <div className="flex justify-between"><span>{label}</span><span className="font-semibold text-navy">{n}</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-cloud" aria-hidden><div className="h-full rounded-full bg-orange" style={{ width: `${total ? (n / total) * 100 : 0}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <AddVehicle open={adding} onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); reload(); router.push(`/admin/fleet/${id}`); }} />
    </>
  );
}

function AddVehicle({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const empty = { unitNumber: "", vehicleClassCode: "box-26", make: "", model: "", year: "", plate: "", homeMarket: "miami", registrationExpiresAt: "", insuranceExpiresAt: "", inspectionExpiresAt: "" };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === "" ? null : k === "year" ? Number(v) : v]));
      const r = await api<{ vehicle: { id: string } }>("/fleet", { method: "POST", json: body });
      setForm(empty);
      onCreated(r.vehicle.id);
    } catch (err) {
      const ae = err as ApiError;
      setError(ae.message);
      setErrors(Object.fromEntries((ae.details ?? []).map((d) => [d.path, d.message])));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add vehicle" wide
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" form="add-vehicle" className="btn-primary" disabled={busy || !form.unitNumber}>{busy ? "Saving…" : "Add vehicle"}</button></>}>
      <form id="add-vehicle" onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <ErrorNote message={error} />
        <Field label="Unit number" htmlFor="v-unit" error={errors.unitNumber}><input id="v-unit" className={inputCls} value={form.unitNumber} onChange={set("unitNumber")} required /></Field>
        <Field label="Class" htmlFor="v-class"><select id="v-class" className={inputCls} value={form.vehicleClassCode} onChange={set("vehicleClassCode")}>{Object.entries(VEHICLE_CLASS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Home market" htmlFor="v-market"><select id="v-market" className={inputCls} value={form.homeMarket} onChange={set("homeMarket")}>{MARKET_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
        <Field label="Make" htmlFor="v-make"><input id="v-make" className={inputCls} value={form.make} onChange={set("make")} /></Field>
        <Field label="Model" htmlFor="v-model"><input id="v-model" className={inputCls} value={form.model} onChange={set("model")} /></Field>
        <Field label="Year" htmlFor="v-year" error={errors.year}><input id="v-year" inputMode="numeric" className={inputCls} value={form.year} onChange={set("year")} /></Field>
        <Field label="Plate" htmlFor="v-plate"><input id="v-plate" className={inputCls} value={form.plate} onChange={set("plate")} /></Field>
        <Field label="Registration expires" htmlFor="v-reg"><input id="v-reg" type="date" className={inputCls} value={form.registrationExpiresAt} onChange={set("registrationExpiresAt")} /></Field>
        <Field label="Insurance expires" htmlFor="v-ins"><input id="v-ins" type="date" className={inputCls} value={form.insuranceExpiresAt} onChange={set("insuranceExpiresAt")} /></Field>
        <Field label="Inspection due" htmlFor="v-insp"><input id="v-insp" type="date" className={inputCls} value={form.inspectionExpiresAt} onChange={set("inspectionExpiresAt")} /></Field>
      </form>
    </Modal>
  );
}
