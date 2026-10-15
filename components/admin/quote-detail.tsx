"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Calculator, Clock, Mail, MapPin, Package, Phone, User } from "lucide-react";
import { LUGGAGE_CATEGORY_LABELS, type QuoteRequest } from "@/lib/quote-schema";
import { api, API_URL, dateTime, money } from "./api";
import { AdminTitle, Panel, useAdminUser } from "./admin-shell";
import { Badge, marketLabel, ROUTE_LABEL, ROUTE_STYLE, serviceLabel, STATUS_STYLE } from "./labels";
import { ConvertQuoteButton } from "@/components/ops/convert-quote-button";

type Detail = {
  id: string;
  reference: string;
  serviceType: string;
  route: keyof typeof ROUTE_LABEL;
  routeReasons: string[];
  status: string;
  createdAt: string;
  payload: QuoteRequest;
  hubspotSyncStatus: string;
  hubspotError: string | null;
  pricingPreview: Preview | null;
  customer: { name: string; email: string; phone: string | null };
  company: { name: string; domain: string | null } | null;
  notes: { id: string; body: string; createdAt: string; author: { email: string } | null }[];
  events: { id: string; type: string; detail: string | null; actor: string | null; createdAt: string }[];
};

type Preview = {
  decision: { route: string; reasons: string[]; engine: string | null };
  result: { lines: { label: string; cents: number }[]; retailCents: number; costCents: number; profitCents: number; markupPercent: number; marginPercent: number; manualReview: boolean; notes: string[] } | null;
  note?: string;
};

const STATUSES = ["NEW", "REVIEWING", "QUOTED", "WON", "LOST", "ARCHIVED"];

export function QuoteDetail({ id }: { id: string }) {
  const user = useAdminUser();
  const [q, setQ] = useState<Detail | null>(null);
  const [attachments, setAttachments] = useState<{ id: string; originalName: string; sizeBytes: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);

  const load = useCallback(() => {
    api<{ quote: Detail; attachments: typeof attachments }>(`/quotes/${id}`)
      .then((r) => {
        setQ(r.quote);
        setAttachments(r.attachments);
        setPreview(r.quote.pricingPreview);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  async function changeStatus(status: string) {
    setBusy(true);
    try {
      await api(`/quotes/${id}/status`, { method: "PATCH", json: { status } });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api(`/quotes/${id}/notes`, { method: "POST", json: { body: note } });
      setNote("");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    setBusy(true);
    try {
      const r = await api<{ preview: Preview }>(`/quotes/${id}/pricing-preview`, { method: "POST" });
      setPreview(r.preview);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !q) return <p className="text-sm text-rose-700">{error}</p>;
  if (!q) return <p className="text-sm text-muted">Loading request…</p>;
  const p = q.payload;
  const canWrite = user?.role !== undefined;
  const canPrice = user?.role === "OWNER" || user?.role === "STAFF";

  return (
    <>
      <Link href="/admin/quotes" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All requests
      </Link>
      <AdminTitle
        title={q.reference}
        sub={`${serviceLabel(q.serviceType)} · received ${dateTime(q.createdAt)}`}
        actions={
          <>
            {(user?.role === "OWNER" || user?.role === "STAFF") && (
              <Link href={`/admin/quotations/new?quoteRequestId=${q.id}`} className="btn-primary !px-4 !py-2">Build quotation</Link>
            )}
            {user?.role !== "ACCOUNTING" && <ConvertQuoteButton quoteId={q.id} />}
            <Badge className={ROUTE_STYLE[q.route]}>{ROUTE_LABEL[q.route]}</Badge>
            <Badge className={STATUS_STYLE[q.status]}>{q.status}</Badge>
          </>
        }
      />
      {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Route decision">
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-ink">
              {q.routeReasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </Panel>

          <Panel title="Pickup & delivery">
            <div className="grid gap-4 md:grid-cols-2">
              {[["Pickup", p.pickup], ["Delivery", p.delivery], ...p.extraStops.map((s, i) => [`Extra stop ${i + 1}`, s] as const)].map(([label, loc]) => {
                const l = loc as QuoteRequest["pickup"];
                return (
                  <div key={label as string} className="rounded-xl bg-cloud p-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted"><MapPin className="h-3.5 w-3.5" aria-hidden /> {label as string}</p>
                    <p className="mt-2 font-medium text-charcoal">{l.address}</p>
                    <p className="text-sm text-slate-ink">{marketLabel(l.market)} · {l.type}{l.facility ? ` · ${l.facility}` : ""}</p>
                    {l.notes && <p className="mt-1 text-xs text-muted">{l.notes}</p>}
                  </div>
                );
              })}
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Field label="Service date" value={p.serviceDate} />
              <Field label="Time window" value={p.timeWindow} />
              <Field label="Speed" value={p.speed} />
              <Field label="Deadline" value={p.deadline} />
              <Field label="Travelers" value={p.travelers} />
              <Field label="Flight" value={p.flightDetails} />
              <Field label="Cruise line / ship" value={[p.cruiseLine, p.shipName].filter(Boolean).join(" · ")} />
              <Field label="Sailing date" value={p.sailingDate} />
              <Field label="Event" value={p.eventName} />
              <Field label="Storage" value={p.storageStart ? `${p.storageStart.replace("T", " ")} → ${(p.storageEnd ?? "").replace("T", " ")}${p.storageWithPickup ? " · with pickup" : ""}${p.storageWithDelivery ? " · with delivery" : ""}` : ""} />
              <Field label="Group name" value={p.groupName} />
              <Field label="Hotels / venues" value={p.hotelsOrVenues} />
              <Field label="Vehicles needed" value={p.vehiclesNeeded} />
              <Field label="Labor needed" value={p.laborNeeded} />
              <Field label="On-site coordination" value={p.onsiteCoordination ? "Yes" : ""} />
            </dl>
          </Panel>

          <Panel title="Items">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted"><tr><th className="py-2">Category</th><th>Qty</th><th>Weight</th><th>Size (in)</th><th>Description</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {p.items.map((it, i) => (
                    <tr key={i}>
                      <td className="py-2 font-medium">{it.category === "cargo" ? "Cargo" : LUGGAGE_CATEGORY_LABELS[it.category]}</td>
                      <td>{it.quantity}</td>
                      <td>{it.weightLbs ? `${it.weightLbs} lbs` : "-"}</td>
                      <td>{it.lengthIn ? `${it.lengthIn}×${it.widthIn ?? "?"}×${it.heightIn ?? "?"}` : "-"}</td>
                      <td className="text-slate-ink">{it.description || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Field label="Access notes" value={p.accessNotes} />
              <Field label="Special handling" value={p.specialHandling} />
              <Field label="Customer notes" value={p.notes} />
              {attachments.length > 0 && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Attachments</dt>
                  <dd className="mt-0.5 space-y-1">
                    {attachments.map((a) => (
                      <a key={a.id} href={`${API_URL}/v1/admin/uploads/${a.id}`} className="block text-orange-700 hover:underline">{a.originalName} ({Math.round(a.sizeBytes / 1024)} KB)</a>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </Panel>

          {canPrice && (
            <Panel
              title="Internal pricing preview"
              action={<button onClick={runPreview} disabled={busy} className="btn-navy !py-2"><Calculator className="h-4 w-4" aria-hidden /> Run preview</button>}
            >
              <p className="mb-3 text-xs text-muted">Internal only. Uses the active pricing rules. Customers never see these figures while automatic pricing is off.</p>
              {!preview ? (
                <p className="text-sm text-muted">No preview yet.</p>
              ) : preview.result ? (
                <PricingBreakdown result={preview.result} />
              ) : (
                <p className="text-sm text-slate-ink">{preview.note ?? "This request is priced manually."}</p>
              )}
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="Customer">
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2"><User className="h-4 w-4 text-muted" aria-hidden />{q.customer.name}{q.company ? ` · ${q.company.name}` : ""}</li>
              <li className="flex gap-2"><Mail className="h-4 w-4 text-muted" aria-hidden /><a className="text-orange-700 hover:underline" href={`mailto:${q.customer.email}?subject=${encodeURIComponent(`Your Express Bags quote ${q.reference}`)}`}>{q.customer.email}</a></li>
              <li className="flex gap-2"><Phone className="h-4 w-4 text-muted" aria-hidden /><a className="hover:underline" href={`tel:${q.customer.phone}`}>{q.customer.phone}</a></li>
            </ul>
            <dl className="mt-4 grid gap-2 text-sm">
              <Field label="Preferred contact" value={p.contact.preferredContact} />
              <Field label="On-site contact" value={p.onsiteContact} />
              <Field label="Billing" value={p.billingType} />
              <Field label="Lead source" value={p.leadSource} />
              <Field label="HubSpot" value={`${q.hubspotSyncStatus}${q.hubspotError ? `: ${q.hubspotError}` : ""}`} />
            </dl>
          </Panel>

          {canWrite && (
            <Panel title="Status">
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button key={s} disabled={busy || s === q.status} onClick={() => changeStatus(s)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition disabled:cursor-default ${s === q.status ? STATUS_STYLE[s] : "bg-white text-slate-ink ring-line hover:ring-navy/40"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Internal notes">
            <form onSubmit={addNote}>
              <label htmlFor="note" className="sr-only">Add a note</label>
              <textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Call log, decisions, next steps…"
                className="w-full rounded-xl border border-line p-3 text-sm focus:border-navy focus:outline-none" />
              <button className="btn-primary mt-2 !py-2" disabled={busy || !note.trim()}>Add note</button>
            </form>
            <ul className="mt-4 space-y-3">
              {q.notes.map((n) => (
                <li key={n.id} className="rounded-xl bg-cloud p-3 text-sm">
                  <p className="whitespace-pre-wrap text-charcoal">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{n.author?.email ?? "staff"} · {dateTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Timeline">
            <ol className="space-y-3 border-l border-line pl-4">
              {q.events.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span aria-hidden className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-orange" />
                  <p className="font-medium capitalize text-charcoal">{e.type}</p>
                  {e.detail && <p className="text-xs text-slate-ink">{e.detail}</p>}
                  <p className="flex items-center gap-1 text-xs text-muted"><Clock className="h-3 w-3" aria-hidden />{dateTime(e.createdAt)}{e.actor ? ` · ${e.actor}` : ""}</p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 text-charcoal">{String(value)}</dd>
    </div>
  );
}

export function PricingBreakdown({ result }: { result: NonNullable<Preview["result"]> }) {
  return (
    <div>
      <ul className="divide-y divide-line text-sm">
        {result.lines.map((l, i) => (
          <li key={i} className="flex justify-between py-1.5"><span className="text-slate-ink">{l.label}</span><span className={l.cents < 0 ? "text-emerald-700" : ""}>{money(l.cents)}</span></li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Retail", money(result.retailCents)],
          ["Est. cost", money(result.costCents)],
          ["Profit", money(result.profitCents)],
          ["Markup", `${result.markupPercent}%`],
          ["Gross margin", `${result.marginPercent}%`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-navy-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{k}</p>
            <p className="mt-0.5 font-display text-lg font-bold text-navy">{v}</p>
          </div>
        ))}
      </div>
      {result.manualReview && <p className="mt-3 flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-700"><Package className="h-4 w-4" aria-hidden /> Manual review required</p>}
      {result.notes.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-muted">{result.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </div>
  );
}
