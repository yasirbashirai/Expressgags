"use client";

/**
 * Development checkout stand-in used until Express Bags connects its Stripe account.
 * The API refuses these calls in production or when Stripe is configured.
 */
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FlaskConical, Lock } from "lucide-react";
import { publicApi, usd } from "./public-api";

type Session = { session: string; status: string; kind: string; amountCents: number; description: string; returnPath: string };

export function MockCheckout() {
  const session = useSearchParams().get("session") ?? "";
  const [s, setS] = useState<Session | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return setErr("Missing checkout session.");
    publicApi<Session>(`/pay/mock/${encodeURIComponent(session)}`).then(setS).catch((e) => setErr(e.message));
  }, [session]);

  const finish = async (outcome: "succeeded" | "failed") => {
    if (!s) return;
    setBusy(true);
    try {
      await publicApi(`/pay/mock/${encodeURIComponent(s.session)}/complete`, { json: { outcome } });
      window.location.assign(outcome === "succeeded" ? `/pay/success?session=${encodeURIComponent(s.session)}&return=${encodeURIComponent(s.returnPath)}` : s.returnPath);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <section className="grid min-h-[70vh] place-items-center bg-cloud px-4 py-16">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-line bg-white shadow-[var(--shadow-lift)]">
        <div className="flex items-center gap-2 bg-amber-50 px-6 py-3 text-xs font-semibold text-amber-900">
          <FlaskConical className="h-4 w-4" aria-hidden /> Test checkout. No real card is charged.
        </div>
        <div className="p-6">
          <h1 className="text-2xl font-bold">Secure payment</h1>
          {err && <p role="alert" className="mt-3 text-sm text-rose-700">{err}</p>}
          {s && (
            <>
              <p className="mt-2 text-sm text-slate-ink">{s.description}</p>
              <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted">Amount</p>
              <p className="font-display text-4xl font-extrabold text-navy">{usd(s.amountCents)}</p>
              {s.status === "SUCCEEDED" ? (
                <p className="mt-6 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800">This payment is already complete.</p>
              ) : (
                <div className="mt-6 grid gap-2">
                  <button onClick={() => finish("succeeded")} disabled={busy} className="btn-primary w-full"><Lock className="h-4 w-4" aria-hidden /> Pay {usd(s.amountCents)}</button>
                  <button onClick={() => finish("failed")} disabled={busy} className="btn-ghost w-full">Simulate a declined card</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
