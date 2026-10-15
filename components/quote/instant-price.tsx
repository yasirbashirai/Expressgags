"use client";

/**
 * Instant price & "Book and pay" panel for the review step. Renders NOTHING unless the owner has
 * approved public instant pricing (public-config flags), so the quote-only experience is unchanged.
 *
 *  - Local / airport / cruise / courier / truck / storage → /v1/pay/instant-quote (one Express Bags price)
 *  - Nationwide shipping → /v1/shipping/quote (Express Bags service levels: Economy … Next Day)
 * When no instant price is possible (custom-quote triggers, review needed, carriers unavailable) the
 * customer is told plainly and simply sends the quote request as usual.
 */
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Lock, RefreshCw, Zap } from "lucide-react";
import type { QuoteRequest } from "@/lib/quote-schema";
import { parseFinal, type QuoteDraft } from "./flow";
import { instantKind, type InstantFlags } from "./instant-kind";

export type { InstantFlags };


type LocalPrice = { available: true; retailCents: number; lines: { label: string }[]; priceToken: string; expiresInSeconds: number };
type ShippingOffer = { level: string; name: string; price: number; transitDays: number; carrier?: string; priceToken: string };
type ShippingPrice = { available: true; offers: ShippingOffer[]; pieces: number; measurementsEstimated: boolean; expiresInSeconds: number };
type Unavailable = { available: false; reason: string };

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "local"; price: LocalPrice; fp: string }
  | { kind: "shipping"; price: ShippingPrice; fp: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "error"; message: string };

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const DRAFT_KEY = "eb-quote-draft-v1";


export function InstantPrice({ draft, apiUrl, flags }: { draft: QuoteDraft; apiUrl: string; flags: InstantFlags | null }) {
  const kind = instantKind(draft.serviceType, flags);
  const parsed = useMemo(() => parseFinal(draft), [draft]);
  const fp = parsed.ok ? JSON.stringify(parsed.data) : "";
  const [state, setState] = useState<State>({ kind: "idle" });
  const [level, setLevel] = useState<string>("");
  const [booking, setBooking] = useState(false);

  // Any change to the request invalidates a shown price
  useEffect(() => {
    if ((state.kind === "local" || state.kind === "shipping") && state.fp !== fp) setState({ kind: "idle" });
  }, [fp, state]);

  if (!kind) return null;

  async function getPrice() {
    if (!parsed.ok) return;
    setState({ kind: "loading" });
    try {
      const res = await fetch(`${apiUrl}${kind === "shipping" ? "/v1/shipping/quote" : "/v1/pay/instant-quote"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (res.status === 404) return setState({ kind: "unavailable", reason: "Instant prices are not available right now. Send your request and we will reply with a written quote." });
      const body = (await res.json().catch(() => null)) as (LocalPrice | ShippingPrice | Unavailable) | null;
      if (!res.ok || !body) throw new Error("price");
      if (!body.available) return setState({ kind: "unavailable", reason: body.reason });
      if (kind === "shipping") {
        const p = body as ShippingPrice;
        const wanted = p.offers.find((o) => o.level === draft.speed) ?? p.offers[0];
        setLevel(wanted?.level ?? "");
        setState({ kind: "shipping", price: p, fp });
      } else setState({ kind: "local", price: body as LocalPrice, fp });
    } catch {
      setState({ kind: "error", message: "We couldn't load an instant price. You can still send your request below." });
    }
  }

  async function book() {
    if (!parsed.ok) return;
    const token = state.kind === "local" ? state.price.priceToken : state.kind === "shipping" ? state.price.offers.find((o) => o.level === level)?.priceToken : undefined;
    if (!token) return;
    setBooking(true);
    try {
      const res = await fetch(`${apiUrl}${kind === "shipping" ? "/v1/shipping/book" : "/v1/pay/instant-book"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: parsed.data as QuoteRequest, priceToken: token, acceptName: parsed.data.contact.name }),
      });
      const body = (await res.json().catch(() => null)) as { checkoutUrl?: string; error?: string } | null;
      if (res.status === 409) {
        setState({ kind: "error", message: body?.error ?? "Prices were updated. Please refresh your price." });
        return;
      }
      if (!res.ok || !body?.checkoutUrl) throw new Error("book");
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* storage unavailable */
      }
      window.location.assign(body.checkoutUrl);
    } catch {
      setState({ kind: "error", message: "We couldn't start your booking. Please try again or send your request below." });
    } finally {
      setBooking(false);
    }
  }

  const selected = state.kind === "shipping" ? state.price.offers.find((o) => o.level === level) : undefined;
  const total = state.kind === "local" ? state.price.retailCents : selected ? Math.round(selected.price * 100) : 0;

  return (
    <section aria-labelledby="instant-title" className="mt-8 overflow-hidden rounded-2xl border border-orange/30 bg-orange-50/60" data-testid="instant-price">
      <div className="flex items-start gap-3 border-b border-orange/20 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange text-white"><Zap className="h-4 w-4" aria-hidden /></span>
        <div>
          <h3 id="instant-title" className="text-lg font-bold text-navy">Book instantly</h3>
          <p className="text-sm text-slate-ink">
            {kind === "shipping" ? "Choose an Express Bags shipping level, including our pickup and handling." : "Get your Express Bags price now and book online, or send the request for a written quote."}
          </p>
        </div>
      </div>

      <div className="px-5 py-5" aria-live="polite">
        {state.kind === "idle" && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-ink">{parsed.ok ? "Your details are complete." : "Tick both confirmations above to see your price."}</p>
            <button type="button" onClick={() => void getPrice()} disabled={!parsed.ok} className="btn-navy">See my instant price</button>
          </div>
        )}
        {state.kind === "loading" && (
          <p className="flex items-center gap-2 text-sm text-slate-ink"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking routes, capacity rules and prices…</p>
        )}
        {state.kind === "unavailable" && <p className="text-sm text-slate-ink">{state.reason} <span className="font-semibold text-navy">Send your request below and our dispatch team will quote it.</span></p>}
        {state.kind === "error" && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p role="alert" className="text-sm text-charcoal">{state.message}</p>
            <button type="button" onClick={() => void getPrice()} className="btn-ghost"><RefreshCw className="h-4 w-4" aria-hidden /> Refresh price</button>
          </div>
        )}

        {state.kind === "local" && (
          <div>
            <p className="font-display text-4xl font-extrabold text-navy" data-testid="instant-total">{usd(state.price.retailCents)}</p>
            <p className="mt-1 text-xs text-muted">Total for this booking. Price held for {Math.round(state.price.expiresInSeconds / 60)} minutes.</p>
            {state.price.lines.length > 0 && (
              <ul className="mt-4 grid gap-1.5 text-sm text-slate-ink">
                {state.price.lines.map((l) => (
                  <li key={l.label} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange" aria-hidden /> {l.label}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {state.kind === "shipping" && (
          <fieldset>
            <legend className="sr-only">Shipping level</legend>
            <div className="grid gap-2">
              {state.price.offers.map((o) => (
                <label key={o.level} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border bg-white p-4 transition ${level === o.level ? "border-navy ring-2 ring-navy/15" : "border-line hover:border-navy/40"}`}>
                  <span className="flex items-center gap-3">
                    <input type="radio" name="instant-level" value={o.level} checked={level === o.level} onChange={() => setLevel(o.level)} className="h-4 w-4 accent-[#E06010]" />
                    <span>
                      <span className="block font-semibold text-navy">{o.name}</span>
                      <span className="block text-xs text-muted">About {o.transitDays} business day{o.transitDays === 1 ? "" : "s"} after handoff{o.carrier ? ` · ${o.carrier}` : ""}</span>
                    </span>
                  </span>
                  <span className="font-display text-xl font-bold text-navy">{usd(Math.round(o.price * 100))}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              Includes Express Bags pickup, handling and one tracked carrier label per bag. Transit times are carrier estimates, not guarantees.
              {state.price.measurementsEstimated ? " Some sizes were estimated from your bag types; we confirm measurements at pickup." : ""}
            </p>
          </fieldset>
        )}

        {(state.kind === "local" || (state.kind === "shipping" && selected)) && (
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" onClick={() => void book()} disabled={booking} className="btn-primary" data-testid="instant-book">
              {booking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />} Book &amp; pay {usd(total)}
            </button>
            <p className="text-xs text-muted">Secure checkout. Prefer a written quote? Use “Send quote request” below.</p>
          </div>
        )}
      </div>
    </section>
  );
}
