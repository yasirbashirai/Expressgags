"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Minus, Plus, Search, Trash2 } from "lucide-react";
import { airports, markets, ports } from "@/content/site";
import { LOCATION_TYPES, SERVICE_TYPES } from "@/lib/quote-schema";
import { api } from "@/components/admin/api";
import { AdminTitle, Panel } from "@/components/admin/admin-shell";
import { serviceLabel } from "@/components/admin/labels";
import { Field, inputCls } from "@/components/admin/ui";
import { PIECE_CATEGORY_LABEL, TIME_WINDOW_LABEL } from "./labels";

type StopForm = { type: string; address: string; facility: string; market: string; contact: string; notes: string };
type Line = { category: string; quantity: number; description: string; weightLbs: string; lengthIn: string; widthIn: string; heightIn: string };
type CustomerHit = { id: string; name: string; email: string; phone: string | null; company: { id: string; name: string } | null };

const emptyStop = (type = "hotel"): StopForm => ({ type, address: "", facility: "", market: "miami", contact: "", notes: "" });
const emptyLine = (): Line => ({ category: "standard-checked", quantity: 1, description: "", weightLbs: "", lengthIn: "", widthIn: "", heightIn: "" });

/** Manual order entry for phone/email bookings (office staff). */
export function OrderForm() {
  const router = useRouter();
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [picked, setPicked] = useState<CustomerHit | null>(null);
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "", phone: "" });
  const [f, setF] = useState({
    serviceType: "luggage-local",
    fulfillment: "local",
    serviceDate: "",
    timeWindow: "morning",
    windowStart: "",
    windowEnd: "",
    priority: "NORMAL",
    guestName: "",
    guestRoom: "",
    poNumber: "",
    costCenter: "",
    vehicleClassCode: "",
    specialHandling: "",
    accessNotes: "",
    customerNotes: "",
    internalNotes: "",
    retail: "",
    cost: "",
  });
  const [pickup, setPickup] = useState(emptyStop("hotel"));
  const [delivery, setDelivery] = useState(emptyStop("airport"));
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<{ path: string; message: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (customerMode !== "existing") return;
    const t = setTimeout(() => {
      api<{ customers: CustomerHit[] }>(`/orders/customers?q=${encodeURIComponent(q)}`).then((r) => setHits(r.customers)).catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, customerMode]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const totalPieces = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const num = (s: string) => (s.trim() ? Number(s) : undefined);
  const errFor = (path: string) => details.find((d) => d.path === path || d.path.startsWith(`${path}.`))?.message;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDetails([]);
    if (customerMode === "existing" && !picked) return setError("Pick a customer or switch to New customer.");
    setBusy(true);
    try {
      const stop = (s: StopForm) => ({ ...s, facility: s.facility || "", contact: s.contact || "", notes: s.notes || "" });
      const r = await api<{ order: { id: string } }>("/orders", {
        method: "POST",
        json: {
          customer: customerMode === "existing" ? { id: picked!.id } : newCustomer,
          companyId: customerMode === "existing" ? picked?.company?.id ?? null : null,
          serviceType: f.serviceType,
          fulfillment: f.fulfillment,
          pickup: stop(pickup),
          delivery: stop(delivery),
          serviceDate: f.serviceDate,
          timeWindow: f.timeWindow || undefined,
          windowStart: f.windowStart || "",
          windowEnd: f.windowEnd || "",
          priority: f.priority,
          pieces: lines.map((l) => ({ category: l.category, quantity: Number(l.quantity), description: l.description || undefined, weightLbs: num(l.weightLbs), lengthIn: num(l.lengthIn), widthIn: num(l.widthIn), heightIn: num(l.heightIn) })),
          retailCents: f.retail ? Math.round(Number(f.retail) * 100) : undefined,
          costCents: f.cost ? Math.round(Number(f.cost) * 100) : undefined,
          guestName: f.guestName || undefined,
          guestRoom: f.guestRoom || undefined,
          poNumber: f.poNumber || undefined,
          costCenter: f.costCenter || undefined,
          vehicleClassCode: f.vehicleClassCode || undefined,
          specialHandling: f.specialHandling || undefined,
          accessNotes: f.accessNotes || undefined,
          customerNotes: f.customerNotes || undefined,
          internalNotes: f.internalNotes || undefined,
        },
      });
      router.push(`/admin/orders/${r.order.id}`);
    } catch (err) {
      const e2 = err as Error & { details?: { path: string; message: string }[] };
      setError(e2.message);
      setDetails(e2.details ?? []);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Link href="/admin/orders" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy"><ArrowLeft className="h-4 w-4" aria-hidden /> All orders</Link>
      <AdminTitle title="New order" sub="For bookings taken by phone, email or a partner. Website requests convert from the quote inbox." />
      {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}{details.length > 0 && <span className="block text-xs">{details.map((d) => `${d.path}: ${d.message}`).join(" · ")}</span>}</p>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Panel title="Customer">
            <div role="radiogroup" aria-label="Customer type" className="mb-4 inline-flex rounded-full border border-line p-1">
              {(["existing", "new"] as const).map((m) => (
                <button type="button" role="radio" aria-checked={customerMode === m} key={m} onClick={() => setCustomerMode(m)} className={`rounded-full px-4 py-1.5 text-sm font-medium ${customerMode === m ? "bg-navy text-white" : "text-slate-ink"}`}>
                  {m === "existing" ? "Existing customer" : "New customer"}
                </button>
              ))}
            </div>
            {customerMode === "existing" ? (
              picked ? (
                <div className="flex items-center justify-between rounded-xl bg-cloud px-4 py-3 text-sm">
                  <span><span className="font-semibold">{picked.name}</span> · {picked.email}{picked.company ? ` · ${picked.company.name}` : ""}</span>
                  <button type="button" onClick={() => setPicked(null)} className="text-xs font-semibold text-orange-700">Change</button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                    <input aria-label="Search customers" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or company" className={`${inputCls} pl-9`} />
                  </div>
                  <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                    {hits.map((h) => (
                      <li key={h.id}><button type="button" onClick={() => setPicked(h)} className="block w-full px-4 py-2.5 text-left text-sm hover:bg-cloud"><span className="font-medium">{h.name}</span> <span className="text-muted">· {h.email}{h.company ? ` · ${h.company.name}` : ""}</span></button></li>
                    ))}
                    {hits.length === 0 && <li className="px-4 py-3 text-sm text-muted">No customers found. Switch to New customer.</li>}
                  </ul>
                </>
              )
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Name" htmlFor="nc-name" error={errFor("customer.name")}><input id="nc-name" required value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} className={inputCls} /></Field>
                <Field label="Email" htmlFor="nc-email" error={errFor("customer.email")}><input id="nc-email" type="email" required value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} className={inputCls} /></Field>
                <Field label="Phone" htmlFor="nc-phone"><input id="nc-phone" type="tel" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className={inputCls} /></Field>
              </div>
            )}
          </Panel>

          <Panel title="Route">
            <div className="grid gap-6 md:grid-cols-2">
              <StopFields label="Pickup" idp="pu" stop={pickup} onChange={setPickup} error={errFor("pickup")} />
              <StopFields label="Delivery" idp="de" stop={delivery} onChange={setDelivery} error={errFor("delivery")} />
            </div>
          </Panel>

          <Panel title={`Pieces (${totalPieces})`}>
            <ul className="space-y-3">
              {lines.map((l, i) => {
                const upd = (patch: Partial<Line>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <li key={i} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-12 sm:items-end">
                    <div className="sm:col-span-3"><Field label="Item" htmlFor={`l-c-${i}`}><select id={`l-c-${i}`} value={l.category} onChange={(e) => upd({ category: e.target.value })} className={inputCls}>{Object.entries(PIECE_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field></div>
                    <div className="sm:col-span-2">
                      <span className="mb-1.5 block text-sm font-medium text-navy">Qty</span>
                      <div className="flex items-center rounded-xl border border-line">
                        <button type="button" aria-label="Decrease quantity" className="px-2.5 py-2.5" onClick={() => upd({ quantity: Math.max(1, l.quantity - 1) })}><Minus className="h-3.5 w-3.5" /></button>
                        <input aria-label="Quantity" inputMode="numeric" value={l.quantity} onChange={(e) => upd({ quantity: Math.max(1, Math.min(2000, Number(e.target.value.replace(/\D/g, "")) || 1)) })} className="w-full min-w-0 bg-transparent text-center text-sm outline-none" />
                        <button type="button" aria-label="Increase quantity" className="px-2.5 py-2.5" onClick={() => upd({ quantity: Math.min(2000, l.quantity + 1) })}><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <div className="sm:col-span-3"><Field label="Description" htmlFor={`l-d-${i}`}><input id={`l-d-${i}`} value={l.description} onChange={(e) => upd({ description: e.target.value })} className={inputCls} /></Field></div>
                    <div className="grid grid-cols-4 gap-1.5 sm:col-span-3">
                      {(["weightLbs", "lengthIn", "widthIn", "heightIn"] as const).map((k) => (
                        <input key={k} aria-label={{ weightLbs: "Weight lbs", lengthIn: "Length in", widthIn: "Width in", heightIn: "Height in" }[k]} placeholder={{ weightLbs: "lb", lengthIn: "L", widthIn: "W", heightIn: "H" }[k]} inputMode="decimal" value={l[k]} onChange={(e) => upd({ [k]: e.target.value })} className={`${inputCls} !px-2 text-center`} />
                      ))}
                    </div>
                    <div className="sm:col-span-1 sm:text-right">
                      <button type="button" disabled={lines.length === 1} aria-label="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="rounded-full p-2 text-muted hover:bg-cloud disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={() => setLines([...lines, emptyLine()])} className="btn-ghost mt-3 !py-2"><Plus className="h-4 w-4" aria-hidden /> Add item line</button>
            <p className="mt-2 text-xs text-muted">Each physical piece gets its own piece ID and QR tag. Large groups: import a manifest CSV from the order page.</p>
          </Panel>

          <Panel title="Handling & notes">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Access notes (stairs, dock, parking, terminal rules)" htmlFor="o-an"><textarea id="o-an" rows={2} value={f.accessNotes} onChange={set("accessNotes")} className={inputCls} /></Field>
              <Field label="Special handling" htmlFor="o-sh"><textarea id="o-sh" rows={2} value={f.specialHandling} onChange={set("specialHandling")} className={inputCls} /></Field>
              <Field label="Customer notes" htmlFor="o-cn"><textarea id="o-cn" rows={2} value={f.customerNotes} onChange={set("customerNotes")} className={inputCls} /></Field>
              <Field label="Internal notes (never shown to customers)" htmlFor="o-in"><textarea id="o-in" rows={2} value={f.internalNotes} onChange={set("internalNotes")} className={inputCls} /></Field>
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title="Service & schedule">
            <div className="grid gap-4">
              <Field label="Service" htmlFor="o-svc"><select id="o-svc" value={f.serviceType} onChange={set("serviceType")} className={inputCls}>{SERVICE_TYPES.map((s) => <option key={s} value={s}>{serviceLabel(s)}</option>)}</select></Field>
              <Field label="Fulfillment" htmlFor="o-ful"><select id="o-ful" value={f.fulfillment} onChange={set("fulfillment")} className={inputCls}><option value="local">Local (Express Bags crew)</option><option value="nationwide">Nationwide (carrier)</option><option value="storage">Storage</option><option value="custom">Custom / group program</option></select></Field>
              <Field label="Service date" htmlFor="o-date" error={errFor("serviceDate")}><input id="o-date" type="date" required value={f.serviceDate} onChange={set("serviceDate")} className={inputCls} /></Field>
              <Field label="Time window" htmlFor="o-tw"><select id="o-tw" value={f.timeWindow} onChange={set("timeWindow")} className={inputCls}>{Object.entries(TIME_WINDOW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Exact start" htmlFor="o-ws"><input id="o-ws" type="time" value={f.windowStart} onChange={set("windowStart")} className={inputCls} /></Field>
                <Field label="Exact end" htmlFor="o-we"><input id="o-we" type="time" value={f.windowEnd} onChange={set("windowEnd")} className={inputCls} /></Field>
              </div>
              <Field label="Priority" htmlFor="o-pr"><select id="o-pr" value={f.priority} onChange={set("priority")} className={inputCls}><option value="NORMAL">Normal</option><option value="RUSH">Rush</option><option value="VIP">VIP</option></select></Field>
              <Field label="Vehicle class" htmlFor="o-vc"><select id="o-vc" value={f.vehicleClassCode} onChange={set("vehicleClassCode")} className={inputCls}><option value="">Let dispatch decide</option><option value="cargo-van">Cargo van</option><option value="box-15">15-ft box truck</option><option value="box-20">20-ft box truck</option><option value="box-26">26-ft box truck</option></select></Field>
            </div>
          </Panel>
          <Panel title="Hotel guest & references">
            <div className="grid gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2"><Field label="Guest name" htmlFor="o-gn"><input id="o-gn" value={f.guestName} onChange={set("guestName")} className={inputCls} /></Field></div>
                <Field label="Room" htmlFor="o-gr"><input id="o-gr" value={f.guestRoom} onChange={set("guestRoom")} className={inputCls} /></Field>
              </div>
              <Field label="PO number" htmlFor="o-po"><input id="o-po" value={f.poNumber} onChange={set("poNumber")} className={inputCls} /></Field>
              <Field label="Cost center" htmlFor="o-cc"><input id="o-cc" value={f.costCenter} onChange={set("costCenter")} className={inputCls} /></Field>
            </div>
          </Panel>
          <Panel title="Price (optional)">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price USD" htmlFor="o-rt"><input id="o-rt" inputMode="decimal" value={f.retail} onChange={set("retail")} className={inputCls} /></Field>
              <Field label="Internal cost USD" htmlFor="o-ct"><input id="o-ct" inputMode="decimal" value={f.cost} onChange={set("cost")} className={inputCls} /></Field>
            </div>
            <p className="mt-2 text-xs text-muted">Formal quotations with acceptance and deposits are built in Quotations.</p>
          </Panel>
          <button disabled={busy} className="btn-primary w-full">{busy ? "Creating…" : `Create order with ${totalPieces} piece${totalPieces === 1 ? "" : "s"}`}</button>
        </div>
      </div>
    </form>
  );
}

function StopFields({ label, idp, stop, onChange, error }: { label: string; idp: string; stop: StopForm; onChange: (s: StopForm) => void; error?: string }) {
  const set = (patch: Partial<StopForm>) => onChange({ ...stop, ...patch });
  const facilityOptions = stop.type === "airport" ? airports.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}`, market: a.market })) : stop.type === "cruise-port" ? ports.map((p) => ({ value: p.slug, label: p.name, market: p.market })) : [];
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 font-display text-sm font-bold text-navy">{label}</legend>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <Field label="Location type" htmlFor={`${idp}-type`}><select id={`${idp}-type`} value={stop.type} onChange={(e) => set({ type: e.target.value, facility: "" })} className={inputCls}>{LOCATION_TYPES.map((t) => <option key={t} value={t}>{t.replace("-", " ")}</option>)}</select></Field>
      {facilityOptions.length > 0 && (
        <Field label={stop.type === "airport" ? "Airport" : "Cruise port"} htmlFor={`${idp}-fac`}>
          <select id={`${idp}-fac`} value={stop.facility} onChange={(e) => { const opt = facilityOptions.find((o) => o.value === e.target.value); set({ facility: e.target.value, market: opt?.market ?? stop.market, address: stop.address || opt?.label.split(" · ").pop() || "" }); }} className={inputCls}>
            <option value="">Choose…</option>
            {facilityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      )}
      <Field label="Address or location name" htmlFor={`${idp}-addr`}><input id={`${idp}-addr`} required value={stop.address} onChange={(e) => set({ address: e.target.value })} className={inputCls} /></Field>
      <Field label="Market" htmlFor={`${idp}-mkt`}><select id={`${idp}-mkt`} value={stop.market} onChange={(e) => set({ market: e.target.value })} className={inputCls}>{markets.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}<option value="other-florida">Other Florida route</option><option value="outside-florida">Outside Florida</option></select></Field>
      <Field label="On-site contact" htmlFor={`${idp}-ct`}><input id={`${idp}-ct`} value={stop.contact} onChange={(e) => set({ contact: e.target.value })} className={inputCls} placeholder="Name and phone" /></Field>
    </fieldset>
  );
}
