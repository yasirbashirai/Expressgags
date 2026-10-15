"use client";

/**
 * Hotel concierge desk: a fast bell-desk form (guest, room, bags by size, pickup time, destination)
 * plus today's guest requests with live status, and a printable request slip.
 */
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ConciergeBell, Minus, Plus, Printer, RefreshCw } from "lucide-react";
import { airports, ports } from "@/content/site";
import { LUGGAGE_CATEGORIES, LUGGAGE_CATEGORY_LABELS } from "@/lib/quote-schema";
import { canUseConcierge, dateTime, portal, PortalError } from "./api";
import { MARKET_LABELS } from "./labels";
import { useMe } from "./portal-shell";
import { Alert, aria, Card, Field, input, Loading, PageTitle, StatusPill, SubmitButton } from "./ui";

type Saved = { id: string; label: string; type: string; address: string; market: string; shared: boolean };
type Req = { id: string; reference: string; status: string; serviceType: string; serviceDate: string; totalPieces: number; createdAt: string; timeWindow?: string; destination: string; guest: { guestName?: string; guestRoom?: string; pickupTime?: string; bookedBy?: string } | null; order: { id: string; reference: string; status: string; statusLabel: string } | null };

const WINDOW_FOR_TIME = (t: string) => {
  const h = Number(t.split(":")[0]);
  if (Number.isNaN(h)) return "flexible";
  if (h < 8) return "early-morning";
  if (h < 12) return "morning";
  if (h < 14) return "midday";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "after-hours";
};
const shortCat = (c: string) => (LUGGAGE_CATEGORY_LABELS as Record<string, string>)[c].split(" (")[0];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export function ConciergeDesk() {
  const { me } = useMe();
  const [locations, setLocations] = useState<Saved[]>([]);
  const [requests, setRequests] = useState<Req[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({ "standard-checked": 2 });
  const [dest, setDest] = useState<"airport" | "cruise-port" | "hotel" | "residence" | "other">("airport");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [day, setDay] = useState(today());

  const loadRequests = useCallback(() => portal<{ requests: Req[] }>(`/concierge/requests?date=${day}`).then((r) => setRequests(r.requests)).catch((e) => setMsg({ tone: "error", text: e.message })), [day]);
  useEffect(() => {
    portal<{ addresses: Saved[] }>("/addresses").then((r) => setLocations(r.addresses.filter((a) => a.type === "hotel"))).catch(() => undefined);
  }, []);
  useEffect(() => {
    loadRequests();
    const t = setInterval(loadRequests, 60_000); // keep the desk view fresh
    return () => clearInterval(t);
  }, [loadRequests]);

  if (!canUseConcierge(me)) return <Alert>The concierge desk is available to active hotel, resort and DMC accounts.</Alert>;

  const bump = (c: string, d: number) => setCounts((x) => ({ ...x, [c]: Math.max(0, Math.min(200, (x[c] ?? 0) + d)) }));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const time = String(fd.get("pickupTime") ?? "");
    setBusy(true);
    setMsg(null);
    setFields({});
    try {
      const r = await portal<{ reference: string; message: string }>("/concierge/requests", {
        method: "POST",
        json: {
          guestName: fd.get("guestName"),
          guestRoom: fd.get("guestRoom"),
          guestPhone: fd.get("guestPhone"),
          pickupDate: fd.get("pickupDate"),
          pickupTime: time,
          timeWindow: WINDOW_FOR_TIME(time),
          hotelAddressId: fd.get("hotelAddressId") || "",
          hotelAddress: fd.get("hotelAddress") || "",
          hotelMarket: fd.get("hotelMarket") || undefined,
          destinationType: dest,
          destinationFacility: fd.get("destinationFacility") || "",
          destinationAddress: fd.get("destinationAddress") || "",
          destinationMarket: fd.get("destinationMarket") || undefined,
          flightOrShip: fd.get("flightOrShip"),
          pieces: Object.entries(counts).filter(([, q]) => q > 0).map(([category, quantity]) => ({ category, quantity })),
          notes: fd.get("notes"),
          poNumber: fd.get("poNumber"),
          acceptsProhibitedItemsPolicy: fd.get("policy") === "on",
        },
      });
      setMsg({ tone: "success", text: `Request ${r.reference} sent to dispatch. ${r.message}` });
      form.reset();
      setCounts({ "standard-checked": 2 });
      setDay(today());
      loadRequests();
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
      if (err instanceof PortalError) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle title="Concierge desk" sub={`Guest luggage requests for ${me.company?.name}. Dispatch confirms timing, vehicle and access for every request.`} />
      <div className="grid gap-6 2xl:grid-cols-5">
        <Card title="New guest request" className="2xl:col-span-3" action={<ConciergeBell className="h-5 w-5 text-orange" aria-hidden />}>
          <form onSubmit={submit} className="space-y-5" noValidate>
            {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2"><Field id="guestName" label="Guest name" error={fields.guestName}><input {...aria("guestName", fields.guestName)} required className={input} autoComplete="off" /></Field></div>
              <Field id="guestRoom" label="Room" optional><input {...aria("guestRoom")} className={input} inputMode="numeric" /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="pickupDate" label="Pickup date" error={fields.pickupDate}><input {...aria("pickupDate", fields.pickupDate)} type="date" defaultValue={today()} required className={input} /></Field>
              <Field id="pickupTime" label="Pickup time" error={fields.pickupTime}><input {...aria("pickupTime", fields.pickupTime)} type="time" required className={input} /></Field>
              <Field id="guestPhone" label="Guest phone" optional><input {...aria("guestPhone")} type="tel" className={input} /></Field>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-navy">Bags ({total})</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {LUGGAGE_CATEGORIES.map((c) => (
                  <div key={c} className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
                    <span className="text-sm text-charcoal">{shortCat(c)}</span>
                    <span className="flex items-center gap-2">
                      <button type="button" onClick={() => bump(c, -1)} aria-label={`Fewer ${shortCat(c)}`} className="grid h-9 w-9 place-items-center rounded-full border border-line text-navy hover:bg-cloud"><Minus className="h-4 w-4" /></button>
                      <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">{counts[c] ?? 0}</span>
                      <button type="button" onClick={() => bump(c, 1)} aria-label={`More ${shortCat(c)}`} className="grid h-9 w-9 place-items-center rounded-full bg-navy text-white hover:bg-navy-700"><Plus className="h-4 w-4" /></button>
                    </span>
                  </div>
                ))}
              </div>
              {fields.pieces && <p className="mt-1.5 text-sm text-red-700">{fields.pieces}</p>}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              {locations.length > 0 ? (
                <Field id="hotelAddressId" label="Pickup location" error={fields.hotelAddress}>
                  <select {...aria("hotelAddressId", fields.hotelAddress)} className={input} defaultValue={locations[0]?.id}>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </Field>
              ) : (
                <>
                  <Field id="hotelAddress" label="Hotel pickup address" error={fields.hotelAddress} hint="Tip: save your lobby as a shared location to skip this.">
                    <input {...aria("hotelAddress", fields.hotelAddress, "hint")} className={input} />
                  </Field>
                  <Field id="hotelMarket" label="Market">
                    <select {...aria("hotelMarket")} className={input} defaultValue="miami">{Object.entries(MARKET_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  </Field>
                </>
              )}
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-navy">Destination</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {([["airport", "Airport"], ["cruise-port", "Cruise port"], ["hotel", "Another hotel"], ["residence", "Residence"], ["other", "Other"]] as const).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={dest === v} onClick={() => setDest(v)} className={`rounded-full px-4 py-2 text-sm font-medium ring-1 ${dest === v ? "bg-navy text-white ring-navy" : "bg-white text-slate-ink ring-line hover:ring-navy/30"}`}>{l}</button>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              {dest === "airport" && (
                <Field id="destinationFacility" label="Airport"><select {...aria("destinationFacility")} className={input} defaultValue="MIA">{airports.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></Field>
              )}
              {dest === "cruise-port" && (
                <Field id="destinationFacility" label="Cruise port"><select {...aria("destinationFacility")} className={input} defaultValue="portmiami">{ports.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select></Field>
              )}
              {(dest === "airport" || dest === "cruise-port") ? (
                <Field id="flightOrShip" label={dest === "airport" ? "Flight" : "Ship & sailing"} optional><input {...aria("flightOrShip")} placeholder={dest === "airport" ? "e.g. AA 1234, 11:40 AM" : "e.g. ship name, embarkation 1 PM"} className={input} /></Field>
              ) : (
                <>
                  <Field id="destinationAddress" label="Destination address" error={fields.destinationAddress}><input {...aria("destinationAddress", fields.destinationAddress)} className={input} /></Field>
                  <Field id="destinationMarket" label="Destination market"><select {...aria("destinationMarket")} className={input} defaultValue="miami">{Object.entries(MARKET_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                </>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="notes" label="Notes for dispatch" optional><input {...aria("notes")} placeholder="Bell desk hold, fragile items, guest preferences" className={input} /></Field>
              <Field id="poNumber" label={me.company?.poRequired ? "PO number" : "PO number (optional)"} error={fields.poNumber}><input {...aria("poNumber", fields.poNumber)} className={input} /></Field>
            </div>
            <label className="flex items-start gap-3 text-sm text-slate-ink">
              <input type="checkbox" name="policy" required className="mt-1 h-4 w-4 accent-[#E06010]" />
              <span>The guest&apos;s items follow the <Link href="/terms#prohibited-items" className="font-semibold text-orange-700 underline">prohibited-items policy</Link>.</span>
            </label>
            <SubmitButton busy={busy} className="btn-primary w-full !py-3.5 sm:w-auto">Send to dispatch</SubmitButton>
          </form>
        </Card>

        <Card
          title="Guest requests"
          className="2xl:col-span-2"
          action={
            <div className="flex items-center gap-2">
              <label htmlFor="day" className="sr-only">Day</label>
              <input id="day" type="date" value={day} onChange={(e) => setDay(e.target.value)} className={`${input} !w-auto !py-1.5 !text-sm`} />
              <button onClick={loadRequests} className="rounded-full p-2 text-muted hover:bg-cloud" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></button>
            </div>
          }
        >
          {!requests ? <Loading /> : requests.length === 0 ? <p className="text-sm text-slate-ink">No guest requests for this day yet.</p> : (
            <ul className="space-y-3">
              {requests.map((r) => (
                <li key={r.id} className="rounded-2xl border border-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-navy">{r.guest?.guestName ?? "Guest"}{r.guest?.guestRoom ? <span className="font-normal text-slate-ink"> · room {r.guest.guestRoom}</span> : null}</p>
                    {r.order ? <StatusPill status={r.order.status} label={r.order.statusLabel} /> : <StatusPill status={r.status} />}
                  </div>
                  <p className="mt-1 text-sm text-slate-ink">{r.guest?.pickupTime ? `${r.guest.pickupTime} · ` : ""}{r.totalPieces} bags → {r.destination}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                    <span className="font-mono">{r.order?.reference ?? r.reference} · {dateTime(r.createdAt)}{r.guest?.bookedBy ? ` · by ${r.guest.bookedBy}` : ""}</span>
                    <Link href={`/account/concierge/slip/${r.id}`} className="inline-flex items-center gap-1 font-semibold text-orange-700 hover:underline"><Printer className="h-3.5 w-3.5" aria-hidden /> Slip</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ---------------------------------- Slip --------------------------------- */
type Slip = { reference: string; status: string; serviceDate: string; totalPieces: number; createdAt: string; company: { name: string } | null; payload: { pickup?: { address?: string }; delivery?: { address?: string }; items?: { category: string; quantity: number }[]; timeWindow?: string; flightDetails?: string; shipName?: string; notes?: string; concierge?: { guestName?: string; guestRoom?: string; pickupTime?: string; bookedBy?: string }; poNumber?: string } };

export function ConciergeSlip({ id }: { id: string }) {
  const [s, setS] = useState<Slip | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    portal<{ request: Slip }>(`/concierge/requests/${id}`).then((r) => setS(r.request)).catch((e) => setError(e.message));
  }, [id]);
  if (error) return <Alert>{error}</Alert>;
  if (!s) return <Loading />;
  const g = s.payload.concierge ?? {};
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/account/concierge" className="text-sm font-semibold text-orange-700 hover:underline">← Concierge desk</Link>
        <button onClick={() => window.print()} className="btn-navy"><Printer className="h-4 w-4" aria-hidden /> Print slip</button>
      </div>
      <article className="mx-auto max-w-xl rounded-[1.25rem] border-2 border-navy bg-white p-6 print:max-w-none print:border print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">Guest luggage request</p>
            <h1 className="mt-1 text-2xl font-extrabold">{g.guestName ?? "Guest"}</h1>
            <p className="text-sm text-slate-ink">{g.guestRoom ? `Room ${g.guestRoom} · ` : ""}{s.company?.name}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm font-bold text-navy">{s.reference}</p>
            <p className="text-xs text-muted">{dateTime(s.createdAt)}</p>
          </div>
        </header>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-xs uppercase tracking-wider text-muted">Pickup</dt><dd className="mt-0.5 font-semibold">{s.serviceDate}{g.pickupTime ? ` at ${g.pickupTime}` : ""}</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-muted">Bags</dt><dd className="mt-0.5 font-semibold">{s.totalPieces}</dd></div>
          <div className="col-span-2"><dt className="text-xs uppercase tracking-wider text-muted">From</dt><dd className="mt-0.5">{s.payload.pickup?.address}</dd></div>
          <div className="col-span-2"><dt className="text-xs uppercase tracking-wider text-muted">To</dt><dd className="mt-0.5">{s.payload.delivery?.address}{s.payload.flightDetails ? ` · ${s.payload.flightDetails}` : ""}{s.payload.shipName ? ` · ${s.payload.shipName}` : ""}</dd></div>
          <div className="col-span-2"><dt className="text-xs uppercase tracking-wider text-muted">Pieces</dt><dd className="mt-0.5">{(s.payload.items ?? []).map((i) => `${i.quantity} × ${shortCat(i.category)}`).join(", ")}</dd></div>
          {s.payload.poNumber && <div><dt className="text-xs uppercase tracking-wider text-muted">PO</dt><dd className="mt-0.5">{s.payload.poNumber}</dd></div>}
          {g.bookedBy && <div><dt className="text-xs uppercase tracking-wider text-muted">Booked by</dt><dd className="mt-0.5">{g.bookedBy}</dd></div>}
        </dl>
        <div className="mt-6 grid grid-cols-2 gap-6 border-t border-line pt-5 text-xs text-muted">
          <div><div className="h-10 border-b border-charcoal/40" />Bell desk initials</div>
          <div><div className="h-10 border-b border-charcoal/40" />Express Bags count at pickup</div>
        </div>
        <p className="mt-5 text-[11px] text-muted">Express Bags, Inc. · Handled with Care. Delivered with Confidence.</p>
      </article>
    </div>
  );
}
