"use client";

/**
 * Vehicle profile: photo, details & status, expirations, maintenance schedule + history + costs,
 * documents (registration, insurance, inspection keep the profile's expiry in step), permits and recent jobs.
 */
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, FileText, ImagePlus, Pencil, Plus, ShieldCheck, Trash2, Truck, Upload } from "lucide-react";
import { AdminTitle, Panel, useAdminUser } from "@/components/admin/admin-shell";
import { api, ApiError, money } from "@/components/admin/api";
import { ConfirmButton, Field, inputCls, Modal } from "@/components/admin/ui";
import { CredentialForm, type Credential } from "./credential-form";
import {
  CREDENTIAL_TYPE_LABEL, ErrorNote, ExpiryBadge, facilityLabel, fileUrl, isoDay, MARKET_OPTIONS, marketName, shortDate, StatusBadge,
  useApi, VEHICLE_CLASS_LABEL, VEHICLE_STATUS_LABEL,
} from "./shared";

type Maintenance = { id: string; status: string; type: string; scheduledFor: string | null; completedAt: string | null; odometer: number | null; costCents: number | null; vendor: string | null; notes: string | null };
type Vehicle = {
  id: string; unitNumber: string; vehicleClassCode: string; make: string | null; model: string | null; year: number | null; plate: string | null; vin: string | null;
  homeMarket: string | null; status: string; odometer: number | null; registrationExpiresAt: string | null; insuranceExpiresAt: string | null; inspectionExpiresAt: string | null;
  photoUploadId: string | null; notes: string | null;
  maintenance: Maintenance[];
  documents: { id: string; title: string; uploadId: string; expiresAt: string | null }[];
  credentials: Credential[];
  assignments: { id: string; assignedAt: string; order: { id: string; reference: string; serviceDate: string; status: string }; employee: { id: string; firstName: string; lastName: string } }[];
};

export function VehicleDetail({ id }: { id: string }) {
  const user = useAdminUser();
  const canWrite = user?.role === "OWNER" || user?.role === "STAFF";
  const canStatus = canWrite || user?.role === "DISPATCHER";
  const { data, error, reload } = useApi<{ vehicle: Vehicle }>(`/fleet/${id}`);
  const [editing, setEditing] = useState(false);
  const [maint, setMaint] = useState<{ open: boolean; existing?: Maintenance | null }>({ open: false });
  const [cred, setCred] = useState<{ open: boolean; existing?: Credential | null }>({ open: false });
  const [note, setNote] = useState<string | null>(null);
  const v = data?.vehicle;

  if (error) return <ErrorNote message={error} />;
  if (!v) return <p className="py-10 text-center text-sm text-muted">Loading vehicle…</p>;

  async function setStatus(status: string) {
    try {
      await api(`/fleet/${v!.id}`, { method: "PATCH", json: { status } });
      reload();
    } catch (e) {
      setNote((e as Error).message);
    }
  }
  async function uploadPhoto(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api(`/fleet/${v!.id}/photo`, { method: "POST", body: fd });
      reload();
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  const spend = v.maintenance.filter((m) => m.status === "COMPLETED").reduce((s, m) => s + (m.costCents ?? 0), 0);

  return (
    <>
      <Link href="/admin/fleet" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-ink hover:text-navy"><ArrowLeft className="h-4 w-4" aria-hidden /> Fleet</Link>
      <AdminTitle
        title={`Unit ${v.unitNumber}`}
        sub={`${VEHICLE_CLASS_LABEL[v.vehicleClassCode] ?? v.vehicleClassCode} · ${[v.year, v.make, v.model].filter(Boolean).join(" ") || "details not set"} · ${marketName(v.homeMarket)}`}
        actions={
          <>
            {canStatus && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">Status</span>
                <select aria-label="Vehicle status" className="rounded-xl border border-line bg-white px-3 py-2 text-sm" value={v.status} onChange={(e) => setStatus(e.target.value)}>
                  {Object.entries(VEHICLE_STATUS_LABEL).map(([s, l]) => <option key={s} value={s}>{l}</option>)}
                </select>
              </label>
            )}
            {canWrite && !editing && <button className="btn-ghost !py-2" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" aria-hidden /> Edit</button>}
          </>
        }
      />
      <ErrorNote message={note} />

      <div className="grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          {editing ? <EditVehicle vehicle={v} onDone={() => { setEditing(false); reload(); }} /> : (
            <Panel title="Details">
              <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-navy to-navy-950 text-white">
                  {v.photoUploadId ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private, cookie-authenticated API image
                    <img src={fileUrl("fleet", v.photoUploadId, true)} alt={`Unit ${v.unitNumber}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-white/80"><Truck className="h-10 w-10" aria-hidden /><span className="text-xs">No photo yet</span></div>
                  )}
                  {canWrite && (
                    <label className="absolute bottom-2 right-2 inline-flex cursor-pointer items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-navy hover:bg-white">
                      <ImagePlus className="h-3.5 w-3.5" aria-hidden /> Photo
                      <input type="file" accept=".jpg,.jpeg,.png,.webp" className="sr-only" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
                    </label>
                  )}
                </div>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <Item label="Status"><StatusBadge status={v.status} /></Item>
                  <Item label="Odometer">{v.odometer != null ? `${v.odometer.toLocaleString()} mi` : "-"}</Item>
                  <Item label="Plate">{v.plate || "-"}</Item>
                  <Item label="VIN"><span className="break-all">{v.vin || "-"}</span></Item>
                  <Item label="Registration"><ExpiryBadge date={v.registrationExpiresAt} /></Item>
                  <Item label="Insurance"><ExpiryBadge date={v.insuranceExpiresAt} /></Item>
                  <Item label="Inspection"><ExpiryBadge date={v.inspectionExpiresAt} /></Item>
                  <Item label="Maintenance spend">{money(spend)}</Item>
                  {v.notes && <div className="sm:col-span-2"><Item label="Notes"><span className="whitespace-pre-line">{v.notes}</span></Item></div>}
                </dl>
              </div>
            </Panel>
          )}

          <Panel title="Maintenance" action={canWrite && <button className="btn-ghost !px-3 !py-1.5" onClick={() => setMaint({ open: true, existing: null })}><Plus className="h-4 w-4" aria-hidden /> Schedule / log</button>}>
            {v.maintenance.length === 0 ? <p className="text-sm text-muted">No maintenance recorded.</p> : (
              <ul className="divide-y divide-line text-sm">
                {v.maintenance.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-semibold text-navy">{m.type}</p>
                      <p className="text-xs text-muted">
                        {m.status === "COMPLETED" ? `Done ${shortDate(m.completedAt)}` : m.status === "SCHEDULED" ? `Scheduled ${shortDate(m.scheduledFor)}` : "Cancelled"}
                        {m.vendor && ` · ${m.vendor}`}{m.odometer != null && ` · ${m.odometer.toLocaleString()} mi`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.costCents != null && <span className="font-semibold text-navy">{money(m.costCents)}</span>}
                      <StatusBadge status={m.status} />
                      {canWrite && m.status === "SCHEDULED" && <button className="rounded-full p-1.5 text-emerald-700 hover:bg-emerald-50" aria-label={`Mark ${m.type} done`} onClick={() => setMaint({ open: true, existing: { ...m, status: "COMPLETED" } })}><CheckCircle2 className="h-4 w-4" /></button>}
                      {canWrite && <button className="rounded-full p-1.5 text-muted hover:bg-cloud" aria-label={`Edit ${m.type}`} onClick={() => setMaint({ open: true, existing: m })}><Pencil className="h-4 w-4" /></button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent jobs">
            {v.assignments.length === 0 ? <p className="text-sm text-muted">No jobs assigned to this vehicle yet.</p> : (
              <ul className="divide-y divide-line text-sm">
                {v.assignments.map((a) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                    <Link className="font-semibold text-navy hover:underline" href={`/admin/orders/${a.order.id}`}>{a.order.reference}</Link>
                    <span className="text-slate-ink">{shortDate(a.order.serviceDate)} · {a.employee.firstName} {a.employee.lastName}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <VehicleDocuments vehicle={v} canWrite={canWrite} onChange={reload} />
          <Panel title="Permits & credentials" action={canWrite && <button className="btn-ghost !px-3 !py-1.5" onClick={() => setCred({ open: true, existing: null })}><Plus className="h-4 w-4" aria-hidden /> Add</button>}>
            {v.credentials.length === 0 ? <p className="text-sm text-muted">No port or airport vehicle permits recorded.</p> : (
              <ul className="divide-y divide-line text-sm">
                {v.credentials.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2.5">
                    <span className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-orange" aria-hidden /><span><span className="font-medium text-navy">{CREDENTIAL_TYPE_LABEL[c.type] ?? c.type}</span><span className="block text-xs text-muted">{facilityLabel(c.facility)}</span></span></span>
                    <span className="flex items-center gap-1"><ExpiryBadge date={c.expiresAt} />{canWrite && <button className="rounded-full p-1.5 text-muted hover:bg-cloud" aria-label="Edit permit" onClick={() => setCred({ open: true, existing: c })}><Pencil className="h-4 w-4" /></button>}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {maint.open && <MaintenanceForm vehicleId={v.id} existing={maint.existing} onClose={() => setMaint({ open: false })} onSaved={() => { setMaint({ open: false }); reload(); }} />}
      {cred.open && <CredentialForm open holder={{ vehicleId: v.id }} existing={cred.existing} onClose={() => setCred({ open: false })} onSaved={() => { setCred({ open: false }); reload(); }} />}
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs uppercase tracking-wider text-muted">{label}</dt><dd className="mt-0.5 text-charcoal">{children}</dd></div>;
}

function EditVehicle({ vehicle: v, onDone }: { vehicle: Vehicle; onDone: () => void }) {
  const [form, setForm] = useState({
    unitNumber: v.unitNumber, vehicleClassCode: v.vehicleClassCode, make: v.make ?? "", model: v.model ?? "", year: v.year?.toString() ?? "", plate: v.plate ?? "", vin: v.vin ?? "",
    homeMarket: v.homeMarket ?? "", odometer: v.odometer?.toString() ?? "", registrationExpiresAt: isoDay(v.registrationExpiresAt), insuranceExpiresAt: isoDay(v.insuranceExpiresAt),
    inspectionExpiresAt: isoDay(v.inspectionExpiresAt), notes: v.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, val]) => [k, val === "" ? null : k === "year" || k === "odometer" ? Number(val) : val]));
      await api(`/fleet/${v.id}`, { method: "PATCH", json: body });
      onDone();
    } catch (err) {
      const ae = err as ApiError;
      setError(ae.message);
      setErrors(Object.fromEntries((ae.details ?? []).map((d) => [d.path, d.message])));
    }
  }

  return (
    <Panel title="Edit vehicle">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-3">
        <ErrorNote message={error} />
        <Field label="Unit number" htmlFor="ev-unit" error={errors.unitNumber}><input id="ev-unit" className={inputCls} value={form.unitNumber} onChange={set("unitNumber")} /></Field>
        <Field label="Class" htmlFor="ev-class"><select id="ev-class" className={inputCls} value={form.vehicleClassCode} onChange={set("vehicleClassCode")}>{Object.entries(VEHICLE_CLASS_LABEL).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></Field>
        <Field label="Home market" htmlFor="ev-market"><select id="ev-market" className={inputCls} value={form.homeMarket} onChange={set("homeMarket")}><option value="">Not set</option>{MARKET_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
        <Field label="Make" htmlFor="ev-make"><input id="ev-make" className={inputCls} value={form.make} onChange={set("make")} /></Field>
        <Field label="Model" htmlFor="ev-model"><input id="ev-model" className={inputCls} value={form.model} onChange={set("model")} /></Field>
        <Field label="Year" htmlFor="ev-year" error={errors.year}><input id="ev-year" inputMode="numeric" className={inputCls} value={form.year} onChange={set("year")} /></Field>
        <Field label="Plate" htmlFor="ev-plate"><input id="ev-plate" className={inputCls} value={form.plate} onChange={set("plate")} /></Field>
        <Field label="VIN" htmlFor="ev-vin" error={errors.vin}><input id="ev-vin" className={inputCls} value={form.vin} maxLength={17} onChange={set("vin")} /></Field>
        <Field label="Odometer (mi)" htmlFor="ev-odo"><input id="ev-odo" inputMode="numeric" className={inputCls} value={form.odometer} onChange={set("odometer")} /></Field>
        <Field label="Registration expires" htmlFor="ev-reg"><input id="ev-reg" type="date" className={inputCls} value={form.registrationExpiresAt} onChange={set("registrationExpiresAt")} /></Field>
        <Field label="Insurance expires" htmlFor="ev-ins"><input id="ev-ins" type="date" className={inputCls} value={form.insuranceExpiresAt} onChange={set("insuranceExpiresAt")} /></Field>
        <Field label="Inspection due" htmlFor="ev-insp"><input id="ev-insp" type="date" className={inputCls} value={form.inspectionExpiresAt} onChange={set("inspectionExpiresAt")} /></Field>
        <div className="sm:col-span-3"><Field label="Notes" htmlFor="ev-notes"><textarea id="ev-notes" rows={3} className={inputCls} value={form.notes} onChange={set("notes")} /></Field></div>
        <div className="flex justify-end gap-2 sm:col-span-3"><button type="button" className="btn-ghost" onClick={onDone}>Cancel</button><button className="btn-primary">Save changes</button></div>
      </form>
    </Panel>
  );
}

function MaintenanceForm({ vehicleId, existing, onClose, onSaved }: { vehicleId: string; existing?: Maintenance | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    type: existing?.type ?? "", status: existing?.status ?? "SCHEDULED", scheduledFor: isoDay(existing?.scheduledFor), completedAt: isoDay(existing?.completedAt) || (existing?.status === "COMPLETED" ? isoDay(new Date()) : ""),
    odometer: existing?.odometer?.toString() ?? "", cost: existing?.costCents != null ? (existing.costCents / 100).toFixed(2) : "", vendor: existing?.vendor ?? "", notes: existing?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = {
      type: form.type, status: form.status, scheduledFor: form.scheduledFor || null, completedAt: form.completedAt || null,
      odometer: form.odometer ? Number(form.odometer) : null, costCents: form.cost ? Math.round(Number(form.cost) * 100) : null, vendor: form.vendor || null, notes: form.notes || null,
    };
    try {
      if (existing?.id) await api(`/fleet/${vehicleId}/maintenance/${existing.id}`, { method: "PATCH", json: body });
      else await api(`/fleet/${vehicleId}/maintenance`, { method: "POST", json: body });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function remove() {
    if (!existing?.id) return;
    await api(`/fleet/${vehicleId}/maintenance/${existing.id}`, { method: "DELETE" }).then(onSaved).catch((e: Error) => setError(e.message));
  }

  return (
    <Modal open onClose={onClose} title={existing?.id ? "Maintenance record" : "Schedule or log maintenance"}
      footer={<>{existing?.id && <ConfirmButton className="btn-ghost mr-auto" confirmText="Delete record?" onConfirm={remove}><Trash2 className="h-4 w-4" aria-hidden /> Delete</ConfirmButton>}<button className="btn-ghost" onClick={onClose}>Cancel</button><button form="maint-form" type="submit" className="btn-primary" disabled={!form.type}>Save</button></>}>
      <form id="maint-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <ErrorNote message={error} />
        <div className="sm:col-span-2"><Field label="Work" htmlFor="m-type"><input id="m-type" className={inputCls} value={form.type} onChange={set("type")} placeholder="e.g. Oil change, liftgate service, brake inspection" required /></Field></div>
        <Field label="Status" htmlFor="m-status"><select id="m-status" className={inputCls} value={form.status} onChange={set("status")}><option value="SCHEDULED">Scheduled</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></Field>
        {form.status === "COMPLETED" ? (
          <Field label="Completed on" htmlFor="m-done"><input id="m-done" type="date" className={inputCls} value={form.completedAt} onChange={set("completedAt")} /></Field>
        ) : (
          <Field label="Scheduled for" htmlFor="m-sched"><input id="m-sched" type="date" className={inputCls} value={form.scheduledFor} onChange={set("scheduledFor")} /></Field>
        )}
        <Field label="Cost (USD)" htmlFor="m-cost"><input id="m-cost" inputMode="decimal" className={inputCls} value={form.cost} onChange={set("cost")} placeholder="0.00" /></Field>
        <Field label="Odometer (mi)" htmlFor="m-odo"><input id="m-odo" inputMode="numeric" className={inputCls} value={form.odometer} onChange={set("odometer")} /></Field>
        <div className="sm:col-span-2"><Field label="Vendor / shop" htmlFor="m-vendor"><input id="m-vendor" className={inputCls} value={form.vendor} onChange={set("vendor")} /></Field></div>
        <div className="sm:col-span-2"><Field label="Notes" htmlFor="m-notes"><textarea id="m-notes" rows={2} className={inputCls} value={form.notes} onChange={set("notes")} /></Field></div>
      </form>
    </Modal>
  );
}

function VehicleDocuments({ vehicle: v, canWrite, onChange }: { vehicle: Vehicle; canWrite: boolean; onChange: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("registration");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titles: Record<string, string> = { registration: "Registration", insurance: "Insurance card", inspection: "Inspection report", title: "Title", other: "Document" };

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", titles[docType]);
    fd.append("docType", docType);
    if (expiresAt) fd.append("expiresAt", expiresAt);
    try {
      await api(`/fleet/${v.id}/documents`, { method: "POST", body: fd });
      (e.target as HTMLFormElement).reset();
      setFile(null);
      setExpiresAt("");
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Documents">
      <ErrorNote message={error} />
      {v.documents.length === 0 ? <p className="text-sm text-muted">Registration, insurance and inspection documents live here.</p> : (
        <ul className="divide-y divide-line text-sm">
          {v.documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2.5">
              <a href={fileUrl("fleet", d.uploadId)} className="flex min-w-0 items-center gap-2 font-medium text-navy hover:underline"><FileText className="h-4 w-4 shrink-0 text-orange" aria-hidden /><span className="truncate">{d.title}</span></a>
              <span className="flex shrink-0 items-center gap-1">
                {d.expiresAt && <ExpiryBadge date={d.expiresAt} />}
                {canWrite && <ConfirmButton className="rounded-full p-1.5 text-muted hover:bg-cloud" confirmText="Delete?" onConfirm={() => api(`/fleet/${v.id}/documents/${d.id}`, { method: "DELETE" }).then(onChange).catch((e: Error) => setError(e.message))}><Trash2 className="h-4 w-4" aria-label={`Delete ${d.title}`} /></ConfirmButton>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form onSubmit={upload} className="mt-4 grid gap-3 border-t border-line pt-4">
          <Field label="Document type" htmlFor="vd-type" hint="Registration, insurance and inspection update the expiry on this vehicle">
            <select id="vd-type" className={inputCls} value={docType} onChange={(e) => setDocType(e.target.value)}>{Object.entries(titles).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          <Field label="Expires" htmlFor="vd-exp"><input id="vd-exp" type="date" className={inputCls} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></Field>
          <Field label="File" htmlFor="vd-file"><input id="vd-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white" /></Field>
          <button className="btn-navy" disabled={!file || busy}><Upload className="h-4 w-4" aria-hidden /> {busy ? "Uploading…" : "Upload"}</button>
        </form>
      )}
    </Panel>
  );
}
