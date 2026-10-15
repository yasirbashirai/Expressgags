"use client";

/**
 * Team member profile: editable details (role, market, license), availability for the week,
 * credentials, private documents, assignment history and the app/admin login link (owner only).
 */
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, FileText, KeyRound, Pencil, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";
import { AdminTitle, Panel, useAdminUser } from "@/components/admin/admin-shell";
import { api, ApiError, dateTime } from "@/components/admin/api";
import { Badge } from "@/components/admin/labels";
import { ConfirmButton, EmptyState, Field, inputCls } from "@/components/admin/ui";
import { AvailabilityWeek } from "./availability-week";
import { CredentialForm, type Credential } from "./credential-form";
import {
  CREDENTIAL_TYPE_LABEL, ErrorNote, ExpiryBadge, facilityLabel, fileUrl, isoDay, MARKET_OPTIONS, marketName, ROLE_LABEL, shortDate,
  STAFF_ROLE_LABEL, StatusBadge, useApi,
} from "./shared";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  phone: string | null;
  email: string | null;
  homeMarket: string | null;
  status: string;
  employmentType: string | null;
  hireDate: string | null;
  licenseNumber: string | null;
  licenseClass: string | null;
  licenseExpiresAt: string | null;
  internalNotes: string | null;
  user: { id: string; email: string; role: string; active: boolean; lastLoginAt: string | null; totpEnabled: boolean } | null;
  credentials: Credential[];
  documents: { id: string; title: string; uploadId: string; expiresAt: string | null; createdAt: string }[];
  assignments: { id: string; role: string; status: string; assignedAt: string; order: { id: string; reference: string; serviceDate: string; status: string; market: string; serviceType: string }; vehicle: { id: string; unitNumber: string } | null }[];
};

export function TeamDetail({ id }: { id: string }) {
  const user = useAdminUser();
  const canWrite = user?.role === "OWNER" || user?.role === "STAFF";
  const isOwner = user?.role === "OWNER";
  const { data, error, reload } = useApi<{ employee: Employee }>(`/team/${id}`);
  const [editing, setEditing] = useState(false);
  const [cred, setCred] = useState<{ open: boolean; existing?: Credential | null }>({ open: false });
  const e = data?.employee;

  if (error) return <ErrorNote message={error} />;
  if (!e) return <p className="py-10 text-center text-sm text-muted">Loading profile…</p>;

  return (
    <>
      <Link href="/admin/team" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-ink hover:text-navy"><ArrowLeft className="h-4 w-4" aria-hidden /> Team</Link>
      <AdminTitle
        title={`${e.firstName} ${e.lastName}`}
        sub={`${ROLE_LABEL[e.role] ?? e.role} · ${marketName(e.homeMarket)} · private record`}
        actions={canWrite && !editing && <button className="btn-ghost !py-2" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" aria-hidden /> Edit details</button>}
      />

      <div className="grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          {editing ? (
            <EditEmployee employee={e} onDone={() => { setEditing(false); reload(); }} />
          ) : (
            <Panel title="Details">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Item label="Status"><StatusBadge status={e.status} /></Item>
                <Item label="Employment">{e.employmentType ? e.employmentType.charAt(0).toUpperCase() + e.employmentType.slice(1) : "-"}</Item>
                <Item label="Phone">{e.phone ? <a className="text-navy underline" href={`tel:${e.phone}`}>{e.phone}</a> : "-"}</Item>
                <Item label="Email">{e.email ? <a className="break-all text-navy underline" href={`mailto:${e.email}`}>{e.email}</a> : "-"}</Item>
                <Item label="Hire date">{shortDate(e.hireDate)}</Item>
                <Item label="License">{[e.licenseClass, e.licenseNumber].filter(Boolean).join(" · ") || "-"}</Item>
                <Item label="License expires"><ExpiryBadge date={e.licenseExpiresAt} /></Item>
                <Item label="Internal notes"><span className="whitespace-pre-line">{e.internalNotes || "-"}</span></Item>
              </dl>
            </Panel>
          )}

          <Panel title="Availability">
            <AvailabilityWeek employees={[e]} employeeId={e.id} canEdit={user?.role !== "ACCOUNTING"} />
          </Panel>

          <Panel
            title="Credentials"
            action={canWrite && <button className="btn-ghost !px-3 !py-1.5" onClick={() => setCred({ open: true, existing: null })}><Plus className="h-4 w-4" aria-hidden /> Add</button>}
          >
            {e.credentials.length === 0 ? (
              <p className="text-sm text-muted">No airport, port or facility credentials recorded.</p>
            ) : (
              <ul className="divide-y divide-line">
                {e.credentials.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 text-orange" aria-hidden />
                      <div>
                        <p className="font-semibold text-navy">{CREDENTIAL_TYPE_LABEL[c.type] ?? c.type} · {facilityLabel(c.facility)}</p>
                        <p className="text-xs text-muted">{c.identifier || "No number recorded"}{c.uploadId && <> · <a className="underline" href={fileUrl("team", c.uploadId)}>scan</a></>}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ExpiryBadge date={c.expiresAt} />
                      {canWrite && <button className="rounded-full p-1.5 text-muted hover:bg-cloud" onClick={() => setCred({ open: true, existing: c })} aria-label={`Edit ${CREDENTIAL_TYPE_LABEL[c.type]}`}><Pencil className="h-4 w-4" /></button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Assignment history">
            {e.assignments.length === 0 ? (
              <p className="text-sm text-muted">No assignments yet. Jobs appear here when dispatch assigns this person.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {e.assignments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span>
                      <Link href={`/admin/orders/${a.order.id}`} className="font-semibold text-navy hover:underline">{a.order.reference}</Link>
                      <span className="text-muted"> · {shortDate(a.order.serviceDate)} · {marketName(a.order.market)}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-ink">
                      {ROLE_LABEL[a.role] ?? a.role}{a.vehicle && <> · Unit {a.vehicle.unitNumber}</>}
                      <Badge className="bg-cloud text-slate-ink ring-line">{a.status.replace(/_/g, " ").toLowerCase()}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Documents employee={e} canWrite={canWrite} onChange={reload} />
          <LoginPanel employee={e} isOwner={isOwner} onChange={reload} />
        </div>
      </div>

      {cred.open && <CredentialForm open holder={{ employeeId: e.id }} existing={cred.existing} onClose={() => setCred({ open: false })} onSaved={() => { setCred({ open: false }); reload(); }} />}
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 text-charcoal">{children}</dd>
    </div>
  );
}

function EditEmployee({ employee: e, onDone }: { employee: Employee; onDone: () => void }) {
  const [form, setForm] = useState({
    firstName: e.firstName, lastName: e.lastName, role: e.role, phone: e.phone ?? "", email: e.email ?? "", homeMarket: e.homeMarket ?? "",
    status: e.status, employmentType: e.employmentType ?? "employee", hireDate: isoDay(e.hireDate), licenseNumber: e.licenseNumber ?? "",
    licenseClass: e.licenseClass ?? "", licenseExpiresAt: isoDay(e.licenseExpiresAt), internalNotes: e.internalNotes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: ev.target.value });

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/team/${e.id}`, { method: "PATCH", json: { ...form, hireDate: form.hireDate || null, licenseExpiresAt: form.licenseExpiresAt || null, homeMarket: form.homeMarket || null } });
      onDone();
    } catch (err) {
      const ae = err as ApiError;
      setError(ae.message);
      setErrors(Object.fromEntries((ae.details ?? []).map((d) => [d.path, d.message])));
      setBusy(false);
    }
  }

  return (
    <Panel title="Edit details">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <ErrorNote message={error} />
        <Field label="First name" htmlFor="ed-first" error={errors.firstName}><input id="ed-first" className={inputCls} value={form.firstName} onChange={set("firstName")} /></Field>
        <Field label="Last name" htmlFor="ed-last" error={errors.lastName}><input id="ed-last" className={inputCls} value={form.lastName} onChange={set("lastName")} /></Field>
        <Field label="Role" htmlFor="ed-role"><select id="ed-role" className={inputCls} value={form.role} onChange={set("role")}>{Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Status" htmlFor="ed-status" hint="Inactive also turns off any app login">
          <select id="ed-status" className={inputCls} value={form.status} onChange={set("status")}><option value="ACTIVE">Active</option><option value="ON_LEAVE">On leave</option><option value="INACTIVE">Inactive</option></select>
        </Field>
        <Field label="Phone" htmlFor="ed-phone"><input id="ed-phone" type="tel" className={inputCls} value={form.phone} onChange={set("phone")} /></Field>
        <Field label="Email" htmlFor="ed-email" error={errors.email}><input id="ed-email" type="email" className={inputCls} value={form.email} onChange={set("email")} /></Field>
        <Field label="Home market" htmlFor="ed-market"><select id="ed-market" className={inputCls} value={form.homeMarket} onChange={set("homeMarket")}><option value="">Not set</option>{MARKET_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
        <Field label="Employment type" htmlFor="ed-type"><select id="ed-type" className={inputCls} value={form.employmentType} onChange={set("employmentType")}><option value="employee">Employee</option><option value="contractor">Contractor</option></select></Field>
        <Field label="Hire date" htmlFor="ed-hire"><input id="ed-hire" type="date" className={inputCls} value={form.hireDate} onChange={set("hireDate")} /></Field>
        <Field label="License class" htmlFor="ed-lclass" hint="e.g. Class C, CDL-B"><input id="ed-lclass" className={inputCls} value={form.licenseClass} onChange={set("licenseClass")} /></Field>
        <Field label="License number" htmlFor="ed-lnum"><input id="ed-lnum" className={inputCls} value={form.licenseNumber} onChange={set("licenseNumber")} autoComplete="off" /></Field>
        <Field label="License expires" htmlFor="ed-lexp"><input id="ed-lexp" type="date" className={inputCls} value={form.licenseExpiresAt} onChange={set("licenseExpiresAt")} /></Field>
        <div className="sm:col-span-2"><Field label="Internal notes" htmlFor="ed-notes"><textarea id="ed-notes" rows={3} className={inputCls} value={form.internalNotes} onChange={set("internalNotes")} /></Field></div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </Panel>
  );
}

function Documents({ employee: e, canWrite, onChange }: { employee: Employee; canWrite: boolean; onChange: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(ev: React.FormEvent) {
    ev.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title || file.name);
    if (expiresAt) fd.append("expiresAt", expiresAt);
    try {
      await api(`/team/${e.id}/documents`, { method: "POST", body: fd });
      setFile(null);
      setTitle("");
      setExpiresAt("");
      (ev.target as HTMLFormElement).reset();
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(docId: string) {
    await api(`/team/${e.id}/documents/${docId}`, { method: "DELETE" }).catch((err: Error) => setError(err.message));
    onChange();
  }

  return (
    <Panel title="Documents">
      <ErrorNote message={error} />
      {e.documents.length === 0 ? (
        <EmptyState title="No documents" text="License copies, I-9 / W-9, training certificates. Stored privately." />
      ) : (
        <ul className="mb-4 divide-y divide-line text-sm">
          {e.documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2.5">
              <a href={fileUrl("team", d.uploadId)} className="flex min-w-0 items-center gap-2 font-medium text-navy hover:underline">
                <FileText className="h-4 w-4 shrink-0 text-orange" aria-hidden /> <span className="truncate">{d.title}</span>
              </a>
              <span className="flex shrink-0 items-center gap-2">
                {d.expiresAt && <ExpiryBadge date={d.expiresAt} />}
                {canWrite && <ConfirmButton className="rounded-full p-1.5 text-muted hover:bg-cloud" confirmText="Delete?" onConfirm={() => remove(d.id)}><Trash2 className="h-4 w-4" aria-label={`Delete ${d.title}`} /></ConfirmButton>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form onSubmit={upload} className="mt-4 grid gap-3 border-t border-line pt-4">
          <Field label="Upload a document" htmlFor="doc-file" hint="PDF or image, up to 10 MB">
            <input id="doc-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx" onChange={(ev) => setFile(ev.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Field label="Title" htmlFor="doc-title"><input id="doc-title" className={inputCls} value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="e.g. Driver license copy" /></Field>
            <Field label="Expires (optional)" htmlFor="doc-exp"><input id="doc-exp" type="date" className={inputCls} value={expiresAt} onChange={(ev) => setExpiresAt(ev.target.value)} /></Field>
          </div>
          <button className="btn-navy" disabled={!file || busy}><Upload className="h-4 w-4" aria-hidden /> {busy ? "Uploading…" : "Upload"}</button>
        </form>
      )}
    </Panel>
  );
}

function LoginPanel({ employee: e, isOwner, onChange }: { employee: Employee; isOwner: boolean; onChange: () => void }) {
  const [email, setEmail] = useState(e.email ?? "");
  const [role, setRole] = useState(e.role === "DISPATCH" ? "DISPATCHER" : e.role === "OFFICE" || e.role === "MANAGEMENT" ? "STAFF" : "DRIVER");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    try {
      await api(`/team/${e.id}/login`, { method: "POST", json: { email, role } });
      setMsg(`Invite sent to ${email}. The link is valid for 72 hours.`);
      onChange();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }
  async function remove() {
    setError(null);
    try {
      await api(`/team/${e.id}/login`, { method: "DELETE" });
      setMsg("Login removed and signed out everywhere.");
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Panel title="App & admin login">
      <ErrorNote message={error} />
      {msg && <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">{msg}</p>}
      {e.user ? (
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-orange" aria-hidden /> <span className="break-all font-medium text-navy">{e.user.email}</span></p>
          <p className="text-slate-ink">{STAFF_ROLE_LABEL[e.user.role] ?? e.user.role} · {e.user.active ? "active" : "inactive"} · 2FA {e.user.totpEnabled ? "on" : "off"}</p>
          <p className="text-xs text-muted">Last sign-in: {e.user.lastLoginAt ? dateTime(e.user.lastLoginAt) : "never"}</p>
          {isOwner && <ConfirmButton className="btn-ghost mt-2 !py-1.5" confirmText="Click again to remove login" onConfirm={remove}>Remove login</ConfirmButton>}
        </div>
      ) : isOwner ? (
        <form onSubmit={create} className="grid gap-3">
          <p className="text-sm text-slate-ink">Give this person access to the driver app or the admin. They receive an invite to set their own password.</p>
          <Field label="Login email" htmlFor="login-email"><input id="login-email" type="email" className={inputCls} value={email} onChange={(ev) => setEmail(ev.target.value)} required /></Field>
          <Field label="Access" htmlFor="login-role">
            <select id="login-role" className={inputCls} value={role} onChange={(ev) => setRole(ev.target.value)}>
              <option value="DRIVER">Driver app only</option>
              <option value="DISPATCHER">Dispatcher (admin)</option>
              <option value="STAFF">Office staff (admin)</option>
              <option value="ACCOUNTING">Accounting (admin)</option>
            </select>
          </Field>
          <button className="btn-navy" disabled={!email}>Send invite</button>
        </form>
      ) : (
        <p className="text-sm text-muted">No login. Only the owner can create logins.</p>
      )}
    </Panel>
  );
}
