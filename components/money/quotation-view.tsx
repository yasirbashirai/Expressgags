"use client";

/**
 * Customer quotation page (/q/[token]): premium document view, electronic acceptance
 * (typed name + title + agreement), decline with reason, PDF download and deposit checkout.
 * Never shows internal cost or margin (the API does not send them).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Download, FileSignature, MapPin, Phone, ShieldCheck, XCircle } from "lucide-react";
import { contact } from "@/content/site";
import { DocLines, DocShell, DocStatus, DocTotals } from "./doc-shell";
import { API_URL, longDate, publicApi, PublicApiError, qty, usd } from "./public-api";

type Loc = { type?: string; address?: string; market?: string };
type Quotation = {
  reference: string;
  status: string;
  title: string;
  scope: string | null;
  terms: string | null;
  validUntil: string | null;
  sentAt: string | null;
  customer: { name: string; company: string | null };
  lines: { kind: string; description: string; quantity: number; unit: string | null; unitCents: number; totalCents: number }[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
  depositPaid: boolean;
  acceptedAt: string | null;
  acceptedName: string | null;
  declinedAt: string | null;
  orderReference: string | null;
  details: { serviceType: string; serviceDate: string; timeWindow: string | null; pickup: Loc; delivery: Loc } | null;
};

const WINDOW: Record<string, string> = { "early-morning": "Early morning", morning: "Morning", midday: "Midday", afternoon: "Afternoon", evening: "Evening", "after-hours": "After hours", flexible: "Flexible" };

export function QuotationView({ token }: { token: string }) {
  const [q, setQ] = useState<Quotation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    publicApi<{ quotation: Quotation }>(`/q/${token}`)
      .then((r) => setQ(r.quotation))
      .catch((e: PublicApiError) => setError(e.message));
  }, [token]);
  useEffect(load, [load]);

  if (error) {
    return (
      <section className="bg-cloud py-24">
        <div className="container-eb max-w-xl text-center">
          <XCircle className="mx-auto h-10 w-10 text-orange" aria-hidden />
          <h1 className="mt-4 text-3xl font-bold">Quotation unavailable</h1>
          <p className="mt-3 text-slate-ink">{error}</p>
          <a href={contact.phoneHref} className="btn-primary mt-6"><Phone className="h-4 w-4" aria-hidden /> Call {contact.phoneDisplay}</a>
        </div>
      </section>
    );
  }
  if (!q) return <div className="grid min-h-[60vh] place-items-center text-sm text-muted" aria-live="polite">Loading your quotation…</div>;

  const open = q.status === "VIEWED" || q.status === "SENT";
  const accepted = q.status === "ACCEPTED" || q.status === "CONVERTED";

  return (
    <DocShell
      kind="Quotation"
      number={q.reference}
      status={<DocStatus status={q.status} />}
      aside={
        <>
          {open && <AcceptCard token={token} q={q} onDone={load} />}
          {accepted && <AcceptedCard token={token} q={q} />}
          {q.status === "EXPIRED" && <InfoCard title="This quotation has expired" text="Prices and availability may have changed. Contact us and we will prepare an updated quotation." />}
          {q.status === "DECLINED" && <InfoCard title="Quotation declined" text="Thank you for letting us know. If your plans change, we are happy to quote again." />}
          <a href={`${API_URL}/v1/q/${token}/pdf`} className="btn-ghost w-full"><Download className="h-4 w-4" aria-hidden /> Download PDF</a>
          <div className="rounded-2xl border border-line bg-white p-5 text-sm text-slate-ink">
            <p className="font-semibold text-navy">Questions about this quotation?</p>
            <p className="mt-1">Call our office and mention {q.reference}.</p>
            <a href={contact.phoneHref} className="mt-3 inline-flex items-center gap-2 font-semibold text-orange-700"><Phone className="h-4 w-4" aria-hidden /> {contact.phoneDisplay}</a>
          </div>
        </>
      }
    >
      <h1 className="text-2xl font-bold md:text-3xl">{q.title}</h1>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="eyebrow">Prepared for</p>
          <p className="mt-2 font-semibold text-navy">{q.customer.name}</p>
          {q.customer.company && <p className="text-sm text-slate-ink">{q.customer.company}</p>}
        </div>
        <div className="sm:text-right">
          <p className="eyebrow sm:justify-end">Valid until</p>
          <p className="mt-2 font-semibold text-navy">{longDate(q.validUntil)}</p>
          <p className="text-sm text-slate-ink">Issued {longDate(q.sentAt)}</p>
        </div>
      </div>

      {q.details && (
        <div className="mt-8 grid gap-3 rounded-2xl bg-navy-50 p-5 text-sm sm:grid-cols-3">
          <Detail Icon={MapPin} label="Pickup" value={q.details.pickup?.address} />
          <Detail Icon={MapPin} label="Delivery" value={q.details.delivery?.address} />
          <Detail Icon={CalendarDays} label="Service date" value={`${longDate(q.details.serviceDate)}${q.details.timeWindow ? ` · ${WINDOW[q.details.timeWindow] ?? q.details.timeWindow}` : ""}`} />
        </div>
      )}

      <div className="mt-8">
        <DocLines lines={q.lines} fmt={usd} qtyFmt={qty} />
        <DocTotals
          rows={[
            { label: "Subtotal", value: usd(q.subtotalCents) },
            ...(q.discountCents ? [{ label: "Discount", value: `-${usd(q.discountCents)}` }] : []),
            ...(q.taxCents ? [{ label: "Tax", value: usd(q.taxCents) }] : []),
            { label: "Total", value: usd(q.totalCents), strong: true },
            ...(q.depositCents ? [{ label: "Deposit due on acceptance", value: usd(q.depositCents) }] : []),
          ]}
        />
      </div>

      {q.scope && <TextBlock title="Scope, assumptions and change policy" text={q.scope} />}
      {q.terms && <TextBlock title="Terms" text={q.terms} />}
      <p className="mt-8 flex items-start gap-2 rounded-xl border border-line p-4 text-xs text-slate-ink">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-orange" aria-hidden />
        Every route, time window, vehicle and access requirement is confirmed by our dispatch team. Same-day or urgent changes are subject to capacity and dispatch confirmation.
      </p>
    </DocShell>
  );
}

function Detail({ Icon, label, value }: { Icon: typeof MapPin; label: string; value?: string }) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-orange" aria-hidden />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-navy/70">{label}</p>
        <p className="mt-0.5 text-charcoal">{value || "-"}</p>
      </div>
    </div>
  );
}

function TextBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wider text-navy">{title}</h2>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-ink">{text}</p>
    </div>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="font-display font-bold text-navy">{title}</p>
      <p className="mt-2 text-sm text-slate-ink">{text}</p>
    </div>
  );
}

function AcceptCard({ token, q, onDone }: { token: string; q: Quotation; onDone: () => void }) {
  const [mode, setMode] = useState<"accept" | "decline">("accept");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [agree, setAgree] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const accept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setErr("Type your full name to sign.");
    if (!agree) return setErr("Please confirm you agree to the quotation and terms.");
    setBusy(true);
    setErr(null);
    try {
      const r = await publicApi<{ depositDue: boolean }>(`/q/${token}/accept`, { json: { name: name.trim(), title: title.trim() || undefined, agree: true } });
      if (r.depositDue) {
        const c = await publicApi<{ checkoutUrl: string }>(`/q/${token}/deposit`, { json: {} });
        window.location.assign(c.checkoutUrl);
        return;
      }
      onDone();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const decline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 2) return setErr("Tell us briefly why, so we can help.");
    setBusy(true);
    setErr(null);
    try {
      await publicApi(`/q/${token}/decline`, { json: { reason: reason.trim() } });
      onDone();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2">
        <FileSignature className="h-5 w-5 text-orange" aria-hidden />
        <p className="font-display text-lg font-bold text-navy">{mode === "accept" ? "Accept this quotation" : "Decline this quotation"}</p>
      </div>
      <p className="mt-1 text-sm text-slate-ink">
        Total {usd(q.totalCents)}
        {q.depositCents ? `, deposit ${usd(q.depositCents)} due today` : ""}.
      </p>
      {mode === "accept" ? (
        <form onSubmit={accept} className="mt-4 space-y-3" noValidate>
          <div>
            <label htmlFor="acc-name" className="mb-1 block text-sm font-medium text-navy">Full name (your electronic signature)</label>
            <input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required className="w-full rounded-xl border border-line px-3.5 py-2.5 font-display text-lg text-navy outline-none focus:border-navy focus:ring-2 focus:ring-navy/15" />
          </div>
          <div>
            <label htmlFor="acc-title" className="mb-1 block text-sm font-medium text-navy">Title or company role <span className="font-normal text-muted">(optional)</span></label>
            <input id="acc-title" value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="organization-title" className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/15" />
          </div>
          <label className="flex items-start gap-2.5 text-sm text-slate-ink">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-4 w-4 accent-[#E06010]" />
            <span>I agree to this quotation, its scope and terms, and to sign electronically. I understand <Link href="/terms#prohibited-items" className="text-orange-700 underline">prohibited items</Link> are not accepted.</span>
          </label>
          {err && <p role="alert" className="text-sm font-medium text-rose-700">{err}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "Processing…" : q.depositCents ? `Accept and pay ${usd(q.depositCents)} deposit` : "Accept quotation"}</button>
          <button type="button" onClick={() => { setMode("decline"); setErr(null); }} className="w-full text-center text-sm font-medium text-muted underline">Decline instead</button>
        </form>
      ) : (
        <form onSubmit={decline} className="mt-4 space-y-3" noValidate>
          <div>
            <label htmlFor="dec-reason" className="mb-1 block text-sm font-medium text-navy">Reason</label>
            <textarea id="dec-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/15" />
          </div>
          {err && <p role="alert" className="text-sm font-medium text-rose-700">{err}</p>}
          <button type="submit" disabled={busy} className="btn-navy w-full">{busy ? "Sending…" : "Decline quotation"}</button>
          <button type="button" onClick={() => { setMode("accept"); setErr(null); }} className="w-full text-center text-sm font-medium text-muted underline">Back to accept</button>
        </form>
      )}
    </div>
  );
}

function AcceptedCard({ token, q }: { token: string; q: Quotation }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pay = async () => {
    setBusy(true);
    setErr(null);
    try {
      const c = await publicApi<{ checkoutUrl: string }>(`/q/${token}/deposit`, { json: {} });
      window.location.assign(c.checkoutUrl);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  const depositDue = q.depositCents > 0 && !q.depositPaid;
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-center gap-2 text-emerald-800">
        <CheckCircle2 className="h-5 w-5" aria-hidden />
        <p className="font-display text-lg font-bold">Accepted, thank you</p>
      </div>
      <p className="mt-2 text-sm text-emerald-900">
        Signed by {q.acceptedName} on {longDate(q.acceptedAt)}.{q.orderReference ? ` Your order reference is ${q.orderReference}.` : ""}
      </p>
      {depositDue ? (
        <>
          <button onClick={pay} disabled={busy} className="btn-primary mt-4 w-full">{busy ? "Opening checkout…" : `Pay ${usd(q.depositCents)} deposit`}</button>
          {err && <p role="alert" className="mt-2 text-sm text-rose-700">{err}</p>}
        </>
      ) : (
        <p className="mt-3 text-sm text-emerald-900">{q.depositCents ? "Deposit received. " : ""}Our dispatch team will confirm vehicle, team and timing with you.</p>
      )}
    </div>
  );
}
