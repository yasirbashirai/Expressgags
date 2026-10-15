"use client";

/**
 * Users & security (OWNER only): staff accounts, invites, roles, deactivation, password-reset links,
 * forced sign-out, unlock, lost-2FA reset, and the audit-log viewer.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { KeyRound, LogOut, MailPlus, ShieldAlert, ShieldCheck, Unlock, UserCog } from "lucide-react";
import { AdminTitle, Panel, useAdminUser } from "@/components/admin/admin-shell";
import { api, ApiError, dateTime } from "@/components/admin/api";
import { Badge } from "@/components/admin/labels";
import { ConfirmButton, DataTable, EmptyState, Field, inputCls, Modal, Tabs } from "@/components/admin/ui";
import { ErrorNote, selectCls, STAFF_ROLE_LABEL, useApi } from "./shared";

type UserRow = {
  id: string; email: string; name: string | null; role: string; active: boolean; totpEnabled: boolean; lastLoginAt: string | null;
  locked: boolean; mustChangePassword: boolean; createdAt: string; employee: { id: string; firstName: string; lastName: string } | null;
};

export function UsersAdmin() {
  const me = useAdminUser();
  const [tab, setTab] = useState<"users" | "audit">("users");
  if (me && me.role !== "OWNER") {
    return (
      <>
        <AdminTitle title="Users & security" />
        <EmptyState title="Owner access only" text="Only the owner can manage staff accounts. You can manage your own password and two-factor sign-in under My security." action={<Link href="/admin/users/me" className="btn-navy">My security</Link>} />
      </>
    );
  }
  return (
    <>
      <AdminTitle title="Users & security" sub="Who can sign in to the admin and driver app, with what access." actions={<Link href="/admin/users/me" className="btn-ghost !py-2"><ShieldCheck className="h-4 w-4" aria-hidden /> My security</Link>} />
      <Tabs tabs={[{ value: "users", label: "Users" }, { value: "audit", label: "Audit log" }]} value={tab} onChange={setTab} />
      {tab === "users" ? <UsersTab meId={me?.id} /> : <AuditTab />}
    </>
  );
}

function UsersTab({ meId }: { meId?: string }) {
  const { data, error, reload } = useApi<{ users: UserRow[] }>("/users");
  const [inviting, setInviting] = useState(false);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <>
      <div className="mb-4 flex justify-end"><button className="btn-primary !py-2" onClick={() => setInviting(true)}><MailPlus className="h-4 w-4" aria-hidden /> Invite user</button></div>
      <ErrorNote message={error} />
      {msg && <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{msg}</p>}
      <DataTable
        rows={data?.users ?? []}
        rowKey={(u) => u.id}
        onRowClick={(u) => setSelected(u)}
        empty={<EmptyState title={data ? "No users" : "Loading…"} />}
        columns={[
          { key: "email", header: "User", cell: (u) => <span><span className="block break-all font-semibold text-navy">{u.email}</span>{u.name && <span className="text-xs text-muted">{u.name}</span>}</span> },
          { key: "role", header: "Access", cell: (u) => STAFF_ROLE_LABEL[u.role] ?? u.role },
          {
            key: "state",
            header: "State",
            cell: (u) => (
              <span className="flex flex-wrap justify-end gap-1 md:justify-start">
                <Badge className={u.active ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-cloud text-muted ring-line"}>{u.active ? "Active" : "Deactivated"}</Badge>
                {u.locked && <Badge className="bg-rose-50 text-rose-800 ring-rose-200">Locked</Badge>}
                {u.mustChangePassword && <Badge className="bg-amber-50 text-amber-800 ring-amber-200">Invite pending</Badge>}
              </span>
            ),
          },
          { key: "2fa", header: "2FA", cell: (u) => (u.totpEnabled ? <Badge className="bg-navy-50 text-navy ring-navy-100">On</Badge> : <span className="text-xs text-muted">Off</span>) },
          { key: "last", header: "Last sign-in", cell: (u) => <span className="text-xs">{u.lastLoginAt ? dateTime(u.lastLoginAt) : "Never"}</span> },
        ]}
      />
      <InviteUser open={inviting} onClose={() => setInviting(false)} onDone={(m) => { setInviting(false); setMsg(m); reload(); }} />
      {selected && <ManageUser user={selected} isMe={selected.id === meId} onClose={() => setSelected(null)} onDone={(m) => { setSelected(null); setMsg(m); reload(); }} />}
    </>
  );
}

function InviteUser({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [form, setForm] = useState({ email: "", name: "", role: "STAFF" });
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ emailStatus: string }>("/users", { method: "POST", json: form });
      setForm({ email: "", name: "", role: "STAFF" });
      onDone(`Invite ${r.emailStatus === "SENT" ? "sent" : "created (email is logged until SMTP is configured)"} for ${form.email}. The link is valid for 72 hours.`);
    } catch (err) {
      setError((err as ApiError).message);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Invite a user" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button form="invite-user" type="submit" className="btn-primary" disabled={!form.email}>Send invite</button></>}>
      <form id="invite-user" onSubmit={submit} className="grid gap-4">
        <ErrorNote message={error} />
        <Field label="Email" htmlFor="inv-email"><input id="inv-email" type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
        <Field label="Name (optional)" htmlFor="inv-name"><input id="inv-name" className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Access" htmlFor="inv-role" hint="Drivers sign in to the driver app only; office roles use this admin.">
          <select id="inv-role" className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {Object.entries(STAFF_ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <p className="text-xs text-muted">To give a driver or helper a login tied to their team profile, use the Team page instead.</p>
      </form>
    </Modal>
  );
}

function ManageUser({ user: u, isMe, onClose, onDone }: { user: UserRow; isMe: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [role, setRole] = useState(u.role);
  const [name, setName] = useState(u.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setError(null);
    try {
      await fn();
      onDone(msg);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal open onClose={onClose} title={u.email}>
      <ErrorNote message={error} />
      <div className="grid gap-4">
        <Field label="Name" htmlFor="mu-name"><input id="mu-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Access" htmlFor="mu-role" hint={isMe ? "You cannot change your own access." : "Changing access signs the user out everywhere."}>
          <select id="mu-role" className={inputCls} value={role} disabled={isMe} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(STAFF_ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <button className="btn-navy" onClick={() => run(() => api(`/users/${u.id}`, { method: "PATCH", json: { name, ...(isMe ? {} : { role }) } }), "User updated.")}><UserCog className="h-4 w-4" aria-hidden /> Save</button>
        <div className="grid gap-2 border-t border-line pt-4 sm:grid-cols-2">
          <button className="btn-ghost" onClick={() => run(() => api(`/users/${u.id}/reset-password`, { method: "POST" }), `Password reset link sent to ${u.email} (valid 1 hour).`)}><KeyRound className="h-4 w-4" aria-hidden /> Send reset link</button>
          <button className="btn-ghost" onClick={() => run(() => api(`/users/${u.id}/force-sign-out`, { method: "POST" }), "Signed out on every device.")}><LogOut className="h-4 w-4" aria-hidden /> Sign out everywhere</button>
          {u.locked && <button className="btn-ghost" onClick={() => run(() => api(`/users/${u.id}/unlock`, { method: "POST" }), "Account unlocked.")}><Unlock className="h-4 w-4" aria-hidden /> Unlock</button>}
          {u.totpEnabled && !isMe && <ConfirmButton className="btn-ghost" confirmText="Click again to reset 2FA" onConfirm={() => run(() => api(`/users/${u.id}/reset-2fa`, { method: "POST" }), "Two-factor sign-in turned off. They must set it up again.")}><ShieldAlert className="h-4 w-4" aria-hidden /> Reset 2FA (lost phone)</ConfirmButton>}
          {!isMe && (
            <ConfirmButton className="btn-ghost" confirmText={u.active ? "Click again to deactivate" : "Click again to reactivate"} onConfirm={() => run(() => api(`/users/${u.id}`, { method: "PATCH", json: { active: !u.active } }), u.active ? "User deactivated." : "User reactivated.")}>
              {u.active ? "Deactivate" : "Reactivate"}
            </ConfirmButton>
          )}
        </div>
      </div>
    </Modal>
  );
}

type AuditEntry = { id: string; at: string; user: string | null; action: string; entity: string; entityId: string | null; detail: unknown };

function AuditTab() {
  const [f, setF] = useState({ entity: "", action: "", from: "", to: "", page: 1 });
  const qs = useMemo(() => new URLSearchParams(Object.entries(f).filter(([, v]) => v !== "" && v !== 0).map(([k, v]) => [k, String(v)])).toString(), [f]);
  const { data, error } = useApi<{ total: number; page: number; pageSize: number; entities: string[]; entries: AuditEntry[] }>(`/users/audit?${qs}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <Panel>
      <div className="mb-4 flex flex-wrap gap-2">
        <select aria-label="Entity" className={selectCls} value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value, page: 1 })}>
          <option value="">All records</option>
          {(data?.entities ?? []).map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <input aria-label="Action contains" className={`${selectCls} w-40`} placeholder="Action (e.g. login)" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value, page: 1 })} />
        <label className="flex items-center gap-1 text-sm text-muted">From <input type="date" className={selectCls} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, page: 1 })} /></label>
        <label className="flex items-center gap-1 text-sm text-muted">To <input type="date" className={selectCls} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value, page: 1 })} /></label>
      </div>
      <ErrorNote message={error} />
      <DataTable
        rows={data?.entries ?? []}
        rowKey={(r) => r.id}
        empty={<EmptyState title={data ? "No matching entries" : "Loading…"} />}
        columns={[
          { key: "at", header: "When", cell: (r) => <span className="whitespace-nowrap text-xs">{dateTime(r.at)}</span> },
          { key: "user", header: "User", cell: (r) => <span className="break-all text-xs">{r.user ?? "system"}</span> },
          { key: "action", header: "Action", cell: (r) => <Badge className={/fail|lock/.test(r.action) ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-cloud text-slate-ink ring-line"}>{r.action}</Badge> },
          { key: "entity", header: "Record", cell: (r) => <span className="text-xs">{r.entity}{r.entityId ? ` · ${r.entityId.slice(-6)}` : ""}</span> },
          { key: "detail", header: "Detail", cell: (r) => <code className="block max-w-[320px] truncate text-[11px] text-muted">{r.detail ? JSON.stringify(r.detail) : ""}</code>, mobile: false },
        ]}
      />
      {data && pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button className="btn-ghost !py-1.5" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>Previous</button>
          <span className="text-muted">Page {data.page} of {pages} · {data.total} entries</span>
          <button className="btn-ghost !py-1.5" disabled={f.page >= pages} onClick={() => setF({ ...f, page: f.page + 1 })}>Next</button>
        </div>
      )}
    </Panel>
  );
}
