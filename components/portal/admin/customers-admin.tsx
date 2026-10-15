"use client";

/**
 * Admin: customers & business accounts. Lists (search, pending applications), customer detail,
 * company detail with account terms (status, payment terms, PO, credit limit, negotiated pricing JSON).
 * No impersonation: staff can only send a set-password invite.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle2, Mail, Search, UserRound } from "lucide-react";
import { AdminTitle, Panel, useAdminUser } from "@/components/admin/admin-shell";
import { api, dateTime, money } from "@/components/admin/api";
import { Badge } from "@/components/admin/labels";
import { DataTable, EmptyState, Field, inputCls, StatCard, Tabs, Toolbar } from "@/components/admin/ui";
import { serviceName } from "../dashboard";

type CustomerRow = { id: string; name: string; email: string; phone: string | null; accountRole: string; hasPortalAccount: boolean; emailVerifiedAt: string | null; lastLoginAt: string | null; createdAt: string; company: { id: string; name: string; accountStatus: string } | null; _count: { quotes: number; orders: number } };
type CompanyRow = { id: string; name: string; domain: string | null; accountType: string | null; accountStatus: string; paymentTermsDays: number; poRequired: boolean; market: string | null; createdAt: string; _count: { customers: number; orders: number; quotes: number; invoices: number } };

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  PENDING: "bg-orange-50 text-orange-700 ring-orange-200",
  PROSPECT: "bg-cloud text-muted ring-line",
  ON_HOLD: "bg-rose-50 text-rose-800 ring-rose-200",
  DEACTIVATED: "bg-cloud text-muted ring-line",
  INVITED: "bg-orange-50 text-orange-700 ring-orange-200",
  NO_ACCOUNT: "bg-cloud text-muted ring-line",
  PENDING_VERIFICATION: "bg-orange-50 text-orange-700 ring-orange-200",
};
const ROLE: Record<string, string> = { INDIVIDUAL: "Individual", COMPANY_ADMIN: "Company admin", COMPANY_USER: "Company user", CONCIERGE: "Concierge" };
const fmtStatus = (s: string) => s.replace(/_/g, " ").toLowerCase();

export function CustomersAdmin() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get("tab") as "customers" | "companies") || "customers";
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[] | null>(null);
  const [pending, setPending] = useState(0);
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const q = params.get("search") ?? "";
      if (tab === "customers") {
        const r = await api<{ customers: CustomerRow[] }>(`/customers?${new URLSearchParams({ search: q })}`);
        setCustomers(r.customers);
      }
      const c = await api<{ companies: CompanyRow[]; pendingApplications: number }>(`/customers/companies?${new URLSearchParams({ search: tab === "companies" ? q : "", status: tab === "companies" ? status : "all" })}`);
      setCompanies(c.companies);
      setPending(c.pendingApplications);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [params, tab, status]);
  useEffect(() => {
    load();
  }, [load]);

  const go = (t: string, s = search, st = status) => router.replace(`/admin/customers?${new URLSearchParams({ tab: t, ...(s ? { search: s } : {}), ...(t === "companies" && st !== "all" ? { status: st } : {}) })}`);

  return (
    <div>
      <AdminTitle title="Customers & accounts" sub="Travelers, business accounts, concierge desks and pending applications." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Pending applications" value={pending} tone={pending ? "orange" : "white"} Icon={Building2} hint={pending ? "Review and approve below" : "All caught up"} />
        <StatCard label="Business accounts" value={companies?.filter((c) => c.accountStatus === "ACTIVE").length ?? "…"} Icon={CheckCircle2} />
        <StatCard label="Customers shown" value={customers?.length ?? "…"} Icon={UserRound} hint="Most recent 50" />
      </div>
      <Tabs tabs={[{ value: "customers", label: "Customers" }, { value: "companies", label: "Companies", count: companies?.length }]} value={tab} onChange={(t) => go(t)} />
      <Toolbar>
        <form onSubmit={(e) => { e.preventDefault(); go(tab); }} className="flex min-w-[16rem] flex-1 gap-2" role="search">
          <label htmlFor="cust-search" className="sr-only">Search</label>
          <input id="cust-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tab === "customers" ? "Name, email, phone or company" : "Company name"} className={inputCls} />
          <button className="btn-navy !px-4" aria-label="Search"><Search className="h-4 w-4" /></button>
        </form>
        {tab === "companies" && (
          <>
            <label htmlFor="status" className="sr-only">Status</label>
            <select id="status" value={status} onChange={(e) => { setStatus(e.target.value); go("companies", search, e.target.value); }} className={`${inputCls} !w-auto`}>
              {["all", "PENDING", "ACTIVE", "ON_HOLD", "PROSPECT"].map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : fmtStatus(s)}</option>)}
            </select>
          </>
        )}
      </Toolbar>
      {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</p>}
      {tab === "customers" ? (
        <DataTable
          rows={customers ?? []}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/admin/customers/${r.id}`)}
          empty={<EmptyState title={customers ? "No customers found" : "Loading…"} />}
          columns={[
            { key: "name", header: "Customer", cell: (r) => <span><span className="font-semibold text-navy">{r.name}</span><span className="block text-xs text-muted">{r.email}</span></span> },
            { key: "company", header: "Company", cell: (r) => r.company ? <span>{r.company.name} <Badge className={STATUS_BADGE[r.company.accountStatus]}>{fmtStatus(r.company.accountStatus)}</Badge></span> : <span className="text-muted">—</span> },
            { key: "role", header: "Role", cell: (r) => ROLE[r.accountRole] ?? r.accountRole },
            { key: "portal", header: "Portal", cell: (r) => r.hasPortalAccount ? <Badge className={STATUS_BADGE.ACTIVE}>active</Badge> : <Badge className={STATUS_BADGE.NO_ACCOUNT}>no login</Badge> },
            { key: "activity", header: "Quotes / orders", cell: (r) => `${r._count.quotes} / ${r._count.orders}` },
            { key: "created", header: "Since", cell: (r) => dateTime(r.createdAt), mobile: false },
          ]}
        />
      ) : (
        <DataTable
          rows={companies ?? []}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/admin/customers/companies/${r.id}`)}
          empty={<EmptyState title={companies ? "No companies found" : "Loading…"} />}
          columns={[
            { key: "name", header: "Company", cell: (r) => <span><span className="font-semibold text-navy">{r.name}</span><span className="block text-xs text-muted">{r.accountType ?? "type not set"}{r.domain ? ` · ${r.domain}` : ""}</span></span> },
            { key: "status", header: "Status", cell: (r) => <Badge className={STATUS_BADGE[r.accountStatus]}>{fmtStatus(r.accountStatus)}</Badge> },
            { key: "terms", header: "Terms", cell: (r) => (r.paymentTermsDays ? `Net ${r.paymentTermsDays}` : "Due on receipt") + (r.poRequired ? " · PO" : "") },
            { key: "users", header: "Users", cell: (r) => r._count.customers },
            { key: "volume", header: "Quotes / orders", cell: (r) => `${r._count.quotes} / ${r._count.orders}` },
          ]}
        />
      )}
    </div>
  );
}

/* ----------------------------- Customer detail ---------------------------- */
type CustomerDetail = {
  customer: { id: string; name: string; email: string; phone: string | null; preferredContact: string | null; accountRole: string; language: string; marketingOptIn: boolean; emailVerifiedAt: string | null; lastLoginAt: string | null; createdAt: string; portalStatus: string; savedAddresses: number; company: { id: string; name: string; accountStatus: string } | null };
  quotes: { id: string; reference: string; status: string; serviceType: string; serviceDate: string; createdAt: string }[];
  orders: { id: string; reference: string; status: string; statusLabel: string; serviceType: string; serviceDate: string; retailCents: number | null }[];
  quotations: { id: string; reference: string; status: string; totalCents: number; createdAt: string }[];
  invoices: { id: string; number: string; status: string; totalCents: number; paidCents: number; dueAt: string | null }[];
};

export function CustomerAdminDetail({ id }: { id: string }) {
  const user = useAdminUser();
  const canWrite = user?.role === "OWNER" || user?.role === "STAFF";
  const [d, setD] = useState<CustomerDetail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => api<CustomerDetail>(`/customers/${id}`).then(setD).catch((e) => setMsg(e.message)), [id]);
  useEffect(() => {
    load();
  }, [load]);
  if (!d) return <p className="text-sm text-muted">{msg ?? "Loading…"}</p>;
  const c = d.customer;
  const act = async (path: string, init: Parameters<typeof api>[1], ok: string) => {
    setMsg(null);
    try {
      await api(path, init);
      setMsg(ok);
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div className="space-y-6">
      <AdminTitle
        title={c.name}
        sub={`${c.email}${c.phone ? ` · ${c.phone}` : ""}`}
        actions={canWrite && (
          <div className="flex flex-wrap gap-2">
            {(c.portalStatus === "NO_ACCOUNT" || c.portalStatus === "PENDING_VERIFICATION") && <button className="btn-navy" onClick={() => act(`/customers/${c.id}/invite`, { method: "POST" }, "Portal invitation sent.")}><Mail className="h-4 w-4" aria-hidden /> Send portal invite</button>}
            {c.portalStatus === "ACTIVE" && <button className="btn-ghost" onClick={() => window.confirm("Deactivate this customer's portal access?") && act(`/customers/${c.id}`, { method: "PATCH", json: { portalActive: false } }, "Portal access deactivated.")}>Deactivate portal</button>}
            {c.portalStatus === "DEACTIVATED" && <button className="btn-ghost" onClick={() => act(`/customers/${c.id}`, { method: "PATCH", json: { portalActive: true } }, "Portal access restored.")}>Reactivate portal</button>}
          </div>
        )}
      />
      {msg && <p className="rounded-xl bg-navy-50 px-4 py-3 text-sm text-navy" role="status">{msg}</p>}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Portal" value={<span className="text-xl">{fmtStatus(c.portalStatus)}</span>} hint={c.lastLoginAt ? `Last sign-in ${dateTime(c.lastLoginAt)}` : "Never signed in"} />
        <StatCard label="Role" value={<span className="text-xl">{ROLE[c.accountRole]}</span>} hint={c.company ? <Link className="underline" href={`/admin/customers/companies/${c.company.id}`}>{c.company.name}</Link> : "No company"} />
        <StatCard label="Orders" value={d.orders.length} hint={`${d.quotes.length} quote requests`} />
        <StatCard label="Saved locations" value={c.savedAddresses} hint={`Language ${c.language.toUpperCase()} · marketing ${c.marketingOptIn ? "yes" : "no"}`} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Orders">
          <DataTable rows={d.orders} rowKey={(r) => r.id} empty={<p className="text-sm text-muted">No orders.</p>} columns={[
            { key: "ref", header: "Order", cell: (r) => <span className="font-mono font-semibold text-navy">{r.reference}</span> },
            { key: "svc", header: "Service", cell: (r) => serviceName(r.serviceType) },
            { key: "date", header: "Date", cell: (r) => dateTime(r.serviceDate) },
            { key: "status", header: "Status", cell: (r) => r.statusLabel },
            { key: "total", header: "Total", cell: (r) => money(r.retailCents) },
          ]} />
        </Panel>
        <Panel title="Quote requests">
          <DataTable rows={d.quotes} rowKey={(r) => r.id} onRowClick={undefined} empty={<p className="text-sm text-muted">No quote requests.</p>} columns={[
            { key: "ref", header: "Reference", cell: (r) => <Link href={`/admin/quotes/${r.id}`} className="font-mono font-semibold text-navy hover:underline">{r.reference}</Link> },
            { key: "svc", header: "Service", cell: (r) => serviceName(r.serviceType) },
            { key: "date", header: "Date", cell: (r) => r.serviceDate },
            { key: "status", header: "Status", cell: (r) => fmtStatus(r.status) },
          ]} />
        </Panel>
        <Panel title="Quotations">
          <DataTable rows={d.quotations} rowKey={(r) => r.id} empty={<p className="text-sm text-muted">No quotations.</p>} columns={[
            { key: "ref", header: "Quotation", cell: (r) => <span className="font-mono">{r.reference}</span> },
            { key: "status", header: "Status", cell: (r) => fmtStatus(r.status) },
            { key: "total", header: "Total", cell: (r) => money(r.totalCents) },
          ]} />
        </Panel>
        <Panel title="Invoices">
          <DataTable rows={d.invoices} rowKey={(r) => r.id} empty={<p className="text-sm text-muted">No invoices.</p>} columns={[
            { key: "num", header: "Invoice", cell: (r) => <span className="font-mono">{r.number}</span> },
            { key: "status", header: "Status", cell: (r) => fmtStatus(r.status) },
            { key: "bal", header: "Balance", cell: (r) => money(r.totalCents - r.paidCents) },
          ]} />
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------ Company detail ---------------------------- */
type CompanyDetail = {
  company: { id: string; name: string; domain: string | null; accountType: string | null; accountStatus: string; billingEmail: string | null; paymentTermsDays: number; poRequired: boolean; creditLimitCents: number | null; negotiatedRules: unknown; taxId: string | null; notes: string | null; market: string | null };
  users: { id: string; name: string; email: string; accountRole: string; lastLoginAt: string | null; status: string }[];
  orders: { id: string; reference: string; status: string; statusLabel: string; serviceType: string; serviceDate: string; retailCents: number | null }[];
  quotes: { id: string; reference: string; status: string; serviceType: string; createdAt: string }[];
  invoices: { id: string; number: string; status: string; totalCents: number; paidCents: number; dueAt: string | null }[];
  openBalanceCents: number;
};

const ACCOUNT_TYPES = ["hotel", "resort", "dmc", "cruise", "corporate", "sports", "entertainment", "event", "university", "commercial"];

export function CompanyAdminDetail({ id }: { id: string }) {
  const user = useAdminUser();
  const canWrite = user?.role === "OWNER" || user?.role === "STAFF" || user?.role === "ACCOUNTING";
  const canApprove = user?.role === "OWNER" || user?.role === "STAFF";
  const [d, setD] = useState<CompanyDetail | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rulesText, setRulesText] = useState("");
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api<CompanyDetail>(`/customers/companies/${id}`).then((r) => { setD(r); setRulesText(r.company.negotiatedRules ? JSON.stringify(r.company.negotiatedRules, null, 2) : ""); }).catch((e) => setMsg({ ok: false, text: e.message })), [id]);
  useEffect(() => {
    load();
  }, [load]);
  if (!d) return <p className="text-sm text-muted">{msg?.text ?? "Loading…"}</p>;
  const co = d.company;

  const save = async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    let negotiatedRules: unknown = null;
    if (rulesText.trim()) {
      try {
        negotiatedRules = JSON.parse(rulesText);
        if (!negotiatedRules || typeof negotiatedRules !== "object" || Array.isArray(negotiatedRules)) throw new Error("Must be a JSON object");
      } catch (e) {
        setRulesError(`Invalid JSON: ${(e as Error).message}`);
        return;
      }
    }
    setRulesError(null);
    setSaving(true);
    setMsg(null);
    try {
      await api(`/customers/companies/${co.id}`, {
        method: "PATCH",
        json: {
          name: fd.get("name"),
          accountType: fd.get("accountType") || null,
          accountStatus: fd.get("accountStatus"),
          billingEmail: fd.get("billingEmail") || "",
          paymentTermsDays: Number(fd.get("paymentTermsDays") || 0),
          poRequired: fd.get("poRequired") === "on",
          creditLimitCents: fd.get("creditLimit") ? Math.round(Number(fd.get("creditLimit")) * 100) : null,
          taxId: fd.get("taxId") || null,
          notes: fd.get("notes") || null,
          negotiatedRules,
        },
      });
      setMsg({ ok: true, text: "Account saved." });
      load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };
  const approve = async () => {
    try {
      await api(`/customers/companies/${co.id}/approve`, { method: "POST", json: {} });
      setMsg({ ok: true, text: "Business account approved. The applicant is now the company administrator and has been emailed." });
      load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <div className="space-y-6">
      <AdminTitle title={co.name} sub={`${co.accountType ?? "Business account"}${co.domain ? ` · ${co.domain}` : ""}`} actions={co.accountStatus === "PENDING" && canApprove && <button className="btn-primary" onClick={approve}><CheckCircle2 className="h-4 w-4" aria-hidden /> Approve account</button>} />
      {msg && <p className={`rounded-xl px-4 py-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-800"}`} role="status">{msg.text}</p>}
      {co.accountStatus === "PENDING" && co.notes && <Panel title="Application"><pre className="whitespace-pre-wrap font-sans text-sm text-slate-ink">{co.notes}</pre></Panel>}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Status" value={<span className="text-xl">{fmtStatus(co.accountStatus)}</span>} />
        <StatCard label="Open balance" value={money(d.openBalanceCents)} tone={d.openBalanceCents ? "navy" : "white"} />
        <StatCard label="Users" value={d.users.length} />
        <StatCard label="Orders" value={d.orders.length} hint={`${d.quotes.length} recent requests`} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Panel title="Account terms" className="xl:col-span-3">
          <form onSubmit={(e) => { e.preventDefault(); save(e.currentTarget); }} className="grid gap-4 md:grid-cols-2">
            <Field label="Company name" htmlFor="name"><input id="name" name="name" defaultValue={co.name} disabled={!canWrite} className={inputCls} /></Field>
            <Field label="Account type" htmlFor="accountType">
              <select id="accountType" name="accountType" defaultValue={co.accountType ?? ""} disabled={!canWrite} className={inputCls}><option value="">Not set</option>{ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </Field>
            <Field label="Status" htmlFor="accountStatus">
              <select id="accountStatus" name="accountStatus" defaultValue={co.accountStatus} disabled={!canWrite} className={inputCls}>{["PROSPECT", "PENDING", "ACTIVE", "ON_HOLD"].map((s) => <option key={s} value={s}>{fmtStatus(s)}</option>)}</select>
            </Field>
            <Field label="Billing email" htmlFor="billingEmail"><input id="billingEmail" name="billingEmail" type="email" defaultValue={co.billingEmail ?? ""} disabled={!canWrite} className={inputCls} /></Field>
            <Field label="Payment terms (days)" htmlFor="paymentTermsDays" hint="0 = due on receipt"><input id="paymentTermsDays" name="paymentTermsDays" type="number" min={0} max={120} defaultValue={co.paymentTermsDays} disabled={!canWrite} className={inputCls} /></Field>
            <Field label="Credit limit (USD)" htmlFor="creditLimit"><input id="creditLimit" name="creditLimit" type="number" min={0} step="0.01" defaultValue={co.creditLimitCents !== null ? co.creditLimitCents / 100 : ""} disabled={!canWrite} className={inputCls} /></Field>
            <Field label="Tax ID" htmlFor="taxId"><input id="taxId" name="taxId" defaultValue={co.taxId ?? ""} disabled={!canWrite} className={inputCls} /></Field>
            <label className="flex items-center gap-3 self-end pb-2 text-sm text-slate-ink"><input type="checkbox" name="poRequired" defaultChecked={co.poRequired} disabled={!canWrite} className="h-4 w-4 accent-[#E06010]" /> PO number required</label>
            <div className="md:col-span-2">
              <Field label="Negotiated pricing rules (JSON)" htmlFor="rules" hint="Overrides applied by the pricing engines for this account, e.g. {&quot;local&quot;: {&quot;minimumChargeCents&quot;: 7500}}. Leave empty for standard rules." error={rulesError ?? undefined}>
                <textarea id="rules" value={rulesText} onChange={(e) => setRulesText(e.target.value)} rows={6} spellCheck={false} disabled={!canWrite} className={`${inputCls} font-mono text-xs`} />
              </Field>
            </div>
            <div className="md:col-span-2"><Field label="Internal notes" htmlFor="notes"><textarea id="notes" name="notes" rows={3} defaultValue={co.notes ?? ""} disabled={!canWrite} className={inputCls} /></Field></div>
            {canWrite && <div className="md:col-span-2"><button disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save account"}</button></div>}
          </form>
        </Panel>
        <Panel title="Authorized users" className="xl:col-span-2">
          {d.users.length === 0 ? <p className="text-sm text-muted">No users linked.</p> : (
            <ul className="divide-y divide-line text-sm">
              {d.users.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/admin/customers/${u.id}`} className="min-w-0 hover:underline"><span className="block truncate font-semibold text-navy">{u.name}</span><span className="block truncate text-xs text-muted">{u.email} · {ROLE[u.accountRole]}</span></Link>
                  <Badge className={STATUS_BADGE[u.status]}>{fmtStatus(u.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Recent orders">
          <DataTable rows={d.orders} rowKey={(r) => r.id} empty={<p className="text-sm text-muted">No orders.</p>} columns={[
            { key: "ref", header: "Order", cell: (r) => <span className="font-mono font-semibold text-navy">{r.reference}</span> },
            { key: "svc", header: "Service", cell: (r) => serviceName(r.serviceType) },
            { key: "status", header: "Status", cell: (r) => r.statusLabel },
            { key: "total", header: "Total", cell: (r) => money(r.retailCents) },
          ]} />
        </Panel>
        <Panel title="Invoices">
          <DataTable rows={d.invoices} rowKey={(r) => r.id} empty={<p className="text-sm text-muted">No invoices.</p>} columns={[
            { key: "num", header: "Invoice", cell: (r) => <span className="font-mono">{r.number}</span> },
            { key: "status", header: "Status", cell: (r) => fmtStatus(r.status) },
            { key: "due", header: "Due", cell: (r) => (r.dueAt ? dateTime(r.dueAt) : "—") },
            { key: "bal", header: "Balance", cell: (r) => money(r.totalCents - r.paidCents) },
          ]} />
        </Panel>
      </div>
    </div>
  );
}
