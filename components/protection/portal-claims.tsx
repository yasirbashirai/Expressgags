"use client";

/**
 * Customer portal: Express Bags protection claims (Master §8.1). Only reachable when protection
 * is live (the API answers 404 otherwise). Customers file a claim on a protected order, attach
 * categorized evidence, follow the status and answer information requests.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, FileText, ShieldCheck, Upload } from "lucide-react";
import { API_URL } from "@/components/portal/api";
import { Alert, Card, Empty, Field, input, Loading, PageTitle, SubmitButton } from "@/components/portal/ui";

class ClaimsError extends Error {
  constructor(public status: number, message: string, public details?: { path?: string; message?: string }[]) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/protection${path}`, {
      credentials: "include",
      ...rest,
      headers: json !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ClaimsError(0, "We could not reach Express Bags right now. Please try again or call our office.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ClaimsError(res.status, data.error || `Request failed (${res.status})`, data.details);
  return data as T;
}

const usd = (c: number | null | undefined) => (c == null ? "—" : (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }));
const STATUS: Record<string, string> = { SUBMITTED: "Submitted", UNDER_REVIEW: "Under review", NEED_INFO: "Information needed", APPROVED: "Approved", PARTIAL: "Partially approved", DENIED: "Not approved", PAID: "Paid" };
const CATEGORIES = [
  { value: "damage-photo", label: "Photo of the damage or loss" },
  { value: "proof-of-value", label: "Receipt or proof of value" },
  { value: "pre-trip-photo", label: "Photo of the bag before the trip" },
  { value: "other", label: "Other document" },
] as const;
type Category = (typeof CATEGORIES)[number]["value"];

/** True when protection is live (used by the portal navigation). */
export function useProtectionLive() {
  const [live, setLive] = useState(false);
  useEffect(() => {
    let on = true;
    // Boolean from public config (no 404 probing of the plans endpoint while the module is off)
    fetch(`${API_URL}/v1/public-config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => on && setLive(!!j?.protectionLive))
      .catch(() => undefined);
    return () => {
      on = false;
    };
  }, []);
  return live;
}

function NotAvailable() {
  return <Empty title="Protection claims are not available" text="Express Bags protection is not currently offered on this account. For any concern about an order, please contact our office." />;
}

/* ---------------------------------- List --------------------------------- */

type ClaimRow = { id: string; reference: string; status: string; tier: string; claimedCents: number; decisionCents: number | null; createdAt: string; order: { reference: string } };

export function ClaimsListPage() {
  const [rows, setRows] = useState<ClaimRow[] | null>(null);
  const [error, setError] = useState<ClaimsError | null>(null);
  useEffect(() => {
    call<{ claims: ClaimRow[] }>("/claims").then((r) => setRows(r.claims)).catch(setError);
  }, []);
  if (error?.status === 404) return <><PageTitle title="Protection claims" /><NotAvailable /></>;
  return (
    <div className="space-y-6">
      <PageTitle title="Protection claims" sub="File and follow claims on orders that include Express Bags protection." actions={<Link href="/account/claims/new" className="btn-primary"><ShieldCheck className="h-4 w-4" aria-hidden /> File a claim</Link>} />
      {error && <Alert>{error.message}</Alert>}
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && <Empty title="No claims" text="If something went wrong with a protected order, you can file a claim here." href="/account/claims/new" cta="File a claim" />}
      {rows && rows.length > 0 && (
        <ul className="grid gap-3">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/account/claims/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-line bg-white p-5 shadow-[var(--shadow-card)] hover:border-orange/40">
                <span>
                  <span className="block font-semibold text-navy">{c.reference}</span>
                  <span className="block text-xs text-muted">Order {c.order.reference} · {c.tier.toUpperCase()} plan · filed {new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold text-navy">{STATUS[c.status] ?? c.status}</span>
                  <span className="block text-xs text-muted">Claimed {usd(c.claimedCents)}{c.decisionCents != null ? ` · decision ${usd(c.decisionCents)}` : ""}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------ Evidence picker --------------------------- */

type Evidence = { uploadId: string; category: Category; name: string };

function EvidencePicker({ items, setItems }: { items: Evidence[]; setItems: (v: Evidence[]) => void }) {
  const [category, setCategory] = useState<Category>("damage-photo");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setErr(null);
    try {
      const next = [...items];
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        const r = await call<{ id: string }>("/uploads", { method: "POST", body: fd });
        next.push({ uploadId: r.id, category, name: f.name });
      }
      setItems(next);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <Field id="ev-cat" label="What are you adding?">
            <select id="ev-cat" className={input} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
        </div>
        <label className="btn-ghost cursor-pointer">
          <Upload className="h-4 w-4" aria-hidden /> {busy ? "Uploading…" : "Choose files"}
          <input type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={(e) => onFiles(e.target.files)} />
        </label>
      </div>
      {err && <Alert>{err}</Alert>}
      {items.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {items.map((e, i) => (
            <li key={e.uploadId} className="flex items-center justify-between gap-3 rounded-xl bg-cloud px-3 py-2">
              <span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-navy" aria-hidden /><span className="truncate">{e.name}</span></span>
              <span className="flex shrink-0 items-center gap-3 text-xs text-muted">{CATEGORIES.find((c) => c.value === e.category)?.label}<button type="button" className="font-semibold text-orange-700" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</button></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------- New ----------------------------------- */

type Eligible = { id: string; reference: string; serviceDate: string; tierName: string; maxBenefitCents: number; remainingCents: number; withinWindow: boolean };
type PlanInfo = { displayName: string; termsUrl: string | null; evidenceRules: string[]; claimWindowDays: number; note: string };

export function NewClaimPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Eligible[] | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([call<{ orders: Eligible[] }>("/eligible-orders"), call<PlanInfo>("/plans")])
      .then(([o, p]) => {
        setOrders(o.orders);
        setPlan(p);
        const first = o.orders.find((x) => x.withinWindow && x.remainingCents > 0);
        if (first) setOrderId(first.id);
      })
      .catch((e: ClaimsError) => (e.status === 404 ? setUnavailable(true) : setError(e.message)));
  }, []);

  if (unavailable) return <><PageTitle title="File a claim" /><NotAvailable /></>;
  const selected = orders?.find((o) => o.id === orderId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const r = await call<{ claim: { id: string } }>("/claims", { method: "POST", json: { orderId, description, claimedCents: Math.round(Number(amount) * 100), evidence: evidence.map(({ uploadId, category }) => ({ uploadId, category })) } });
      router.push(`/account/claims/${r.claim.id}?filed=1`);
    } catch (err) {
      const ce = err as ClaimsError;
      setError(ce.message);
      setFields(Object.fromEntries((ce.details ?? []).filter((d) => d.path).map((d) => [d.path!, d.message ?? "Check this field"])));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/account/claims" className="inline-flex items-center gap-1 text-sm text-slate-ink hover:text-navy"><ArrowLeft className="h-4 w-4" aria-hidden /> Claims</Link>
      <PageTitle title="File a protection claim" sub={plan ? `${plan.displayName}. ${plan.note}` : undefined} />
      {error && <Alert>{error}</Alert>}
      {!orders && !error && <Loading />}
      {orders && orders.length === 0 && <Empty title="No protected orders" text="Claims can only be filed on orders that included Express Bags protection." />}
      {orders && orders.length > 0 && (
        <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
          <Card title="Your claim" className="lg:col-span-2">
            <div className="space-y-4">
              <Field id="cl-order" label="Order" error={fields.orderId}>
                <select id="cl-order" className={input} value={orderId} onChange={(e) => setOrderId(e.target.value)} required>
                  <option value="" disabled>Choose an order</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id} disabled={!o.withinWindow || o.remainingCents === 0}>
                      {o.reference} · {o.tierName} plan · {new Date(o.serviceDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{!o.withinWindow ? " (claim window closed)" : o.remainingCents === 0 ? " (benefit used)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="cl-desc" label="What happened?" hint="Which bag, what was damaged or missing, and when you noticed it." error={fields.description}>
                <textarea id="cl-desc" rows={5} className={input} value={description} onChange={(e) => setDescription(e.target.value)} required minLength={20} />
              </Field>
              <Field id="cl-amt" label="Amount claimed (USD)" hint={selected ? `Up to ${usd(selected.remainingCents)} remaining on this order (the plan maximum applies per order, not per item).` : undefined} error={fields.claimedCents}>
                <input id="cl-amt" type="number" min={1} step="0.01" className={input} value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </Field>
              <div>
                <p className="mb-2 text-sm font-medium text-navy">Evidence</p>
                <EvidencePicker items={evidence} setItems={setEvidence} />
              </div>
              <SubmitButton busy={busy}>Submit claim</SubmitButton>
            </div>
          </Card>
          <Card title="What to include">
            <ul className="list-disc space-y-2 pl-5 text-sm text-slate-ink">{plan?.evidenceRules.map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="mt-4 text-xs text-muted">Claims must be filed within {plan?.claimWindowDays} days of delivery. Every claim is reviewed against our pickup and intake records and the published terms.{plan?.termsUrl ? " " : ""}{plan?.termsUrl && <a className="text-orange-700 underline" href={plan.termsUrl} target="_blank" rel="noreferrer">Read the terms</a>}</p>
          </Card>
        </form>
      )}
    </div>
  );
}

/* -------------------------------- Detail --------------------------------- */

type ClaimView = {
  claim: { id: string; reference: string; status: string; tier: string; maxBenefitCents: number; claimedCents: number; decisionCents: number | null; decisionNote: string | null; description: string; createdAt: string; order: { reference: string } };
  evidence: { id: string; category: string; uploadId: string; file: { id: string; originalName: string; mimeType: string } | null }[];
  events: { id: string; type: string; note: string | null; actorType: string; createdAt: string }[];
};

export function ClaimDetailPage({ id, filed }: { id: string; filed?: boolean }) {
  const [data, setData] = useState<ClaimView | null>(null);
  const [error, setError] = useState<ClaimsError | null>(null);
  const [reply, setReply] = useState("");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const load = () => call<ClaimView>(`/claims/${id}`).then(setData).catch(setError);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (error?.status === 404) return <><PageTitle title="Claim" /><NotAvailable /></>;
  if (error) return <Alert>{error.message}</Alert>;
  if (!data) return <Loading />;
  const c = data.claim;
  const open = ["SUBMITTED", "UNDER_REVIEW", "NEED_INFO"].includes(c.status);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await call(`/claims/${id}/reply`, { method: "POST", json: { note: reply, evidence: evidence.map(({ uploadId, category }) => ({ uploadId, category })) } });
      setReply("");
      setEvidence([]);
      setSent(true);
      load();
    } catch (err) {
      setError(err as ClaimsError);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <Link href="/account/claims" className="inline-flex items-center gap-1 text-sm text-slate-ink hover:text-navy"><ArrowLeft className="h-4 w-4" aria-hidden /> Claims</Link>
      <PageTitle title={`Claim ${c.reference}`} sub={`Order ${c.order.reference} · ${c.tier.toUpperCase()} plan`} />
      {filed && <Alert tone="success">Your claim was submitted. We review it against our pickup and intake records and will update you here.</Alert>}
      {c.status === "NEED_INFO" && <Alert tone="info">We need a little more information to finish reviewing your claim. Please reply below.</Alert>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Claim" className="lg:col-span-2">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-xs uppercase tracking-wider text-muted">Status</dt><dd className="mt-1 font-semibold text-navy">{STATUS[c.status] ?? c.status}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-muted">Claimed</dt><dd className="mt-1 font-semibold text-navy">{usd(c.claimedCents)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-muted">Decision</dt><dd className="mt-1 font-semibold text-navy">{c.decisionCents != null ? usd(c.decisionCents) : "Pending"}</dd></div>
          </dl>
          <p className="mt-5 whitespace-pre-line text-sm text-charcoal">{c.description}</p>
          {c.decisionNote && <p className="mt-4 rounded-xl bg-cloud p-3 text-sm text-slate-ink">{c.decisionNote}</p>}
          <p className="mt-5 text-sm font-medium text-navy">Your evidence</p>
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.evidence.map((e) => e.file && (
              <li key={e.id}>
                <a href={`${API_URL}/v1/protection/claims/${c.id}/files/${e.file.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line bg-cloud">
                  {e.file.mimeType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${API_URL}/v1/protection/claims/${c.id}/files/${e.file.id}`} alt={e.file.originalName} className="aspect-square w-full object-cover" />
                  ) : (
                    <span className="flex aspect-square items-center justify-center p-2 text-center text-xs">{e.file.originalName}</span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Updates">
          <ol className="space-y-3 text-sm">
            {data.events.map((ev) => (
              <li key={ev.id}>
                <p className="text-charcoal">{ev.note ?? ev.type}</p>
                <p className="text-xs text-muted">{new Date(ev.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {ev.actorType === "customer" ? "You" : "Express Bags"}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      {open && (
        <Card title="Add information">
          <form onSubmit={send} className="space-y-4">
            {sent && <Alert tone="success">Thanks, your reply was added to the claim.</Alert>}
            <Field id="rp-note" label="Message">
              <textarea id="rp-note" rows={3} className={input} value={reply} onChange={(e) => setReply(e.target.value)} required minLength={2} />
            </Field>
            <EvidencePicker items={evidence} setItems={setEvidence} />
            <SubmitButton busy={busy}>Send</SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}
