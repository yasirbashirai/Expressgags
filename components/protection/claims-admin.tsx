"use client";

/**
 * Protection claims admin (Master §8): claims inbox, plan configuration with the Florida legal-approval
 * gate, and the reserve report (fees collected vs payouts). The customer offering stays OFF until the
 * owner records legal approval and switches it on. Never call it "insurance".
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { AdminTitle, Panel, useAdminUser } from "@/components/admin/admin-shell";
import { api, money, type ApiError } from "@/components/admin/api";
import { Badge } from "@/components/admin/labels";
import { DataTable, EmptyState, Field, inputCls, StatCard, Tabs, Toolbar } from "@/components/admin/ui";
import { ErrorNote, selectCls, useApi } from "@/components/resources/shared";

type Tier = { code: "basic" | "plus" | "vip"; name: string; priceCents: number; maxBenefitCents: number; benefits: string[]; active: boolean };
export type Plans = {
  displayName: string;
  tiers: Tier[];
  reservePercent: number;
  evidenceRules: string[];
  claimWindowDays: number;
  approval: { approvedBy: string | null; approvedAt: string | null; termsUrl: string | null; structure: string | null };
};
type ClaimRow = { id: string; reference: string; status: string; tier: string; claimedCents: number; decisionCents: number | null; createdAt: string; order: { reference: string }; customer: { name: string; email: string } };

export const CLAIM_STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Submitted", UNDER_REVIEW: "Under review", NEED_INFO: "Needs info", APPROVED: "Approved", PARTIAL: "Partially approved", DENIED: "Denied", PAID: "Paid",
};
const CLAIM_STYLE: Record<string, string> = {
  SUBMITTED: "bg-orange-50 text-orange-700 ring-orange-200",
  UNDER_REVIEW: "bg-navy-50 text-navy ring-navy-100",
  NEED_INFO: "bg-amber-50 text-amber-800 ring-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  PARTIAL: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  DENIED: "bg-rose-50 text-rose-800 ring-rose-200",
  PAID: "bg-cloud text-slate-ink ring-line",
};
export const ClaimStatus = ({ status }: { status: string }) => <Badge className={CLAIM_STYLE[status] ?? "bg-cloud ring-line"}>{CLAIM_STATUS_LABEL[status] ?? status}</Badge>;
const dollars = (c: number) => (c / 100).toFixed(2);
const toCents = (v: string) => Math.round(Number(v || 0) * 100);

type Tab = "claims" | "plans" | "reserve";

export function ClaimsAdmin() {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "claims");
  const status = useApi<{ plans: Plans; live: boolean; enabledFlag: boolean; approved: boolean }>("/protection/plans");
  const change = (t: Tab) => {
    setTab(t);
    router.replace(`/admin/claims?tab=${t}`, { scroll: false });
  };
  return (
    <>
      <AdminTitle
        title="Protection claims"
        sub="Optional Express Bags protection (not insurance). Customers only see it after legal approval and the owner turns it on."
        actions={status.data && (status.data.live ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-200">Live for customers</Badge> : <Badge className="bg-cloud text-slate-ink ring-line">Off for customers</Badge>)}
      />
      <Tabs<Tab> value={tab} onChange={change} tabs={[{ value: "claims", label: "Claims" }, { value: "plans", label: "Plans & approval" }, { value: "reserve", label: "Reserve" }]} />
      {tab === "claims" && <ClaimsList />}
      {tab === "plans" && (status.data ? <PlansEditor status={status.data} reload={status.reload} /> : <ErrorNote message={status.error} />)}
      {tab === "reserve" && <Reserve />}
    </>
  );
}

function ClaimsList() {
  const router = useRouter();
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const path = useMemo(() => `/protection/claims?${new URLSearchParams({ ...(status ? { status } : {}), ...(query ? { q: query } : {}) })}`, [status, query]);
  const { data, error } = useApi<{ claims: ClaimRow[]; counts: Record<string, number> }>(path);
  return (
    <>
      <Toolbar>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
          <label htmlFor="cl-q" className="sr-only">Search claims</label>
          <input id="cl-q" className={`${inputCls} max-w-xs`} placeholder="Claim, order or customer" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-ghost !px-4 !py-2">Search</button>
        </form>
        <label htmlFor="cl-status" className="sr-only">Status</label>
        <select id="cl-status" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Open (submitted, review, needs info)</option>
          {Object.entries(CLAIM_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}{data?.counts[v] ? ` (${data.counts[v]})` : ""}</option>)}
          <option value="">All</option>
        </select>
      </Toolbar>
      <ErrorNote message={error} />
      {data && (
        <DataTable
          rows={data.claims}
          rowKey={(c) => c.id}
          onRowClick={(c) => router.push(`/admin/claims/${c.id}`)}
          empty={<EmptyState title="No claims here" text="Claims customers file from their account appear in this inbox." />}
          columns={[
            { key: "ref", header: "Claim", cell: (c) => <span><span className="whitespace-nowrap font-semibold text-navy">{c.reference}</span><span className="block whitespace-nowrap text-xs text-muted">Order {c.order.reference}</span></span> },
            { key: "who", header: "Customer", cell: (c) => c.customer.name },
            { key: "tier", header: "Plan", cell: (c) => c.tier.toUpperCase() },
            { key: "amt", header: "Claimed", cell: (c) => money(c.claimedCents), className: "text-right" },
            { key: "dec", header: "Decision", cell: (c) => (c.decisionCents != null ? money(c.decisionCents) : "-"), className: "text-right" },
            { key: "st", header: "Status", cell: (c) => <ClaimStatus status={c.status} /> },
            { key: "at", header: "Filed", cell: (c) => new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }), mobile: false },
          ]}
        />
      )}
    </>
  );
}

function PlansEditor({ status, reload }: { status: { plans: Plans; live: boolean; enabledFlag: boolean; approved: boolean }; reload: () => void }) {
  const user = useAdminUser();
  const isOwner = user?.role === "OWNER";
  const canEdit = user?.role === "OWNER" || user?.role === "STAFF";
  const [p, setP] = useState<Plans>(status.plans);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setTier = (i: number, patch: Partial<Tier>) => setP((x) => ({ ...x, tiers: x.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api("/protection/plans", { method: "PUT", json: p });
      setMsg("Plans saved.");
      reload();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (enabled: boolean) => {
    setError(null);
    try {
      await api("/protection/enable", { method: "POST", json: { enabled } });
      reload();
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <ErrorNote message={error} />
      {msg && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{msg}</p>}

      <Panel title="Legal approval gate">
        <p className="mb-4 text-sm text-slate-ink">
          The protection concept (Express Bags keeping fees in a reserve and paying claims itself) may be treated as insurance under Florida law. Record the legal
          structure your Florida counsel approved before offering it. Without all three items below the offering cannot be switched on.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Approved by (counsel / firm)" htmlFor="ap-by"><input id="ap-by" disabled={!canEdit} className={inputCls} value={p.approval.approvedBy ?? ""} onChange={(e) => setP({ ...p, approval: { ...p.approval, approvedBy: e.target.value || null } })} /></Field>
          <Field label="Approval date" htmlFor="ap-at"><input id="ap-at" type="date" disabled={!canEdit} className={inputCls} value={p.approval.approvedAt ?? ""} onChange={(e) => setP({ ...p, approval: { ...p.approval, approvedAt: e.target.value || null } })} /></Field>
          <Field label="Published terms URL" htmlFor="ap-url"><input id="ap-url" type="url" disabled={!canEdit} placeholder="https://www.express-bags.com/…" className={inputCls} value={p.approval.termsUrl ?? ""} onChange={(e) => setP({ ...p, approval: { ...p.approval, termsUrl: e.target.value || null } })} /></Field>
          <Field label="Approved structure" htmlFor="ap-st" hint="e.g. declared-value protection, service guarantee"><input id="ap-st" disabled={!canEdit} className={inputCls} value={p.approval.structure ?? ""} onChange={(e) => setP({ ...p, approval: { ...p.approval, structure: e.target.value || null } })} /></Field>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-cloud p-4">
          {status.approved ? <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden /> : <Lock className="h-5 w-5 text-muted" aria-hidden />}
          <p className="flex-1 text-sm text-slate-ink">
            {status.live ? "Protection is live: customers can add it and file claims." : status.approved ? "Approval recorded. The owner can switch the offering on." : "Waiting for legal approval. Customers cannot see protection."}
          </p>
          {isOwner && (status.enabledFlag ? (
            <button type="button" className="btn-ghost !px-4 !py-2" onClick={() => toggle(false)}>Turn off for customers</button>
          ) : (
            <button type="button" className="btn-primary !px-4 !py-2" disabled={!status.approved} onClick={() => toggle(true)}>Turn on for customers</button>
          ))}
        </div>
      </Panel>

      <Panel title="Plans">
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <Field label="Product name (never “insurance”)" htmlFor="pl-name"><input id="pl-name" disabled={!canEdit} className={inputCls} value={p.displayName} onChange={(e) => setP({ ...p, displayName: e.target.value })} /></Field>
          <Field label="Reserve kept (% of fees)" htmlFor="pl-res" hint="Exact value set by Express Bags"><input id="pl-res" type="number" min={0} max={100} step="0.5" disabled={!canEdit} className={inputCls} value={p.reservePercent} onChange={(e) => setP({ ...p, reservePercent: Number(e.target.value) })} /></Field>
          <Field label="Claim window (days after delivery)" htmlFor="pl-win"><input id="pl-win" type="number" min={1} disabled={!canEdit} className={inputCls} value={p.claimWindowDays} onChange={(e) => setP({ ...p, claimWindowDays: Number(e.target.value) })} /></Field>
        </div>
        <ul className="grid gap-4 lg:grid-cols-3">
          {p.tiers.map((t, i) => (
            <li key={t.code} className="rounded-2xl border border-line p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-display text-lg font-bold text-navy">{t.name}</p>
                <label className="flex items-center gap-1.5 text-xs text-slate-ink"><input type="checkbox" disabled={!canEdit} checked={t.active} onChange={(e) => setTier(i, { active: e.target.checked })} className="accent-[#E06010]" /> Offered</label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price ($)" htmlFor={`t-p-${t.code}`}><input id={`t-p-${t.code}`} type="number" min={0} step="0.01" disabled={!canEdit} className={inputCls} defaultValue={dollars(t.priceCents)} onBlur={(e) => setTier(i, { priceCents: toCents(e.target.value) })} /></Field>
                <Field label="Max per order ($)" htmlFor={`t-m-${t.code}`}><input id={`t-m-${t.code}`} type="number" min={0} step="1" disabled={!canEdit} className={inputCls} defaultValue={dollars(t.maxBenefitCents)} onBlur={(e) => setTier(i, { maxBenefitCents: toCents(e.target.value) })} /></Field>
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">Non-claim benefits</p>
              <ul className="mt-1 space-y-1.5">
                {t.benefits.map((b, k) => (
                  <li key={k} className="flex gap-2">
                    <label className="sr-only" htmlFor={`t-b-${t.code}-${k}`}>Benefit {k + 1}</label>
                    <input id={`t-b-${t.code}-${k}`} disabled={!canEdit} className={`${inputCls} !py-1.5 text-xs`} value={b} onChange={(e) => setTier(i, { benefits: t.benefits.map((x, m) => (m === k ? e.target.value : x)) })} />
                    {canEdit && <button type="button" aria-label="Remove benefit" className="rounded-lg p-1.5 text-muted hover:bg-cloud" onClick={() => setTier(i, { benefits: t.benefits.filter((_, m) => m !== k) })}><Trash2 className="h-4 w-4" /></button>}
                  </li>
                ))}
              </ul>
              {canEdit && <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-orange-700" onClick={() => setTier(i, { benefits: [...t.benefits, ""] })}><Plus className="h-3.5 w-3.5" aria-hidden /> Add benefit</button>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">The maximum benefit applies once per order, never per item. If non-claim benefits are bundled with protection, checkout shows them as separate components.</p>
      </Panel>

      <Panel title="Evidence customers must provide">
        <ul className="space-y-2">
          {p.evidenceRules.map((r, k) => (
            <li key={k} className="flex gap-2">
              <label className="sr-only" htmlFor={`ev-${k}`}>Rule {k + 1}</label>
              <input id={`ev-${k}`} disabled={!canEdit} className={inputCls} value={r} onChange={(e) => setP({ ...p, evidenceRules: p.evidenceRules.map((x, m) => (m === k ? e.target.value : x)) })} />
              {canEdit && <button type="button" aria-label="Remove rule" className="rounded-lg p-2 text-muted hover:bg-cloud" onClick={() => setP({ ...p, evidenceRules: p.evidenceRules.filter((_, m) => m !== k) })}><Trash2 className="h-4 w-4" /></button>}
            </li>
          ))}
        </ul>
        {canEdit && <button type="button" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-orange-700" onClick={() => setP({ ...p, evidenceRules: [...p.evidenceRules, ""] })}><Plus className="h-4 w-4" aria-hidden /> Add rule</button>}
      </Panel>
      {canEdit && <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save plans"}</button>}
    </form>
  );
}

function Reserve() {
  type R = { feesCollectedCents: number; protectedOrders: number; paidOutCents: number; paidClaims: number; approvedUnpaidCents: number; approvedUnpaidClaims: number; openClaimedCents: number; openClaims: number; reservePercent: number; reserveTargetCents: number; reserveBalanceCents: number; lossRatioPercent: number; ordersByTier: Record<string, number> };
  const { data, error } = useApi<{ report: R }>("/protection/reserve");
  if (error) return <ErrorNote message={error} />;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const r = data.report;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Protection fees collected" value={money(r.feesCollectedCents)} hint={`${r.protectedOrders} protected order(s)`} tone="navy" />
        <StatCard label="Paid out" value={money(r.paidOutCents)} hint={`${r.paidClaims} claim(s) · loss ratio ${r.lossRatioPercent}%`} />
        <StatCard label="Approved, not yet paid" value={money(r.approvedUnpaidCents)} hint={`${r.approvedUnpaidClaims} claim(s)`} />
        <StatCard label="Open claims (claimed)" value={money(r.openClaimedCents)} hint={`${r.openClaims} under review`} tone={r.openClaims ? "orange" : "white"} />
      </div>
      <Panel title="Reserve">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs uppercase tracking-wider text-muted">Reserve rule</dt><dd className="mt-1 font-semibold text-navy">{r.reservePercent}% of fees</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-muted">Reserve set aside</dt><dd className="mt-1 font-semibold text-navy">{money(r.reserveTargetCents)}</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-muted">Reserve after payouts</dt><dd className={`mt-1 font-semibold ${r.reserveBalanceCents < 0 ? "text-rose-700" : "text-navy"}`}>{money(r.reserveBalanceCents)}</dd></div>
        </dl>
        <p className="mt-4 text-xs text-muted">Orders by plan: {Object.entries(r.ordersByTier).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(" · ") || "none yet"}. Holding the reserve in an interest-bearing account is subject to legal, accounting and liquidity advice.</p>
      </Panel>
    </div>
  );
}
