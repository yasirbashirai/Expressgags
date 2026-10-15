"use client";

/**
 * Claim adjudication: the customer's evidence next to Express Bags' own pickup/intake condition
 * photos and the order's chain of custody, then a decision (approve / partial / deny / need info)
 * capped by what remains of the order's maximum benefit, and the payout record (owner/accounting).
 */
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, Banknote, FileText, Gavel, MessageSquarePlus } from "lucide-react";
import { AdminTitle, Panel, useAdminUser } from "@/components/admin/admin-shell";
import { api, API_URL, money, type ApiError } from "@/components/admin/api";
import { Field, inputCls } from "@/components/admin/ui";
import { ErrorNote, useApi } from "@/components/resources/shared";
import { ClaimStatus } from "./claims-admin";

type FileMeta = { id: string; originalName: string; mimeType: string } | null;
type Detail = {
  claim: { id: string; reference: string; status: string; tier: string; maxBenefitCents: number; claimedCents: number; decisionCents: number | null; decisionNote: string | null; description: string; createdAt: string; decidedBy: string | null; customer: { name: string; email: string; phone: string | null } };
  order: { id: string; reference: string; status: string; serviceDate: string; completedAt: string | null; protectionTier: string | null; protectionCents: number | null; pieces: { pieceId: string; category: string; description: string | null; conditionNotes: string | null }[] };
  remainingCents: number;
  evidence: { id: string; category: string; uploadId: string; file: FileMeta }[];
  events: { id: string; type: string; note: string | null; actorType: string; actorName: string | null; customerVisible: boolean; createdAt: string }[];
  proofs: { id: string; kind: string; pieceCount: number; recipientName: string | null; conditionNotes: string | null; capturedAt: string; photos: FileMeta[] }[];
  custody: { id: string; type: string; status: string | null; detail: string | null; actorName: string | null; uploadIds: string[]; createdAt: string }[];
};

const CATEGORY: Record<string, string> = { "damage-photo": "Damage photo", "proof-of-value": "Proof of value / receipt", "pre-trip-photo": "Pre-trip condition", other: "Other" };
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Thumb({ claimId, file, label }: { claimId: string; file: FileMeta; label: string }) {
  if (!file) return null;
  const src = `${API_URL}/v1/admin/protection/claims/${claimId}/files/${file.id}`;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-xl border border-line bg-cloud">
      {file.mimeType.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${label}: ${file.originalName}`} className="aspect-square w-full object-cover transition group-hover:opacity-90" />
      ) : (
        <span className="flex aspect-square flex-col items-center justify-center gap-1 p-2 text-center text-xs text-slate-ink"><FileText className="h-5 w-5 text-navy" aria-hidden />{file.originalName}</span>
      )}
      <span className="block truncate px-2 py-1 text-[11px] text-muted">{label}</span>
    </a>
  );
}

export function ClaimDetail({ id }: { id: string }) {
  const { data, error, reload } = useApi<Detail>(`/protection/claims/${id}`);
  const user = useAdminUser();
  if (error) return <ErrorNote message={error} />;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const { claim: c, order } = data;
  const canDecide = user?.role === "OWNER" || user?.role === "STAFF";
  const canPay = user?.role === "OWNER" || user?.role === "ACCOUNTING";
  const open = ["SUBMITTED", "UNDER_REVIEW", "NEED_INFO"].includes(c.status);

  return (
    <>
      <Link href="/admin/claims" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-ink hover:text-navy"><ArrowLeft className="h-4 w-4" aria-hidden /> Claims</Link>
      <AdminTitle title={`Claim ${c.reference}`} sub={`${c.tier.toUpperCase()} plan · order ${order.reference} · filed ${when(c.createdAt)}`} actions={<ClaimStatus status={c.status} />} />
      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Panel title="What the customer reported">
            <p className="whitespace-pre-line text-sm text-charcoal">{c.description}</p>
            <h3 className="mt-5 text-sm font-semibold text-navy">Customer evidence</h3>
            {data.evidence.length ? (
              <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">{data.evidence.map((e) => <li key={e.id}><Thumb claimId={c.id} file={e.file} label={CATEGORY[e.category] ?? e.category} /></li>)}</ul>
            ) : <p className="mt-1 text-sm text-muted">No files attached.</p>}
          </Panel>

          <Panel title="Express Bags condition records">
            {data.proofs.length === 0 && <p className="text-sm text-muted">No pickup, intake or delivery proofs recorded for this order.</p>}
            <ul className="space-y-4">
              {data.proofs.map((p) => (
                <li key={p.id} className="rounded-2xl border border-line p-4">
                  <p className="text-sm font-semibold text-navy">{p.kind.replace("_", " ").toLowerCase().replace(/^./, (x) => x.toUpperCase())} · {p.pieceCount} piece(s) · {when(p.capturedAt)}</p>
                  {p.recipientName && <p className="text-xs text-muted">Received by {p.recipientName}</p>}
                  {p.conditionNotes && <p className="mt-1 text-sm text-slate-ink">Condition: {p.conditionNotes}</p>}
                  {p.photos.length > 0 && <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{p.photos.map((f) => f && <li key={f.id}><Thumb claimId={c.id} file={f} label={p.kind.toLowerCase()} /></li>)}</ul>}
                </li>
              ))}
            </ul>
            {order.pieces.some((p) => p.conditionNotes) && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-navy">Piece condition notes</h3>
                <ul className="mt-1 space-y-1 text-sm text-slate-ink">{order.pieces.filter((p) => p.conditionNotes).map((p) => <li key={p.pieceId}><span className="font-mono text-xs">{p.pieceId}</span> {p.conditionNotes}</li>)}</ul>
              </div>
            )}
          </Panel>

          <Panel title="Chain of custody">
            {data.custody.length === 0 && <p className="text-sm text-muted">No chain-of-custody events recorded for this order.</p>}
            <ol className="relative space-y-3 border-l-2 border-line pl-5">
              {data.custody.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-navy" aria-hidden />
                  <p className="text-charcoal">{e.detail ?? e.type}</p>
                  <p className="text-xs text-muted">{when(e.createdAt)}{e.actorName ? ` · ${e.actorName}` : ""}{e.uploadIds.length ? ` · ${e.uploadIds.length} photo(s)` : ""}</p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title="Amounts">
            <dl className="space-y-3 text-sm">
              <Row label="Claimed">{money(c.claimedCents)}</Row>
              <Row label="Plan maximum (per order)">{money(c.maxBenefitCents)}</Row>
              <Row label="Still available on this order">{money(data.remainingCents)}</Row>
              {c.decisionCents != null && <Row label="Decision">{money(c.decisionCents)}{c.decidedBy ? ` · ${c.decidedBy}` : ""}</Row>}
              <Row label="Protection fee paid">{money(order.protectionCents)}</Row>
            </dl>
            {c.decisionNote && <p className="mt-3 rounded-xl bg-cloud p-3 text-sm text-slate-ink">{c.decisionNote}</p>}
          </Panel>
          <Panel title="Customer">
            <p className="text-sm font-semibold text-navy">{c.customer.name}</p>
            <p className="text-xs text-muted">{c.customer.email}{c.customer.phone ? ` · ${c.customer.phone}` : ""}</p>
            <Link href={`/admin/orders/${order.id}`} className="mt-3 inline-block text-sm font-semibold text-orange-700 hover:underline">Open order {order.reference}</Link>
          </Panel>
          {canDecide && open && <DecisionPanel id={c.id} claimed={c.claimedCents} remaining={data.remainingCents} onDone={reload} />}
          {canPay && ["APPROVED", "PARTIAL"].includes(c.status) && <PayoutPanel id={c.id} amount={c.decisionCents ?? 0} onDone={reload} />}
          {canDecide && <NotePanel id={c.id} onDone={reload} />}
          <Panel title="Timeline">
            <ol className="space-y-3 text-sm">
              {data.events.map((e) => (
                <li key={e.id}>
                  <p className="text-charcoal">{e.note ?? e.type}</p>
                  <p className="text-xs text-muted">{when(e.createdAt)} · {e.actorType === "customer" ? "Customer" : e.actorName ?? "Staff"}{!e.customerVisible ? " · internal" : ""}</p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted">{label}</dt><dd className="font-semibold text-navy">{children}</dd></div>;
}

function DecisionPanel({ id, claimed, remaining, onDone }: { id: string; claimed: number; remaining: number; onDone: () => void }) {
  const [status, setStatus] = useState<"UNDER_REVIEW" | "NEED_INFO" | "APPROVED" | "PARTIAL" | "DENIED">("APPROVED");
  const [amount, setAmount] = useState((Math.min(claimed, remaining) / 100).toFixed(2));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsAmount = status === "APPROVED" || status === "PARTIAL";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/protection/claims/${id}/decision`, { method: "POST", json: { status, note: note || undefined, ...(needsAmount ? { decisionCents: status === "APPROVED" ? claimed : Math.round(Number(amount) * 100) } : {}) } });
      setNote("");
      onDone();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Decision">
      <form onSubmit={submit} className="space-y-3">
        <ErrorNote message={error} />
        <Field label="Outcome" htmlFor="dc-status">
          <select id="dc-status" className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="APPROVED">Approve the full amount</option>
            <option value="PARTIAL">Approve part of the amount</option>
            <option value="DENIED">Deny</option>
            <option value="NEED_INFO">Ask the customer for more information</option>
            <option value="UNDER_REVIEW">Mark under review</option>
          </select>
        </Field>
        {status === "PARTIAL" && <Field label="Approved amount ($)" htmlFor="dc-amt" hint={`Up to ${money(Math.min(claimed, remaining))}`}><input id="dc-amt" type="number" min={0.01} step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>}
        <Field label={status === "NEED_INFO" ? "What do you need from the customer?" : "Decision note (shared with the customer)"} htmlFor="dc-note"><textarea id="dc-note" rows={3} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <button className="btn-primary w-full" disabled={busy}><Gavel className="h-4 w-4" aria-hidden /> {busy ? "Saving…" : "Record decision"}</button>
      </form>
    </Panel>
  );
}

function PayoutPanel({ id, amount, onDone }: { id: string; amount: number; onDone: () => void }) {
  const [method, setMethod] = useState("check");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api(`/protection/claims/${id}/pay`, { method: "POST", json: { method, reference: reference || undefined } });
      onDone();
    } catch (err) {
      setError((err as ApiError).message);
    }
  };
  return (
    <Panel title="Record payout">
      <form onSubmit={submit} className="space-y-3">
        <ErrorNote message={error} />
        <p className="text-sm text-slate-ink">Pay {money(amount)} to the customer, then record it here. It is saved as a refund on the order.</p>
        <Field label="Method" htmlFor="po-m"><select id="po-m" className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}><option value="check">Check</option><option value="ach">ACH</option><option value="stripe">Card refund (Stripe)</option><option value="cash">Cash</option><option value="account">Account credit</option></select></Field>
        <Field label="Reference (check no., transfer id)" htmlFor="po-r"><input id="po-r" className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <button className="btn-navy w-full"><Banknote className="h-4 w-4" aria-hidden /> Mark as paid</button>
      </form>
    </Panel>
  );
}

function NotePanel({ id, onDone }: { id: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    await api(`/protection/claims/${id}/notes`, { method: "POST", json: { note } }).catch(() => undefined);
    setNote("");
    onDone();
  };
  return (
    <Panel title="Internal note">
      <form onSubmit={submit} className="space-y-2">
        <label htmlFor="cn-note" className="sr-only">Internal note</label>
        <textarea id="cn-note" rows={2} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible to staff only" />
        <button className="btn-ghost !px-4 !py-2"><MessageSquarePlus className="h-4 w-4" aria-hidden /> Add note</button>
      </form>
    </Panel>
  );
}
