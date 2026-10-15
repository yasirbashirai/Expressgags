"use client";

/**
 * Admin: customer & staff messages — sent log (filters, detail, resend), the outgoing queue
 * (quiet-hours holds, scheduled surveys, retries) and contact opt-outs.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Mail, MessageSquare, RefreshCw, Send, Settings2, Trash2 } from "lucide-react";
import { AdminTitle, Panel } from "@/components/admin/admin-shell";
import { api, ApiError, dateTime } from "@/components/admin/api";
import { Badge } from "@/components/admin/labels";
import { ConfirmButton, DataTable, EmptyState, Field, inputCls, Modal, StatCard, Tabs, Toolbar, type Column } from "@/components/admin/ui";

type Row = { id: string; channel: string; to: string; template: string; subject: string | null; status: string; provider: string | null; error: string | null; orderId: string | null; orderReference: string | null; createdAt: string };
type Job = { id: string; channel: string; to: string; template: string; status: string; scheduledFor: string; attempts: number; lastError: string | null; orderId: string | null };
type OptOut = { id: string; channel: string; address: string; source: string; note: string | null; createdAt: string };

export const STATUS_TONE: Record<string, string> = {
  SENT: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  LOGGED: "bg-navy-50 text-navy ring-navy-100",
  FAILED: "bg-rose-50 text-rose-800 ring-rose-200",
  SKIPPED: "bg-cloud text-muted ring-line",
  PENDING: "bg-orange-50 text-orange-700 ring-orange-200",
  PROCESSING: "bg-sky-50 text-sky-800 ring-sky-200",
  CANCELLED: "bg-cloud text-muted ring-line",
};

const STATUS_HINT: Record<string, string> = {
  LOGGED: "Recorded only: the email or SMS provider is not connected yet",
  SKIPPED: "Not sent (opt-out, feature off or preference)",
};

export const templateLabel = (t: string) =>
  t.replace(/^staff\./, "Staff: ").replace(/^order\./, "Order: ").replace(/^quotation\./, "Quotation: ").replace(/^invoice\./, "Invoice: ").replace(/^payment\./, "Payment: ").replace(/^customer\./, "Account: ").replace(/^survey\./, "Survey: ").replace(/^storage\./, "Storage: ").replace(/_/g, " ");

const ChannelIcon = ({ c }: { c: string }) => (c === "email" ? <Mail className="h-4 w-4 text-navy" aria-label="Email" /> : <MessageSquare className="h-4 w-4 text-orange-700" aria-label={c === "whatsapp" ? "WhatsApp" : "SMS"} />);

export function AdminNotifications() {
  const [tab, setTab] = useState<"log" | "queue" | "optouts">("log");
  return (
    <>
      <AdminTitle
        title="Notifications"
        sub="Every customer and staff message the platform sends, with delivery status."
        actions={
          <>
            <Link href="/admin/notifications/templates" className="btn-ghost !py-2">Templates</Link>
            <Link href="/admin/notifications/settings" className="btn-navy !py-2"><Settings2 className="h-4 w-4" aria-hidden /> Settings</Link>
          </>
        }
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "log", label: "Sent log" }, { value: "queue", label: "Queue" }, { value: "optouts", label: "Opt-outs" }]} />
      {tab === "log" && <SentLog />}
      {tab === "queue" && <Queue />}
      {tab === "optouts" && <OptOuts />}
    </>
  );
}

function SentLog() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ channel: "", status: "", template: "", q: "" });
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page) });
    Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
    api<{ notifications: Row[]; counts: Record<string, number>; total: number }>(`/notifications?${qs}`)
      .then((r) => {
        setRows(r.notifications);
        setCounts(r.counts);
        setTotal(r.total);
      })
      .catch((e: ApiError) => setError(e.message));
  }, [page, filters]);
  useEffect(load, [load]);

  const columns: Column<Row>[] = [
    { key: "when", header: "When", cell: (r) => <span className="whitespace-nowrap text-xs text-slate-ink">{dateTime(r.createdAt)}</span> },
    { key: "ch", header: "Channel", cell: (r) => <span className="inline-flex items-center gap-1.5 capitalize"><ChannelIcon c={r.channel} />{r.channel}</span> },
    { key: "tpl", header: "Message", cell: (r) => <span className="font-medium text-navy">{templateLabel(r.template)}</span> },
    { key: "to", header: "To", cell: (r) => <span className="break-all text-xs">{r.to}</span> },
    { key: "order", header: "Order", cell: (r) => (r.orderId ? <Link onClick={(e) => e.stopPropagation()} href={`/admin/orders/${r.orderId}`} className="text-orange-700 underline">{r.orderReference ?? "Open"}</Link> : <span className="text-xs text-muted">None</span>) },
    { key: "status", header: "Status", cell: (r) => <span title={STATUS_HINT[r.status]}><Badge className={STATUS_TONE[r.status] ?? ""}>{r.status}</Badge></span> },
  ];

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sent" value={counts.SENT ?? 0} hint="Delivered to the provider" />
        <StatCard label="Logged" value={counts.LOGGED ?? 0} hint="Provider not connected yet" />
        <StatCard label="Skipped" value={counts.SKIPPED ?? 0} hint="Opt-outs and preferences" />
        <StatCard label="Failed" value={counts.FAILED ?? 0} hint="After 5 attempts" tone={(counts.FAILED ?? 0) > 0 ? "orange" : "white"} />
      </div>
      <Toolbar>
        <label className="sr-only" htmlFor="n-q">Search</label>
        <input id="n-q" className={`${inputCls} min-w-0 basis-full sm:!w-auto sm:basis-auto sm:flex-1 sm:max-w-xs`} placeholder="Search email, phone or order reference" value={filters.q} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, q: e.target.value })); }} />
        <label className="sr-only" htmlFor="n-ch">Channel</label>
        <select id="n-ch" className={`${inputCls} !w-auto`} value={filters.channel} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, channel: e.target.value })); }}>
          <option value="">All channels</option><option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option>
        </select>
        <label className="sr-only" htmlFor="n-st">Status</label>
        <select id="n-st" className={`${inputCls} !w-auto`} value={filters.status} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, status: e.target.value })); }}>
          <option value="">All statuses</option>{["SENT", "LOGGED", "SKIPPED", "FAILED"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className="btn-ghost !py-2" onClick={load}><RefreshCw className="h-4 w-4" aria-hidden /> Refresh</button>
      </Toolbar>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      {rows === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} onRowClick={(r) => setOpen(r.id)} empty={<EmptyState title="No messages yet" text="Booking confirmations, status updates, receipts and surveys will appear here as they are sent." />} />
      )}
      {total > 50 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button className="btn-ghost !py-1.5" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="text-muted">Page {page} of {Math.ceil(total / 50)}</span>
          <button className="btn-ghost !py-1.5" disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
      <MessageDetail id={open} onClose={() => setOpen(null)} onResent={load} />
    </>
  );
}

function MessageDetail({ id, onClose, onResent }: { id: string | null; onClose: () => void; onResent: () => void }) {
  const [data, setData] = useState<{ notification: Row & { body: string | null; providerRef: string | null } } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    setMsg(null);
    if (id) api<{ notification: Row & { body: string | null; providerRef: string | null } }>(`/notifications/${id}`).then(setData).catch((e: ApiError) => setMsg(e.message));
  }, [id]);
  async function resend() {
    try {
      const r = await api<{ status: string }>(`/notifications/${id}/resend`, { method: "POST" });
      setMsg(`Resent: ${r.status}`);
      onResent();
    } catch (e) {
      setMsg((e as ApiError).message);
    }
  }
  const n = data?.notification;
  return (
    <Modal open={!!id} onClose={onClose} title={n ? templateLabel(n.template) : "Message"} wide footer={n && <button className="btn-primary !py-2" onClick={resend}><Send className="h-4 w-4" aria-hidden /> Resend</button>}>
      {!n ? (
        <p className="text-sm text-muted">{msg ?? "Loading…"}</p>
      ) : (
        <div className="space-y-4 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div><dt className="text-xs uppercase tracking-wider text-muted">To</dt><dd className="break-all">{n.to}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-muted">Status</dt><dd><Badge className={STATUS_TONE[n.status] ?? ""}>{n.status}</Badge> {n.provider && <span className="text-xs text-muted">via {n.provider}</span>}</dd></div>
            {n.subject && <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wider text-muted">Subject</dt><dd className="font-medium text-navy">{n.subject}</dd></div>}
            {n.error && <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wider text-muted">Detail</dt><dd className="text-rose-700">{n.error}</dd></div>}
          </dl>
          {n.body && <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-cloud p-4 font-sans text-xs leading-relaxed text-slate-ink">{n.body}</pre>}
          {msg && <p role="status" className="text-sm text-navy">{msg}</p>}
        </div>
      )}
    </Modal>
  );
}

function Queue() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [status, setStatus] = useState<"PENDING" | "FAILED" | "all">("PENDING");
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ jobs: Job[] }>(`/notifications/jobs?status=${status}`).then((r) => setJobs(r.jobs)).catch((e: ApiError) => setMsg(e.message));
  }, [status]);
  useEffect(load, [load]);
  async function run() {
    const r = await api<{ counts: Record<string, number> }>("/notifications/jobs/process", { method: "POST" });
    setMsg(`Processed ${r.counts.processed} due message(s).`);
    load();
  }
  async function cancel(id: string) {
    await api(`/notifications/jobs/${id}/cancel`, { method: "POST" }).catch((e: ApiError) => setMsg(e.message));
    load();
  }
  const columns: Column<Job>[] = [
    { key: "due", header: "Scheduled", cell: (j) => <span className="whitespace-nowrap text-xs">{dateTime(j.scheduledFor)}</span> },
    { key: "ch", header: "Channel", cell: (j) => <span className="inline-flex items-center gap-1.5 capitalize"><ChannelIcon c={j.channel} />{j.channel}</span> },
    { key: "tpl", header: "Message", cell: (j) => <span className="font-medium text-navy">{templateLabel(j.template)}</span> },
    { key: "to", header: "To", cell: (j) => <span className="break-all text-xs">{j.to}</span> },
    { key: "st", header: "Status", cell: (j) => <span><Badge className={STATUS_TONE[j.status] ?? ""}>{j.status}</Badge>{j.attempts > 0 && <span className="ml-1 text-xs text-muted">try {j.attempts}</span>}{j.lastError && <span className="block text-xs text-rose-700">{j.lastError}</span>}</span> },
    { key: "act", header: "", mobile: true, cell: (j) => (j.status === "PENDING" ? <ConfirmButton className="btn-ghost !px-3 !py-1 text-xs" onConfirm={() => cancel(j.id)}>Cancel</ConfirmButton> : null) },
  ];
  return (
    <Panel title="Outgoing queue" action={<button className="btn-navy !py-2" onClick={run}><Send className="h-4 w-4" aria-hidden /> Send due now</button>}>
      <p className="mb-4 text-sm text-slate-ink">Texts held for quiet hours, scheduled satisfaction surveys and automatic retries wait here. The platform sends due messages every minute.</p>
      <Tabs value={status} onChange={setStatus} tabs={[{ value: "PENDING", label: "Waiting" }, { value: "FAILED", label: "Failed" }, { value: "all", label: "All" }]} />
      {msg && <p role="status" className="mb-3 text-sm text-navy">{msg}</p>}
      {jobs === null ? <p className="text-sm text-muted">Loading…</p> : <DataTable rows={jobs} columns={columns} rowKey={(j) => j.id} empty={<EmptyState title="Nothing waiting" text="Every queued message has been sent." />} />}
    </Panel>
  );
}

function OptOuts() {
  const [rows, setRows] = useState<OptOut[] | null>(null);
  const [form, setForm] = useState({ channel: "sms", address: "", note: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ optOuts: OptOut[] }>("/notifications/opt-outs").then((r) => setRows(r.optOuts)).catch((e: ApiError) => setMsg(e.message));
  }, []);
  useEffect(load, [load]);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/notifications/opt-outs", { method: "POST", json: form });
      setForm({ channel: form.channel, address: "", note: "" });
      setMsg("Opt-out saved.");
      load();
    } catch (err) {
      setMsg((err as ApiError).message);
    }
  }
  async function remove(id: string) {
    await api(`/notifications/opt-outs/${id}`, { method: "DELETE" }).catch((e: ApiError) => setMsg(e.message));
    load();
  }
  const label: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp", "email-marketing": "Review & optional emails" };
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Panel title="Add an opt-out" className="lg:col-span-1">
        <form onSubmit={add} className="space-y-3">
          <Field label="Channel" htmlFor="oo-ch">
            <select id="oo-ch" className={inputCls} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              <option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="email-marketing">Review &amp; optional emails</option>
            </select>
          </Field>
          <Field label={form.channel === "email-marketing" ? "Email" : "Phone number"} htmlFor="oo-addr">
            <input id="oo-addr" required className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="Note (optional)" htmlFor="oo-note"><input id="oo-note" className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          <button className="btn-primary w-full !py-2.5">Save opt-out</button>
          {msg && <p role="status" className="text-sm text-navy">{msg}</p>}
          <p className="text-xs text-muted">Booking confirmations and delivery updates by email are always sent. Texts that reply STOP are recorded here automatically.</p>
        </form>
      </Panel>
      <div className="lg:col-span-2">
        {rows === null ? <p className="text-sm text-muted">Loading…</p> : (
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              { key: "addr", header: "Contact", cell: (r) => <span className="break-all font-medium text-navy">{r.address}</span> },
              { key: "ch", header: "Channel", cell: (r) => label[r.channel] ?? r.channel },
              { key: "src", header: "Source", cell: (r) => <span className="text-xs text-slate-ink">{r.source.replace("-", " ")}{r.note ? `, ${r.note}` : ""}</span> },
              { key: "at", header: "Since", cell: (r) => <span className="text-xs">{dateTime(r.createdAt)}</span> },
              { key: "rm", header: "", cell: (r) => <ConfirmButton className="btn-ghost !px-3 !py-1 text-xs" onConfirm={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove</ConfirmButton> },
            ]}
            empty={<EmptyState title="No opt-outs" text="Nobody has opted out of texts or optional emails." />}
          />
        )}
      </div>
    </div>
  );
}
