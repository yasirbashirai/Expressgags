"use client";

/**
 * Add / edit a credential (TWIC, airport badge, port pass, permits, company COI, DOT/MC, bonding),
 * optionally attaching a scan. Used by team profiles, vehicle profiles and the credentials register.
 */
import { useState } from "react";
import { api, ApiError } from "@/components/admin/api";
import { Field, inputCls, Modal } from "@/components/admin/ui";
import { CREDENTIAL_TYPE_LABEL, ErrorNote, FACILITY_OPTIONS, isoDay } from "./shared";

export type Credential = {
  id: string;
  employeeId: string | null;
  vehicleId: string | null;
  facility: string;
  type: string;
  identifier: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  uploadId: string | null;
  notes: string | null;
  employee?: { id: string; firstName: string; lastName: string } | null;
  vehicle?: { id: string; unitNumber: string } | null;
};

export function CredentialForm({
  open,
  onClose,
  onSaved,
  holder,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Who it belongs to (omit for company-level) */
  holder?: { employeeId?: string; vehicleId?: string };
  existing?: Credential | null;
}) {
  const [form, setForm] = useState({
    facility: existing?.facility ?? (holder ? "MIA" : "company"),
    type: existing?.type ?? (holder?.vehicleId ? "VEHICLE_PERMIT" : holder ? "AIRPORT_BADGE" : "INSURANCE_COI"),
    identifier: existing?.identifier ?? "",
    issuedAt: isoDay(existing?.issuedAt),
    expiresAt: isoDay(existing?.expiresAt),
    notes: existing?.notes ?? "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, issuedAt: form.issuedAt || null, expiresAt: form.expiresAt || null, ...(existing ? {} : { employeeId: holder?.employeeId ?? null, vehicleId: holder?.vehicleId ?? null }) };
      const r = existing
        ? await api<{ credential: Credential }>(`/team/credentials/${existing.id}`, { method: "PATCH", json: body })
        : await api<{ credential: Credential }>("/team/credentials", { method: "POST", json: body });
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        await api(`/team/credentials/${r.credential.id}/file`, { method: "POST", body: fd });
      }
      onSaved();
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? "Edit credential" : "Add credential"}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button type="submit" form="cred-form" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save credential"}</button></>}
    >
      <form id="cred-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <ErrorNote message={error} />
        <Field label="Type" htmlFor="cred-type">
          <select id="cred-type" className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {Object.entries(CREDENTIAL_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Facility" htmlFor="cred-facility">
          <select id="cred-facility" className={inputCls} value={form.facility} onChange={(e) => setForm({ ...form, facility: e.target.value })}>
            {FACILITY_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </Field>
        <Field label="Number / identifier" htmlFor="cred-id" hint="Stored privately, never shown on the website">
          <input id="cred-id" className={inputCls} value={form.identifier} maxLength={120} onChange={(e) => setForm({ ...form, identifier: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="Issued" htmlFor="cred-issued"><input id="cred-issued" type="date" className={inputCls} value={form.issuedAt} onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} /></Field>
        <Field label="Expires" htmlFor="cred-expires" hint="Reminders start 30 days before"><input id="cred-expires" type="date" className={inputCls} value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></Field>
        <Field label={existing?.uploadId ? "Replace scan (optional)" : "Scan or copy (optional)"} htmlFor="cred-file" hint="PDF, JPG, PNG, WEBP, HEIC up to 10 MB">
          <input id="cred-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes" htmlFor="cred-notes"><textarea id="cred-notes" rows={2} className={inputCls} value={form.notes} maxLength={2000} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
      </form>
    </Modal>
  );
}
