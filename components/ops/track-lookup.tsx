"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Circle, Clock, Loader2, MapPin, Package, PackageCheck, Phone, ShieldCheck, Truck, UserRound } from "lucide-react";
import { contact } from "@/content/site";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

type Tracking = {
  reference: string;
  status: string;
  statusLabel: string;
  steps: { status: string; label: string }[];
  cancelled: boolean;
  serviceDate: string;
  timeWindow: string | null;
  pickup: { type: string | null; label: string | null };
  delivery: { type: string | null; label: string | null };
  pieces: { total: number; delivered: number };
  events: { id: string; label: string | null; detail: string | null; at: string }[];
  proof: { at: string; recipientName: string | null; pieceCount: number } | null;
  carrierTracking: { carrier: string; trackingNumber: string; status: string; serviceLevel: string }[];
  driver: { firstName: string; contact: string; contactHref: string } | null;
};

const inputCls =
  "w-full rounded-xl border border-line bg-white px-4 py-3 text-base text-charcoal shadow-sm outline-none transition placeholder:text-muted focus:border-navy focus:ring-2 focus:ring-navy/15";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Public tracking: reference + one verifier (email, phone last 4 or delivery ZIP). */
export function TrackLookup() {
  const params = useSearchParams();
  const [reference, setReference] = useState(params.get("ref") ?? "");
  const [verifier, setVerifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Tracking | null>(null);

  useEffect(() => {
    if (data) document.getElementById("track-result")?.focus();
  }, [data]);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (reference.trim().length < 6 || verifier.trim().length < 4) {
      setError("Enter your Express Bags reference and the email, phone (last 4 digits) or delivery ZIP you booked with.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/v1/track`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: reference.trim(), verifier: verifier.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setData(null);
        setError(body.error || "Tracking is unavailable right now. Please call our office.");
      } else setData(body.tracking);
    } catch {
      setError(`We couldn't reach tracking right now. Please try again or call ${contact.phoneDisplay}.`);
    } finally {
      setBusy(false);
    }
  }

  const currentIdx = data ? data.steps.findIndex((s) => s.status === data.status) : -1;

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <form onSubmit={lookup} noValidate className="card p-6 md:p-8" aria-describedby="track-help">
          <h2 className="text-2xl font-bold">Find your delivery</h2>
          <p id="track-help" className="mt-2 text-sm text-slate-ink">Use the Express Bags reference from your confirmation (it starts with EB-), plus one detail from your booking.</p>
          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="trk-ref" className="mb-1.5 block text-sm font-medium text-navy">Express Bags reference</label>
              <input id="trk-ref" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="EB-261120-7K3P" value={reference} onChange={(e) => setReference(e.target.value)} className={`${inputCls} font-mono uppercase`} />
            </div>
            <div>
              <label htmlFor="trk-ver" className="mb-1.5 block text-sm font-medium text-navy">Booking email, phone last 4, or delivery ZIP</label>
              <input id="trk-ver" autoComplete="off" placeholder="you@example.com, 0199 or 33139" value={verifier} onChange={(e) => setVerifier(e.target.value)} className={inputCls} />
            </div>
          </div>
          {error && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</p>}
          <button disabled={busy} className="btn-primary mt-6 w-full !py-3.5 text-base">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking…</> : "Track delivery"}
          </button>
          <p className="mt-4 flex items-start gap-2 text-xs text-muted"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange" aria-hidden /> For your privacy, we only show a delivery when the reference and a booking detail match.</p>
        </form>
        <div className="mt-6 rounded-2xl bg-cloud p-5 text-sm text-slate-ink">
          <p className="font-semibold text-navy">Shipping with a national carrier?</p>
          <p className="mt-1">Express Bags references and carrier tracking numbers are different. When your bags travel with UPS, FedEx or another carrier, the carrier number appears below your Express Bags status, clearly labeled.</p>
          <p className="mt-3">Questions about a job in progress? Call dispatch through our office: <a href={contact.phoneHref} className="font-semibold text-orange-700 underline">{contact.phoneDisplay}</a>.</p>
        </div>
      </div>

      <div className="lg:col-span-7">
        {!data ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line bg-white p-10 text-center">
            <Package className="h-12 w-12 text-orange" strokeWidth={1.4} aria-hidden />
            <p className="mt-4 font-display text-xl font-bold text-navy">Your delivery status appears here</p>
            <p className="mt-2 max-w-sm text-sm text-slate-ink">Order confirmed, driver assigned, picked up, in transit and delivered, with proof of delivery when the job is complete.</p>
          </div>
        ) : (
          <section id="track-result" tabIndex={-1} aria-live="polite" className="scroll-mt-28 overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-lift)] outline-none">
            <div className="relative overflow-hidden bg-navy p-6 text-white md:p-8">
              <div aria-hidden className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[3px] border-orange/60" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">Express Bags reference</p>
              <p className="mt-1 font-mono text-2xl font-bold">{data.reference}</p>
              <p className="mt-4 text-3xl font-extrabold text-white md:text-4xl">{data.cancelled ? "Cancelled" : data.statusLabel}</p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/75">
                <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden />{new Date(data.serviceDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
                <span className="inline-flex items-center gap-1.5"><Package className="h-4 w-4" aria-hidden />{data.pieces.delivered > 0 ? `${data.pieces.delivered} of ${data.pieces.total} delivered` : `${data.pieces.total} piece${data.pieces.total === 1 ? "" : "s"}`}</span>
              </p>
            </div>

            {!data.cancelled && (
              <ol className="grid gap-0 border-b border-line p-6 md:p-8" aria-label="Progress">
                {data.steps.map((s, i) => {
                  const done = i < currentIdx || data.status === "DELIVERED";
                  const current = i === currentIdx && data.status !== "DELIVERED";
                  return (
                    <li key={s.status} className="relative flex gap-4 pb-5 last:pb-0">
                      {i < data.steps.length - 1 && <span aria-hidden className={`absolute left-[11px] top-6 h-full w-0.5 ${done ? "bg-orange" : "bg-line"}`} />}
                      <span className="relative z-10 mt-0.5">
                        {done ? <CheckCircle2 className="h-6 w-6 text-orange" aria-hidden /> : current ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange ring-4 ring-orange/20"><span className="h-2 w-2 rounded-full bg-white" /></span> : <Circle className="h-6 w-6 text-line" aria-hidden />}
                      </span>
                      <span className={`text-sm ${current ? "font-bold text-navy" : done ? "font-medium text-charcoal" : "text-muted"}`}>{s.label}{current && <span className="sr-only"> (current)</span>}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="grid gap-4 p-6 md:grid-cols-2 md:p-8">
              <Stop Icon={MapPin} label="Pickup" value={data.pickup.label} />
              <Stop Icon={PackageCheck} label="Delivery" value={data.delivery.label} />
              {data.driver && (
                <div className="rounded-xl bg-orange-50 p-4 md:col-span-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-navy"><UserRound className="h-4 w-4 text-orange" aria-hidden /> Your driver: {data.driver.firstName}</p>
                  <p className="mt-1 text-sm text-slate-ink">For anything about this job, call <a href={data.driver.contactHref} className="inline-flex items-center gap-1 font-semibold text-orange-700 underline"><Phone className="h-3.5 w-3.5" aria-hidden />{data.driver.contact}</a>.</p>
                </div>
              )}
              {data.proof && (
                <div className="rounded-xl bg-emerald-50 p-4 md:col-span-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><CheckCircle2 className="h-4 w-4" aria-hidden /> Delivered {fmt(data.proof.at)}</p>
                  <p className="mt-1 text-sm text-emerald-900/80">{data.proof.pieceCount} piece{data.proof.pieceCount === 1 ? "" : "s"} handed over{data.proof.recipientName ? ` to ${data.proof.recipientName}` : ""}. Proof of delivery is on file.</p>
                </div>
              )}
              {data.carrierTracking.length > 0 && (
                <div className="rounded-xl border border-line p-4 md:col-span-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-navy"><Truck className="h-4 w-4 text-orange" aria-hidden /> Carrier tracking (separate from your Express Bags reference)</p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-ink">
                    {data.carrierTracking.map((c) => <li key={c.trackingNumber}>{c.carrier} tracking number <span className="font-mono font-semibold">{c.trackingNumber}</span> · {c.status.toLowerCase().replaceAll("_", " ")}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {data.events.length > 0 && (
              <div className="border-t border-line p-6 md:p-8">
                <h3 className="font-display text-sm font-bold uppercase tracking-[0.14em] text-muted">Updates</h3>
                <ul className="mt-3 space-y-3">
                  {data.events.map((e) => (
                    <li key={e.id} className="flex justify-between gap-4 text-sm">
                      <span className="text-charcoal">{e.label}{e.detail && e.detail !== e.label ? <span className="block text-xs text-muted">{e.detail}</span> : null}</span>
                      <time dateTime={e.at} className="shrink-0 text-xs text-muted">{fmt(e.at)}</time>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Stop({ Icon, label, value }: { Icon: typeof MapPin; label: string; value: string | null }) {
  return (
    <div className="rounded-xl bg-cloud p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted"><Icon className="h-3.5 w-3.5" aria-hidden /> {label}</p>
      <p className="mt-1 text-sm font-medium text-charcoal">{value ?? "Shared with your confirmation"}</p>
    </div>
  );
}
