"use client";

/**
 * Quotation builder (admin). Creates a quotation from a quote request (prefilled) or from scratch,
 * and edits / revises existing ones. Live internal economics: subtotal, cost, profit, markup % and
 * gross margin % (shown side by side, per Carlos), with a minimum-margin warning.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Calculator, Copy, FileDown, Plus, Send, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { markets } from "@/content/site";
import { LOCATION_TYPES, LUGGAGE_CATEGORY_LABELS, SERVICE_LABELS, TIME_WINDOWS, type ServiceType } from "@/lib/quote-schema";
import { api, API_URL, money } from "@/components/admin/api";
import { AdminTitle, Panel } from "@/components/admin/admin-shell";
import { Badge } from "@/components/admin/labels";
import { ConfirmButton, Field, inputCls, Modal } from "@/components/admin/ui";

export const LINE_KINDS = ["transport", "truck", "driver", "helper", "mileage", "waiting", "storage", "handling", "equipment", "coordination", "protection", "discount", "other"] as const;
type Kind = (typeof LINE_KINDS)[number];

export type Line = { kind: Kind; description: string; quantity: number; unit: string; unitCents: number; unitCostCents: number | null };
type Loc = { type: string; address: string; facility?: string; market: string; notes?: string };
type Item = { category: string; quantity: number; description?: string };
export type Details = { serviceType: string; fulfillment?: string; pickup: Loc; delivery: Loc; extraStops?: Loc[]; serviceDate: string; timeWindow?: string | null; market: string; items: Item[]; poNumber?: string | null; costCenter?: string | null };
type Customer = { id: string; name: string; email: string; company?: string | null };

const MARKET_OPTS = [...markets.map((m) => ({ value: m.slug, label: m.name })), { value: "other-florida", label: "Other Florida route" }, { value: "outside-florida", label: "Outside Florida" }];
const CATS = [...Object.entries(LUGGAGE_CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l.split(" (")[0] })), { value: "cargo", label: "Cargo / equipment" }];
const KIND_LABEL: Record<Kind, string> = { transport: "Transport", truck: "Truck / vehicle", driver: "Driver", helper: "Helper", mileage: "Mileage", waiting: "Waiting time", storage: "Storage", handling: "Handling", equipment: "Equipment", coordination: "Coordination", protection: "Protection", discount: "Discount", other: "Other" };

const toCents = (v: string) => Math.round((Number(v.replace(/[^0-9.]/g, "")) || 0) * 100);
const fromCents = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));
const pct1 = (n: number) => Math.round(n * 10) / 10;

/** Same math as the API (src/server/modules/billing/money.ts) so the preview matches the saved totals. */
export function liveMath(lines: Line[], deposit: { type: string; value: number }) {
  let subtotal = 0, discount = 0, cost = 0;
  for (const l of lines) {
    const t = Math.round(l.quantity * l.unitCents);
    if (l.kind === "discount") discount += Math.abs(t);
    else {
      subtotal += t;
      if (l.unitCostCents != null) cost += Math.round(l.quantity * l.unitCostCents);
    }
  }
  const total = Math.max(0, subtotal - discount);
  const profit = total - cost;
  const depositCents = deposit.type === "percent" ? Math.round((total * Math.min(100, deposit.value)) / 100) : deposit.type === "flat" ? Math.min(total, Math.round(deposit.value)) : 0;
  return { subtotal, discount, total, cost, profit, markup: cost > 0 ? pct1((profit / cost) * 100) : 0, margin: total > 0 ? pct1((profit / total) * 100) : 0, depositCents };
}

const blankLoc = (): Loc => ({ type: "hotel", address: "", market: "miami" });
const blankDetails = (): Details => ({ serviceType: "luggage-local", pickup: blankLoc(), delivery: { ...blankLoc(), type: "airport" }, serviceDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), timeWindow: "morning", market: "miami", items: [{ category: "standard-checked", quantity: 2 }] });

type Initial = {
  id?: string;
  status?: string;
  reference?: string;
  customer?: Customer | null;
  quoteRequest?: { id: string; reference: string; notes?: string; specialHandling?: string; accessNotes?: string; routeReasons?: string[] } | null;
  title: string;
  scope?: string | null;
  terms?: string | null;
  validUntil?: string | null;
  depositType: string;
  depositValue: number;
  lines: Line[];
  details: Details;
  guardrails?: { minimumProfitCents: number; targetMarginPercent: number };
  publicLink?: string | null;
};

export function QuotationBuilder({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(initial.customer ?? null);
  const [title, setTitle] = useState(initial.title);
  const [scope, setScope] = useState(initial.scope ?? "");
  const [terms, setTerms] = useState(initial.terms ?? "");
  const [validUntil, setValidUntil] = useState((initial.validUntil ?? new Date(Date.now() + 14 * 86400000).toISOString()).slice(0, 10));
  const [depositType, setDepositType] = useState(initial.depositType || "none");
  const [depositValue, setDepositValue] = useState(initial.depositValue || 0);
  const [lines, setLines] = useState<Line[]>(initial.lines.length ? initial.lines : [{ kind: "transport", description: "", quantity: 1, unit: "", unitCents: 0, unitCostCents: 0 }]);
  const [details, setDetails] = useState<Details>(initial.details);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [suggestNotes, setSuggestNotes] = useState<string[] | null>(null);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseReason, setReviseReason] = useState("");

  const locked = initial.status === "ACCEPTED" || initial.status === "CONVERTED";
  const isSent = !!initial.status && !["DRAFT"].includes(initial.status) && !locked;
  const m = useMemo(() => liveMath(lines, { type: depositType, value: depositType === "flat" ? Math.round(depositValue * 100) : depositValue }), [lines, depositType, depositValue]);
  const target = initial.guardrails?.targetMarginPercent ?? 45;
  const minProfit = initial.guardrails?.minimumProfitCents ?? 3000;
  const lowMargin = m.cost > 0 && m.total > 0 && (m.margin < target || m.profit < minProfit);
  const missingCost = lines.some((l) => l.kind !== "discount" && l.unitCostCents == null);

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const body = () => ({
    title,
    scope: scope || null,
    terms: terms || null,
    validUntil,
    depositType,
    depositValue: depositType === "flat" ? Math.round(depositValue * 100) : depositValue,
    lines: lines.filter((l) => l.description.trim()).map((l) => ({ kind: l.kind, description: l.description.trim(), quantity: l.quantity, unit: l.unit || null, unitCents: l.unitCents, unitCostCents: l.unitCostCents })),
    details: { ...details, market: details.pickup.market },
  });

  const save = async (andSend = false, reason?: string) => {
    setMsg(null);
    if (!customer) return setMsg({ tone: "err", text: "Choose a customer first." });
    if (!lines.some((l) => l.description.trim() && l.unitCents > 0)) return setMsg({ tone: "err", text: "Add at least one priced line." });
    setBusy(andSend ? "send" : "save");
    try {
      let id = initial.id;
      if (id) await api(`/quotations/${id}`, { method: "PUT", json: { ...body(), reason } });
      else {
        const r = await api<{ quotation: { id: string } }>("/quotations", { method: "POST", json: { ...body(), customerId: customer.id, quoteRequestId: initial.quoteRequest?.id ?? null } });
        id = r.quotation.id;
      }
      if (andSend) {
        const s = await api<{ emailStatus: string; link: string }>(`/quotations/${id}/send`, { method: "POST" });
        setMsg({ tone: "ok", text: `Sent (${s.emailStatus.toLowerCase()}). Customer link: ${s.link}` });
      } else setMsg({ tone: "ok", text: "Saved." });
      if (!initial.id) router.replace(`/admin/quotations/${id}`);
      else router.refresh();
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
      setReviseOpen(false);
    }
  };

  const suggest = async () => {
    setBusy("suggest");
    setMsg(null);
    try {
      const r = await api<{ lines: Line[]; engineNotes: string[]; manualReview: boolean; decision: { route: string; reasons: string[] } }>("/quotations/suggest", { method: "POST", json: { details: { ...details, market: details.pickup.market } } });
      setLines(r.lines.map((l) => ({ ...l, unit: l.unit ?? "" })));
      setSuggestNotes([...(r.manualReview ? ["Engine guardrails flagged this price for manual review."] : []), ...r.engineNotes, ...r.decision.reasons.map((x) => `Routing: ${x}`)]);
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async () => {
    const r = await api<{ quotation: { id: string } }>(`/quotations/${initial.id}/duplicate`, { method: "POST" });
    router.push(`/admin/quotations/${r.quotation.id}`);
  };

  return (
    <>
      <AdminTitle
        title={initial.reference ? `Quotation ${initial.reference}` : "New quotation"}
        sub={initial.quoteRequest ? `From quote request ${initial.quoteRequest.reference}` : "Itemized offer with internal margin check"}
        actions={
          <>
            {initial.status && <Badge className="bg-navy-50 text-navy">{initial.status}</Badge>}
            {initial.id && <a className="btn-ghost !py-2" href={`${API_URL}/v1/admin/quotations/${initial.id}/pdf`} target="_blank" rel="noopener noreferrer"><FileDown className="h-4 w-4" aria-hidden /> PDF</a>}
            {initial.id && <button className="btn-ghost !py-2" onClick={duplicate}><Copy className="h-4 w-4" aria-hidden /> Duplicate</button>}
          </>
        }
      />
      {locked && <p className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">This quotation was accepted and is read-only. Duplicate it to make a new offer.</p>}
      {initial.publicLink && !locked && initial.status !== "DRAFT" && <p className="mb-4 break-all rounded-xl bg-navy-50 p-3 text-xs text-navy">Customer link: {initial.publicLink}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Customer & title">
            <div className="grid gap-4 md:grid-cols-2">
              <CustomerPicker value={customer} onChange={setCustomer} disabled={!!initial.id || !!initial.quoteRequest} />
              <Field label="Quotation title" htmlFor="qt-title">
                <input id="qt-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} disabled={locked} />
              </Field>
            </div>
            {initial.quoteRequest && (initial.quoteRequest.notes || initial.quoteRequest.specialHandling || initial.quoteRequest.accessNotes) && (
              <div className="mt-4 rounded-xl bg-sand p-3 text-sm text-slate-ink">
                <p className="font-semibold text-navy">From the request</p>
                {initial.quoteRequest.notes && <p className="mt-1">Notes: {initial.quoteRequest.notes}</p>}
                {initial.quoteRequest.specialHandling && <p>Special handling: {initial.quoteRequest.specialHandling}</p>}
                {initial.quoteRequest.accessNotes && <p>Access: {initial.quoteRequest.accessNotes}</p>}
              </div>
            )}
          </Panel>

          <DetailsEditor value={details} onChange={setDetails} disabled={locked} />

          <Panel
            title="Line items"
            action={!locked && (
              <button onClick={suggest} disabled={busy === "suggest"} className="btn-ghost !py-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> {busy === "suggest" ? "Pricing…" : "Suggest from engine"}
              </button>
            )}
          >
            {suggestNotes && suggestNotes.length > 0 && (
              <ul className="mb-4 space-y-1 rounded-xl bg-navy-50 p-3 text-xs text-navy">{suggestNotes.map((n) => <li key={n}>· {n}</li>)}</ul>
            )}
            <div className="space-y-3">
              {lines.map((l, i) => {
                const total = Math.round(l.quantity * l.unitCents) * (l.kind === "discount" ? -1 : 1);
                return (
                  <div key={i} className="rounded-2xl border border-line p-3 md:p-4">
                    <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-end">
                      <Field label="Kind" htmlFor={`k-${i}`}>
                        <select id={`k-${i}`} className={inputCls} value={l.kind} onChange={(e) => setLine(i, { kind: e.target.value as Kind })} disabled={locked}>
                          {LINE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                        </select>
                      </Field>
                      <Field label="Description (shown to customer)" htmlFor={`d-${i}`}>
                        <input id={`d-${i}`} className={inputCls} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} disabled={locked} placeholder="e.g. 26-ft box truck with driver" />
                      </Field>
                      {!locked && (
                        <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`} className="justify-self-end rounded-full p-2 text-muted hover:bg-cloud hover:text-rose-700 sm:mb-1">
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[80px_100px_minmax(0,1fr)_minmax(0,1fr)_110px] sm:items-end">
                      <Field label="Qty" htmlFor={`q-${i}`}>
                        <input id={`q-${i}`} inputMode="decimal" className={inputCls} value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) || 0 })} disabled={locked} />
                      </Field>
                      <Field label="Unit" htmlFor={`u-${i}`}>
                        <input id={`u-${i}`} className={inputCls} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} disabled={locked} placeholder="hour" />
                      </Field>
                      <Field label="Price ($)" htmlFor={`p-${i}`}>
                        <MoneyInput id={`p-${i}`} label="Unit price" cents={l.unitCents} onChange={(c) => setLine(i, { unitCents: c ?? 0 })} disabled={locked} />
                      </Field>
                      <Field label="Cost ($), internal" htmlFor={`c-${i}`}>
                        <MoneyInput id={`c-${i}`} label="Unit cost (internal)" cents={l.unitCostCents} onChange={(c) => setLine(i, { unitCostCents: c })} disabled={locked || l.kind === "discount"} allowEmpty />
                      </Field>
                      <div className="col-span-2 text-right sm:col-span-1 sm:pb-2.5">
                        <p className="text-[11px] uppercase tracking-wider text-muted">Line total</p>
                        <p className={`font-display text-base font-bold ${total < 0 ? "text-rose-700" : "text-navy"}`}>{money(total)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {!locked && (
              <button onClick={() => setLines((ls) => [...ls, { kind: "other", description: "", quantity: 1, unit: "", unitCents: 0, unitCostCents: 0 }])} className="btn-ghost mt-4 !py-2 text-sm">
                <Plus className="h-4 w-4" aria-hidden /> Add line
              </button>
            )}
          </Panel>

          <Panel title="Scope, terms & validity">
            <div className="grid gap-4">
              <Field label="Scope, assumptions and change policy" htmlFor="qt-scope" hint="Shown to the customer. Leave blank for the standard scope statement.">
                <textarea id="qt-scope" rows={4} className={inputCls} value={scope} onChange={(e) => setScope(e.target.value)} disabled={locked} />
              </Field>
              <Field label="Terms" htmlFor="qt-terms" hint="Leave blank for the standard Express Bags terms.">
                <textarea id="qt-terms" rows={5} className={inputCls} value={terms} onChange={(e) => setTerms(e.target.value)} disabled={locked} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Valid until" htmlFor="qt-valid">
                  <input id="qt-valid" type="date" className={inputCls} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} disabled={locked} />
                </Field>
                <Field label="Deposit" htmlFor="qt-dep">
                  <select id="qt-dep" className={inputCls} value={depositType} onChange={(e) => setDepositType(e.target.value)} disabled={locked}>
                    <option value="none">No deposit</option>
                    <option value="percent">Percentage of total</option>
                    <option value="flat">Flat amount</option>
                  </select>
                </Field>
                {depositType !== "none" && (
                  <Field label={depositType === "percent" ? "Deposit %" : "Deposit ($)"} htmlFor="qt-depv">
                    <input id="qt-depv" inputMode="decimal" className={inputCls} value={depositValue} onChange={(e) => setDepositValue(Number(e.target.value) || 0)} disabled={locked} />
                  </Field>
                )}
              </div>
            </div>
          </Panel>
        </div>

        {/* Sticky economics panel */}
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <section className="card overflow-hidden">
            <div className="bg-navy px-5 py-4 text-white">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/70"><Calculator className="h-4 w-4" aria-hidden /> Customer price</p>
              <p className="mt-1 font-display text-4xl font-extrabold">{money(m.total)}</p>
              {m.depositCents > 0 && <p className="mt-1 text-sm text-white/80">Deposit on acceptance: {money(m.depositCents)}</p>}
            </div>
            <dl className="divide-y divide-line text-sm">
              <Row label="Subtotal" value={money(m.subtotal)} />
              {m.discount > 0 && <Row label="Discounts" value={`-${money(m.discount)}`} />}
              <Row label="Internal cost" value={money(m.cost)} />
              <Row label="Profit" value={money(m.profit)} strong />
              <Row label="Markup (profit ÷ cost)" value={`${m.markup}%`} />
              <Row label="Gross margin (profit ÷ price)" value={`${m.margin}%`} strong />
            </dl>
            {(lowMargin || missingCost) && (
              <div className="flex gap-2 border-t border-amber-200 bg-amber-50 p-4 text-xs text-amber-900" role="status">
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {lowMargin && `Below guardrails: target margin ${target}% and minimum profit ${money(minProfit)}. `}
                  {missingCost && "Some lines have no internal cost, so margin is overstated."}
                </span>
              </div>
            )}
            <p className="border-t border-line px-5 py-3 text-[11px] text-muted">Cost, profit and margin are internal only and never shown to the customer.</p>
            {!locked && (
              <div className="grid gap-2 border-t border-line p-4">
                {isSent ? (
                  <button className="btn-primary" disabled={!!busy} onClick={() => setReviseOpen(true)}><Send className="h-4 w-4" aria-hidden /> Revise and resend</button>
                ) : (
                  <>
                    <button className="btn-primary" disabled={!!busy} onClick={() => save(true)}><Send className="h-4 w-4" aria-hidden /> {busy === "send" ? "Sending…" : "Save and send"}</button>
                    <button className="btn-ghost" disabled={!!busy} onClick={() => save(false)}>{busy === "save" ? "Saving…" : "Save draft"}</button>
                  </>
                )}
                {msg && <p role={msg.tone === "err" ? "alert" : "status"} className={`break-all text-xs ${msg.tone === "err" ? "text-rose-700" : "text-emerald-700"}`}>{msg.text}</p>}
              </div>
            )}
          </section>
          <Link href="/admin/quotations" className="mt-3 inline-block text-sm font-medium text-orange-700">← All quotations</Link>
        </aside>
      </div>

      <Modal
        open={reviseOpen}
        onClose={() => setReviseOpen(false)}
        title="Revise this quotation"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setReviseOpen(false)}>Cancel</button>
            <ConfirmButton className="btn-primary" onConfirm={() => save(true, reviseReason || "Revised")} confirmText="Click again to resend">Save new version and resend</ConfirmButton>
          </>
        }
      >
        <p className="text-sm text-slate-ink">The current version is kept in the history. The customer receives a new link, and the old link stops working.</p>
        <div className="mt-4">
          <Field label="What changed?" htmlFor="rev-reason"><input id="rev-reason" className={inputCls} value={reviseReason} onChange={(e) => setReviseReason(e.target.value)} placeholder="e.g. Added a second truck" /></Field>
        </div>
      </Modal>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <dt className="text-slate-ink">{label}</dt>
      <dd className={strong ? "font-display font-bold text-navy" : "font-medium text-navy"}>{value}</dd>
    </div>
  );
}

function MoneyInput({ id, label, cents, onChange, disabled, allowEmpty }: { id: string; label: string; cents: number | null; onChange: (c: number | null) => void; disabled?: boolean; allowEmpty?: boolean }) {
  const [text, setText] = useState(fromCents(cents));
  useEffect(() => setText(fromCents(cents)), [cents]);
  return (
    <input
      id={id}
      aria-label={label}
      inputMode="decimal"
      className={inputCls}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(allowEmpty && text.trim() === "" ? null : toCents(text))}
    />
  );
}

function CustomerPicker({ value, onChange, disabled }: { value: Customer | null; onChange: (c: Customer) => void; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "" });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (disabled || q.length < 2) return setResults([]);
    const t = setTimeout(() => api<{ customers: Customer[] }>(`/quotations/customers/search?q=${encodeURIComponent(q)}`).then((r) => setResults(r.customers)).catch(() => setResults([])), 250);
    return () => clearTimeout(t);
  }, [q, disabled]);
  if (disabled || value) {
    return (
      <Field label="Customer">
        <div className="rounded-xl border border-line bg-cloud px-3.5 py-2.5 text-sm">
          <p className="font-semibold text-navy">{value?.name ?? "-"}</p>
          <p className="text-xs text-muted">{value?.email}{value?.company ? ` · ${value.company}` : ""}</p>
        </div>
      </Field>
    );
  }
  return (
    <div>
      <Field label="Customer" htmlFor="cust-q">
        <input id="cust-q" className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or company" />
      </Field>
      {results.length > 0 && (
        <ul className="mt-1 divide-y divide-line rounded-xl border border-line bg-white text-sm">
          {results.map((c) => (
            <li key={c.id}><button type="button" className="block w-full px-3 py-2 text-left hover:bg-navy-50" onClick={() => onChange(c)}>{c.name} <span className="text-muted">· {c.email}</span></button></li>
          ))}
        </ul>
      )}
      <button type="button" className="mt-2 text-xs font-semibold text-orange-700" onClick={() => setCreating((v) => !v)}>{creating ? "Cancel" : "+ New customer"}</button>
      {creating && (
        <div className="mt-2 grid gap-2 rounded-xl border border-line p-3">
          {(["name", "email", "phone", "company"] as const).map((k) => (
            <input key={k} aria-label={k} className={inputCls} placeholder={k[0].toUpperCase() + k.slice(1)} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          ))}
          {err && <p className="text-xs text-rose-700" role="alert">{err}</p>}
          <button
            type="button"
            className="btn-navy !py-2 text-sm"
            onClick={async () => {
              try {
                const r = await api<{ customer: Customer }>("/quotations/customers", { method: "POST", json: { ...form, phone: form.phone || undefined, company: form.company || undefined } });
                onChange(r.customer);
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            Create customer
          </button>
        </div>
      )}
    </div>
  );
}

function DetailsEditor({ value, onChange, disabled }: { value: Details; onChange: (d: Details) => void; disabled?: boolean }) {
  const set = (patch: Partial<Details>) => onChange({ ...value, ...patch });
  const loc = (which: "pickup" | "delivery", patch: Partial<Loc>) => set({ [which]: { ...value[which], ...patch } } as Partial<Details>);
  return (
    <Panel title="Service details (become the order on acceptance)">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Service" htmlFor="dt-svc">
          <select id="dt-svc" className={inputCls} value={value.serviceType} onChange={(e) => set({ serviceType: e.target.value })} disabled={disabled}>
            {Object.entries(SERVICE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Service date" htmlFor="dt-date">
          <input id="dt-date" type="date" className={inputCls} value={value.serviceDate.slice(0, 10)} onChange={(e) => set({ serviceDate: e.target.value })} disabled={disabled} />
        </Field>
        <Field label="Time window" htmlFor="dt-win">
          <select id="dt-win" className={inputCls} value={value.timeWindow ?? "flexible"} onChange={(e) => set({ timeWindow: e.target.value })} disabled={disabled}>
            {TIME_WINDOWS.map((w) => <option key={w} value={w}>{w.replace(/-/g, " ")}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {(["pickup", "delivery"] as const).map((w) => (
          <fieldset key={w} className="rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-semibold capitalize text-navy">{w}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <select aria-label={`${w} location type`} className={inputCls} value={value[w].type} onChange={(e) => loc(w, { type: e.target.value })} disabled={disabled}>
                {LOCATION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/-/g, " ")}</option>)}
              </select>
              <select aria-label={`${w} market`} className={inputCls} value={value[w].market} onChange={(e) => loc(w, { market: e.target.value })} disabled={disabled}>
                {MARKET_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input aria-label={`${w} address`} className={`${inputCls} sm:col-span-2`} value={value[w].address} onChange={(e) => loc(w, { address: e.target.value })} disabled={disabled} placeholder="Address or location name" />
            </div>
          </fieldset>
        ))}
      </div>
      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-navy">Items</p>
        <div className="space-y-2">
          {value.items.map((it, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_90px_32px] gap-2">
              <select aria-label="Item category" className={inputCls} value={it.category} onChange={(e) => set({ items: value.items.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)) })} disabled={disabled}>
                {CATS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <input aria-label="Item quantity" inputMode="numeric" className={inputCls} value={it.quantity} onChange={(e) => set({ items: value.items.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)) })} disabled={disabled} />
              {!disabled && value.items.length > 1 && (
                <button aria-label={`Remove item ${i + 1}`} onClick={() => set({ items: value.items.filter((_, j) => j !== i) })} className="rounded-full p-2 text-muted hover:text-rose-700"><Trash2 className="h-4 w-4" aria-hidden /></button>
              )}
            </div>
          ))}
        </div>
        {!disabled && <button onClick={() => set({ items: [...value.items, { category: "standard-checked", quantity: 1 }] })} className="mt-2 text-xs font-semibold text-orange-700">+ Add item</button>}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="PO number (optional)" htmlFor="dt-po"><input id="dt-po" className={inputCls} value={value.poNumber ?? ""} onChange={(e) => set({ poNumber: e.target.value || null })} disabled={disabled} /></Field>
        <Field label="Cost center (optional)" htmlFor="dt-cc"><input id="dt-cc" className={inputCls} value={value.costCenter ?? ""} onChange={(e) => set({ costCenter: e.target.value || null })} disabled={disabled} /></Field>
      </div>
    </Panel>
  );
}

export { blankDetails, SERVICE_LABELS };
export type { ServiceType };
