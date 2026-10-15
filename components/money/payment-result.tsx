"use client";

/** Post-checkout confirmation. Polls payment status briefly (webhooks can take a few seconds). */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { contact } from "@/content/site";
import { publicApi, usd } from "./public-api";

export function PaymentResult() {
  const params = useSearchParams();
  const session = params.get("session") ?? params.get("session_id") ?? "";
  const back = params.get("return") || "/";
  const [state, setState] = useState<{ status: string; amountCents?: number; kind?: string } | null>(null);

  useEffect(() => {
    if (!session) return setState({ status: "RECEIVED" });
    let tries = 0;
    let stop = false;
    const poll = async () => {
      try {
        const r = await publicApi<{ status: string; amountCents: number; kind: string }>(`/pay/status/${encodeURIComponent(session)}`);
        setState(r);
        // Conversion hook for consented analytics/ads (components/marketing/consent-and-tags.tsx)
        if (r.status === "SUCCEEDED") window.dispatchEvent(new CustomEvent("eb:booking-completed", { detail: { reference: session, valueCents: r.amountCents } }));
        if (r.status === "PENDING" && tries++ < 10 && !stop) setTimeout(poll, 1500);
      } catch {
        setState({ status: "RECEIVED" });
      }
    };
    poll();
    return () => {
      stop = true;
    };
  }, [session]);

  const done = state?.status === "SUCCEEDED" || state?.status === "RECEIVED";
  return (
    <section className="grid min-h-[70vh] place-items-center bg-cloud px-4 py-16">
      <div className="w-full max-w-lg rounded-3xl border border-line bg-white p-8 text-center shadow-[var(--shadow-lift)]" aria-live="polite">
        {done ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden /> : <Clock className="mx-auto h-12 w-12 text-orange" aria-hidden />}
        <h1 className="mt-4 text-3xl font-bold">{done ? "Payment received" : state?.status === "FAILED" ? "Payment not completed" : "Confirming your payment…"}</h1>
        <p className="mt-3 text-slate-ink">
          {done
            ? `Thank you${state?.amountCents ? `, we received ${usd(state.amountCents)}` : ""}. A receipt is on its way, and our dispatch team will confirm the details of your job.`
            : state?.status === "FAILED"
              ? "Your card was not charged. You can try again, or call our office for help."
              : "This usually takes a few seconds."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={back.startsWith("/") ? back : "/"} className="btn-primary">Back to your document</Link>
          <a href={contact.phoneHref} className="btn-ghost">{contact.phoneDisplay}</a>
        </div>
      </div>
    </section>
  );
}
