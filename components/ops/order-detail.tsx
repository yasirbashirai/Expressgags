"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Camera, ClipboardList, FileDown, MapPin, MessageSquarePlus, Pencil, Printer, Route as RouteIcon, ShieldAlert, Tag, Upload, User, Users } from "lucide-react";
import { api, API_URL, dateTime, money } from "@/components/admin/api";
import { AdminTitle, Panel, useAdminUser } from "@/components/admin/admin-shell";
import { Badge, marketLabel, serviceLabel } from "@/components/admin/labels";
import { Field, inputCls, Modal } from "@/components/admin/ui";
import { EXCEPTION_LABEL, facilityName, NEXT_STATUSES, ORDER_STATUS_LABEL, ORDER_STATUS_STYLE, PIECE_CATEGORY_LABEL, PRIORITY_STYLE, SEVERITY_STYLE, shortDate, TIME_WINDOW_LABEL, timeOf, type Stop } from "./labels";

type Upload = { id: string; originalName: string; mimeType: string; kind: string | null; sizeBytes: number };
type Detail = {
  id: string;
  reference: string;
  status: string;
  serviceType: string;
  fulfillment: string;
  market: string;
  priority: string;
  paymentStatus: string;
  serviceDate: string;
  timeWindow: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  pickup: Stop;
  delivery: Stop;
  extraStops: Stop[] | null;
  specialHandling: string | null;
  accessNotes: string | null;
  customerNotes: string | null;
  internalNotes: string | null;
  poNumber: string | null;
  costCenter: string | null;
  guestName: string | null;
  guestRoom: string | null;
  vehicleClassCode: string | null;
  retailCents: number | null;
  costCents: number | null;
  depositCents: number | null;
  cancelReason: string | null;
  createdAt: string;
  customer: { id: string; name: string; email: string; phone: string | null; accountRole: string };
  company: { id: string; name: string; accountType: string | null; poRequired: boolean; paymentTermsDays: number } | null;
  quote: { id: string; reference: string } | null;
  quotation: { id: string; reference: string; status: string } | null;
  pieces: { id: string; pieceId: string; category: string; description: string | null; status: string; weightLbs: number | null; lengthIn: number | null; widthIn: number | null; heightIn: number | null; custodyLocation: string | null; storageBay: string | null }[];
  events: { id: string; type: string; status: string | null; detail: string | null; actorType: string; actorName: string | null; createdAt: string; uploadIds: string[]; customerVisible: boolean; piece: { pieceId: string } | null }[];
  assignments: { id: string; role: string; status: string; sequence: number; employee: { id: string; firstName: string; lastName: string; role: string; phone: string | null }; vehicle: { id: string; unitNumber: string; vehicleClassCode: string } | null }[];
  proofs: { id: string; kind: string; pieceCount: number; recipientName: string | null; signatureUploadId: string | null; photoUploadIds: string[]; conditionNotes: string | null; capturedAt: string }[];
  exceptions: { id: string; type: string; severity: string; status: string; detail: string | null; reportedBy: string | null; resolution: string | null; resolvedBy: string | null; createdAt: string; uploadIds: string[] }[];
  shipments: { id: string; carrier: string; service: string; trackingNumber: string | null; status: string; ebServiceLevel: string }[];
  storage: { id: string; reference: string; status: string; startsAt: string; endsAt: string; pieces: number }[];
};

const EVENT_ICON: Record<string, string> = { STATUS: "bg-navy", SCAN: "bg-sky-600", PHOTO: "bg-sky-600", HANDOFF: "bg-emerald-600", EXCEPTION: "bg-rose-600", NOTE: "bg-muted", CARRIER: "bg-violet-600", STORAGE: "bg-violet-600", CUSTOMER: "bg-orange", NOTIFICATION: "bg-slate-ink" };

/**
 * Valid next statuses, most likely first: a nationwide order heads to the carrier, a storage order to the
 * facility, a local order straight to delivery. Backward moves (e.g. back to Confirmed) are listed last.
 */
const FORWARD_ORDER = ["DRIVER_ASSIGNED", "EN_ROUTE", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED", "AT_FACILITY", "TRANSFERRED_TO_CARRIER", "IN_TRANSIT", "CONFIRMED"];
function nextSteps(o: { status: string; fulfillment: string }) {
  const prefer = o.fulfillment === "nationwide" ? ["TRANSFERRED_TO_CARRIER", "IN_TRANSIT"] : o.fulfillment === "storage" ? ["AT_FACILITY"] : [];
  return NEXT_STATUSES[o.status]
    .filter((s) => s !== "CANCELLED")
    .sort((a, b) => {
      const pa = prefer.includes(a) ? -1 : 0, pb = prefer.includes(b) ? -1 : 0;
      return pa - pb || FORWARD_ORDER.indexOf(a) - FORWARD_ORDER.indexOf(b);
    });
}

export function OrderDetail({ id }: { id: string }) {
  const user = useAdminUser();
  const [o, setO] = useState<Detail | null>(null);
  const [uploads, setUploads] = useState<Record<string, Upload>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | "cancel" | "edit" | "manifest" | "exception">(null);

  const load = useCallback(() => {
    api<{ order: Detail; uploads: Upload[] }>(`/orders/${id}`)
      .then((r) => {
        setO(r.order);
        setUploads(Object.fromEntries(r.uploads.map((u) => [u.id, u])));
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error && !o) return <p className="text-sm text-rose-700">{error}</p>;
  if (!o) return <p className="text-sm text-muted">Loading order…</p>;

  const canWrite = user?.role === "OWNER" || user?.role === "STAFF" || user?.role === "DISPATCHER";
  const canSeeCost = user?.role === "OWNER" || user?.role === "STAFF" || user?.role === "ACCOUNTING";
  const closed = o.status === "DELIVERED" || o.status === "CANCELLED";
  const activeCrew = o.assignments.filter((a) => a.status !== "REMOVED");
  const openExceptions = o.exceptions.filter((x) => x.status !== "RESOLVED");
  const stops: [string, Stop][] = [["Pickup", o.pickup], ["Delivery", o.delivery], ...(o.extraStops ?? []).map((s, i) => [`Extra stop ${i + 1}`, s] as [string, Stop])];
  const fileLink = (uid: string) => `${API_URL}/v1/admin/uploads/${uid}`;

  return (
    <>
      <Link href="/admin/orders" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All orders
      </Link>
      <AdminTitle
        title={o.reference}
        sub={`${serviceLabel(o.serviceType)} · ${marketLabel(o.market)} · ${o.pieces.length} piece${o.pieces.length === 1 ? "" : "s"} · created ${dateTime(o.createdAt)}`}
        actions={
          <>
            <Badge className={ORDER_STATUS_STYLE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
            {o.priority !== "NORMAL" && <Badge className={PRIORITY_STYLE[o.priority]}>{o.priority}</Badge>}
            <Badge className="bg-white text-slate-ink ring-line">{o.paymentStatus.replace("_", " ").toLowerCase()}</Badge>
          </>
        }
      />
      {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</p>}

      {/* Action bar */}
      <div className="card mb-6 flex flex-wrap items-center gap-2 p-3">
        {canWrite && !closed && nextSteps(o).map((s, i) => (
          <button key={s} disabled={busy} onClick={() => run(() => api(`/orders/${o.id}/status`, { method: "POST", json: { to: s } }))} className={i === 0 ? "btn-navy !px-4 !py-2" : "btn-ghost !px-4 !py-2"}>
            {i === 0 ? `Mark ${ORDER_STATUS_LABEL[s].toLowerCase()}` : ORDER_STATUS_LABEL[s]}
          </button>
        ))}
        {canWrite && !closed && <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />}
        <a href={`${API_URL}/v1/admin/orders/${o.id}/tags.pdf`} target="_blank" rel="noreferrer" className="btn-ghost !px-4 !py-2"><Tag className="h-4 w-4" aria-hidden /> Bag tags 4x6</a>
        <a href={`${API_URL}/v1/admin/orders/${o.id}/tags.pdf?layout=letter`} target="_blank" rel="noreferrer" className="btn-ghost !px-4 !py-2"><Printer className="h-4 w-4" aria-hidden /> Tags on letter</a>
        <a href={`${API_URL}/v1/admin/orders/${o.id}/manifest.pdf`} target="_blank" rel="noreferrer" className="btn-ghost !px-4 !py-2"><FileDown className="h-4 w-4" aria-hidden /> Manifest PDF</a>
        <Link href={`/admin/dispatch?date=${o.serviceDate.slice(0, 10)}`} className="btn-ghost !px-4 !py-2"><RouteIcon className="h-4 w-4" aria-hidden /> Dispatch</Link>
        {canWrite && !closed && (
          <>
            <button onClick={() => setModal("edit")} className="btn-ghost !px-4 !py-2"><Pencil className="h-4 w-4" aria-hidden /> Edit</button>
            <button onClick={() => setModal("exception")} className="btn-ghost !px-4 !py-2"><ShieldAlert className="h-4 w-4" aria-hidden /> Report exception</button>
            {NEXT_STATUSES[o.status].includes("CANCELLED") && <button onClick={() => setModal("cancel")} className="btn-ghost !px-4 !py-2 !text-rose-700">Cancel order</button>}
          </>
        )}
      </div>

      {o.status === "CANCELLED" && o.cancelReason && <p className="mb-6 rounded-xl bg-cloud px-4 py-3 text-sm text-slate-ink">Cancelled: {o.cancelReason}</p>}
      {openExceptions.length > 0 && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="flex items-center gap-2 font-display font-bold text-rose-800"><AlertTriangle className="h-4 w-4" aria-hidden /> {openExceptions.length} open exception{openExceptions.length > 1 ? "s" : ""}</p>
          <ul className="mt-2 space-y-1 text-sm text-rose-900">
            {openExceptions.map((x) => <li key={x.id}><Badge className={SEVERITY_STYLE[x.severity]}>{x.severity}</Badge> {EXCEPTION_LABEL[x.type]}: {x.detail}</li>)}
          </ul>
          <Link href="/admin/exceptions" className="mt-2 inline-block text-sm font-semibold text-rose-800 underline">Work exceptions</Link>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Panel title="Route & schedule">
            <ol className="relative grid gap-3 md:grid-cols-2">
              {stops.map(([label, s]) => (
                <li key={label} className="rounded-xl bg-cloud p-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted"><MapPin className="h-3.5 w-3.5" aria-hidden /> {label}</p>
                  <p className="mt-2 font-medium text-charcoal">{s.address}</p>
                  <p className="text-sm text-slate-ink">{s.market ? marketLabel(s.market) : ""}{s.type ? ` · ${s.type}` : ""}{s.facility ? ` · ${facilityName(s.facility)}` : ""}</p>
                  {s.contact && <p className="mt-1 text-xs text-slate-ink">Contact: {s.contact}</p>}
                  {s.notes && <p className="mt-1 text-xs text-muted">{s.notes}</p>}
                </li>
              ))}
            </ol>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Item label="Service date" value={shortDate(o.serviceDate)} />
              <Item label="Time window" value={o.windowStart && o.windowEnd ? `${timeOf(o.windowStart)} – ${timeOf(o.windowEnd)}` : o.timeWindow ? TIME_WINDOW_LABEL[o.timeWindow] ?? o.timeWindow : null} />
              <Item label="Fulfillment" value={o.fulfillment} />
              <Item label="Vehicle class" value={o.vehicleClassCode} />
              <Item label="Access notes" value={o.accessNotes} />
              <Item label="Special handling" value={o.specialHandling} />
            </dl>
            {o.customerNotes && <p className="mt-4 whitespace-pre-line rounded-xl border border-line p-3 text-sm text-slate-ink"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Customer notes</span>{o.customerNotes}</p>}
            {o.internalNotes && <p className="mt-3 whitespace-pre-line rounded-xl bg-orange-50 p-3 text-sm text-slate-ink"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-orange-700">Internal notes</span>{o.internalNotes}</p>}
          </Panel>

          <Panel
            title={`Pieces (${o.pieces.length})`}
            action={canWrite && !closed && <button onClick={() => setModal("manifest")} className="btn-ghost !px-3 !py-1.5 text-xs"><Upload className="h-3.5 w-3.5" aria-hidden /> Import manifest CSV</button>}
          >
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="sticky top-0 bg-white text-xs uppercase tracking-wider text-muted">
                  <tr><th className="py-2">Piece ID</th><th>Item</th><th>Size / weight</th><th>Custody</th><th>Status</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {o.pieces.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 font-mono text-xs font-semibold text-navy">{p.pieceId}</td>
                      <td>{PIECE_CATEGORY_LABEL[p.category] ?? p.category}{p.description && <p className="text-xs text-muted">{p.description}</p>}</td>
                      <td className="text-xs text-slate-ink">{p.lengthIn ? `${p.lengthIn}×${p.widthIn ?? "?"}×${p.heightIn ?? "?"} in` : "-"}{p.weightLbs ? ` · ${p.weightLbs} lb` : ""}</td>
                      <td className="text-xs text-slate-ink">{[p.custodyLocation, p.storageBay && `Bay ${p.storageBay}`].filter(Boolean).join(" · ") || "-"}</td>
                      <td><Badge className={ORDER_STATUS_STYLE[p.status]}>{ORDER_STATUS_LABEL[p.status]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Chain of custody">
            <NoteForm disabled={!canWrite} onAdd={(body, customerVisible) => run(() => api(`/orders/${o.id}/notes`, { method: "POST", json: { body, customerVisible } }))} />
            <ol className="mt-5 space-y-4">
              {o.events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${EVENT_ICON[e.type] ?? "bg-muted"}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-charcoal">
                      <span className="font-semibold">{e.status ? ORDER_STATUS_LABEL[e.status] : e.type.toLowerCase()}</span>
                      {e.detail && e.detail !== ORDER_STATUS_LABEL[e.status ?? ""] && <span className="text-slate-ink">: {e.detail}</span>}
                      {e.piece && <span className="ml-1 font-mono text-xs text-navy">[{e.piece.pieceId}]</span>}
                    </p>
                    <p className="text-xs text-muted">{dateTime(e.createdAt)} · {e.actorName ?? e.actorType}{e.customerVisible ? " · visible to customer" : ""}</p>
                    {e.uploadIds.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-2 text-xs">
                        {e.uploadIds.map((u) => <a key={u} href={fileLink(u)} className="inline-flex items-center gap-1 text-orange-700 hover:underline"><Camera className="h-3 w-3" aria-hidden />{uploads[u]?.originalName ?? "file"}</a>)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          {o.proofs.length > 0 && (
            <Panel title="Proof of pickup & delivery">
              <ul className="grid gap-3 md:grid-cols-2">
                {o.proofs.map((p) => (
                  <li key={p.id} className="rounded-xl border border-line p-4 text-sm">
                    <p className="font-semibold text-navy">{p.kind.replace("_", " ").toLowerCase()} · {p.pieceCount} piece{p.pieceCount === 1 ? "" : "s"}</p>
                    <p className="text-xs text-muted">{dateTime(p.capturedAt)}{p.recipientName ? ` · ${p.recipientName}` : ""}</p>
                    {p.conditionNotes && <p className="mt-1 text-xs text-slate-ink">{p.conditionNotes}</p>}
                    <p className="mt-2 flex flex-wrap gap-2 text-xs">
                      {p.signatureUploadId && <a href={fileLink(p.signatureUploadId)} className="text-orange-700 hover:underline">Signature</a>}
                      {p.photoUploadIds.map((u, i) => <a key={u} href={fileLink(u)} className="text-orange-700 hover:underline">Photo {i + 1}</a>)}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title="Customer">
            <p className="flex items-center gap-2 font-medium text-charcoal"><User className="h-4 w-4 text-orange" aria-hidden /> {o.customer.name}</p>
            <p className="mt-1 text-sm text-slate-ink"><a href={`mailto:${o.customer.email}`} className="hover:underline">{o.customer.email}</a></p>
            {o.customer.phone && <p className="text-sm text-slate-ink"><a href={`tel:${o.customer.phone}`} className="hover:underline">{o.customer.phone}</a></p>}
            {o.company && <p className="mt-3 rounded-xl bg-cloud px-3 py-2 text-sm">{o.company.name}{o.company.accountType ? ` · ${o.company.accountType}` : ""}{o.company.paymentTermsDays ? ` · net ${o.company.paymentTermsDays}` : ""}</p>}
            <dl className="mt-3 grid gap-2 text-sm">
              <Item label="Guest" value={o.guestName ? `${o.guestName}${o.guestRoom ? ` · Room ${o.guestRoom}` : ""}` : null} />
              <Item label="PO number" value={o.poNumber ?? (o.company?.poRequired ? "Required, not provided" : null)} />
              <Item label="Cost center" value={o.costCenter} />
              <Item label="From request" value={o.quote ? <Link className="text-orange-700 hover:underline" href={`/admin/quotes/${o.quote.id}`}>{o.quote.reference}</Link> : null} />
              <Item label="Quotation" value={o.quotation ? `${o.quotation.reference} (${o.quotation.status.toLowerCase()})` : null} />
            </dl>
          </Panel>

          <Panel title="Crew" action={<Link href={`/admin/dispatch?date=${o.serviceDate.slice(0, 10)}`} className="text-xs font-semibold text-orange-700 hover:underline">Assign on board</Link>}>
            {activeCrew.length === 0 ? (
              <p className="text-sm text-orange-700">No one assigned yet.</p>
            ) : (
              <ul className="space-y-2">
                {activeCrew.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl bg-cloud px-3 py-2 text-sm">
                    <span className="flex items-center gap-2"><Users className="h-4 w-4 text-navy" aria-hidden /> {a.employee.firstName} {a.employee.lastName}</span>
                    <span className="text-xs text-muted">{a.role.toLowerCase()}{a.vehicle ? ` · ${a.vehicle.unitNumber}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted">The booked customer sees only the driver&apos;s first name and the dispatch line after assignment.</p>
          </Panel>

          <Panel title="Money">
            <dl className="grid gap-2 text-sm">
              <Item label="Price" value={o.retailCents != null ? money(o.retailCents) : "Not priced"} />
              {canSeeCost && <Item label="Internal cost" value={o.costCents != null ? money(o.costCents) : null} />}
              {canSeeCost && o.retailCents != null && o.costCents != null && o.retailCents > 0 && (
                <Item label="Gross margin" value={`${(((o.retailCents - o.costCents) / o.retailCents) * 100).toFixed(1)}% (${money(o.retailCents - o.costCents)})`} />
              )}
              <Item label="Deposit" value={o.depositCents != null ? money(o.depositCents) : null} />
              <Item label="Payment" value={o.paymentStatus.replace("_", " ").toLowerCase()} />
            </dl>
          </Panel>

          {(o.shipments.length > 0 || o.storage.length > 0) && (
            <Panel title="Carrier & storage">
              {o.shipments.map((s) => (
                <p key={s.id} className="text-sm"><span className="font-semibold">Carrier tracking</span> · {s.carrier} {s.service}: <span className="font-mono">{s.trackingNumber ?? "pending"}</span> ({s.status.toLowerCase()})</p>
              ))}
              {o.storage.map((s) => (
                <p key={s.id} className="text-sm">Storage {s.reference}: {s.pieces} pcs, {shortDate(s.startsAt)} to {shortDate(s.endsAt)} ({s.status.toLowerCase()})</p>
              ))}
            </Panel>
          )}

          <Panel title="Exceptions" action={canWrite && !closed && <button onClick={() => setModal("exception")} className="text-xs font-semibold text-orange-700 hover:underline">Report</button>}>
            {o.exceptions.length === 0 ? (
              <p className="text-sm text-muted">No exceptions on this order.</p>
            ) : (
              <ul className="space-y-3">
                {o.exceptions.map((x) => (
                  <li key={x.id} className="rounded-xl border border-line p-3 text-sm">
                    <div className="flex items-center justify-between gap-2"><span className="font-semibold">{EXCEPTION_LABEL[x.type]}</span><Badge className={SEVERITY_STYLE[x.severity]}>{x.severity}</Badge></div>
                    <p className="mt-1 text-slate-ink">{x.detail}</p>
                    <p className="mt-1 text-xs text-muted">{dateTime(x.createdAt)} · {x.reportedBy} · {x.status.toLowerCase()}</p>
                    {x.resolution && <p className="mt-1 text-xs text-emerald-800">Resolved by {x.resolvedBy}: {x.resolution}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <CancelModal open={modal === "cancel"} busy={busy} onClose={() => setModal(null)} onConfirm={async (reason) => { if (await run(() => api(`/orders/${o.id}/status`, { method: "POST", json: { to: "CANCELLED", reason } }))) setModal(null); }} />
      <EditModal open={modal === "edit"} order={o} busy={busy} onClose={() => setModal(null)} onSave={async (patch) => { if (await run(() => api(`/orders/${o.id}`, { method: "PATCH", json: patch }))) setModal(null); }} />
      <ManifestModal open={modal === "manifest"} busy={busy} error={error} onClose={() => setModal(null)} onImport={async (csv) => { if (await run(() => api(`/orders/${o.id}/manifest`, { method: "POST", json: { csv } }))) setModal(null); }} />
      <ExceptionModal open={modal === "exception"} busy={busy} onClose={() => setModal(null)} onSave={async (body) => { if (await run(() => api(`/orders/${o.id}/exceptions`, { method: "POST", json: body }))) setModal(null); }} />
    </>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 text-charcoal">{value}</dd>
    </div>
  );
}

function NoteForm({ onAdd, disabled }: { onAdd: (body: string, customerVisible: boolean) => Promise<boolean>; disabled: boolean }) {
  const [body, setBody] = useState("");
  const [visible, setVisible] = useState(false);
  if (disabled) return null;
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (body.trim() && (await onAdd(body.trim(), visible))) {
          setBody("");
          setVisible(false);
        }
      }}
    >
      <div className="flex-1">
        <label htmlFor="ev-note" className="sr-only">Add a note to the timeline</label>
        <input id="ev-note" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note to the timeline" className={inputCls} />
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-ink"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="accent-[#E06010]" /> Show on customer tracking</label>
      <button className="btn-navy !px-4 !py-2"><MessageSquarePlus className="h-4 w-4" aria-hidden /> Add</button>
    </form>
  );
}

function CancelModal({ open, onClose, onConfirm, busy }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Cancel this order?" footer={<><button className="btn-ghost" onClick={onClose}>Keep order</button><button className="btn bg-rose-700 text-white hover:bg-rose-800" disabled={busy || reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>Cancel order</button></>}>
      <Field label="Reason (recorded on the timeline)" htmlFor="cancel-reason">
        <textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="e.g. Customer changed plans, cancellation per written quote terms" />
      </Field>
      <p className="mt-3 text-xs text-muted">Refunds and cancellation fees follow the stage-based policy on the customer&apos;s written quote.</p>
    </Modal>
  );
}

function EditModal({ open, order, onClose, onSave, busy }: { open: boolean; order: Detail; onClose: () => void; onSave: (p: Record<string, unknown>) => void; busy: boolean }) {
  const t = (iso: string | null) => (iso ? new Date(iso).toTimeString().slice(0, 5) : "");
  const [f, setF] = useState({
    serviceDate: order.serviceDate.slice(0, 10),
    timeWindow: order.timeWindow ?? "",
    windowStart: t(order.windowStart),
    windowEnd: t(order.windowEnd),
    priority: order.priority,
    specialHandling: order.specialHandling ?? "",
    accessNotes: order.accessNotes ?? "",
    internalNotes: order.internalNotes ?? "",
    poNumber: order.poNumber ?? "",
    costCenter: order.costCenter ?? "",
    guestName: order.guestName ?? "",
    guestRoom: order.guestRoom ?? "",
    vehicleClassCode: order.vehicleClassCode ?? "",
    retail: order.retailCents != null ? (order.retailCents / 100).toFixed(2) : "",
    cost: order.costCents != null ? (order.costCents / 100).toFixed(2) : "",
    paymentStatus: order.paymentStatus,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const nul = (s: string) => (s.trim() ? s.trim() : null);
  const cents = (s: string) => (s.trim() ? Math.round(Number(s) * 100) : null);
  return (
    <Modal wide open={open} onClose={onClose} title="Edit order details" footer={<><button className="btn-ghost" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy} onClick={() => onSave({
      serviceDate: f.serviceDate, timeWindow: nul(f.timeWindow), windowStart: f.windowStart || "", windowEnd: f.windowEnd || "", priority: f.priority,
      specialHandling: nul(f.specialHandling), accessNotes: nul(f.accessNotes), internalNotes: nul(f.internalNotes), poNumber: nul(f.poNumber), costCenter: nul(f.costCenter),
      guestName: nul(f.guestName), guestRoom: nul(f.guestRoom), vehicleClassCode: nul(f.vehicleClassCode), retailCents: cents(f.retail), costCents: cents(f.cost), paymentStatus: f.paymentStatus,
    })}>Save changes</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Service date" htmlFor="e-date"><input id="e-date" type="date" value={f.serviceDate} onChange={set("serviceDate")} className={inputCls} /></Field>
        <Field label="Time window" htmlFor="e-tw"><select id="e-tw" value={f.timeWindow} onChange={set("timeWindow")} className={inputCls}><option value="">Not set</option>{Object.entries(TIME_WINDOW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Exact start (optional)" htmlFor="e-ws"><input id="e-ws" type="time" value={f.windowStart} onChange={set("windowStart")} className={inputCls} /></Field>
        <Field label="Exact end (optional)" htmlFor="e-we"><input id="e-we" type="time" value={f.windowEnd} onChange={set("windowEnd")} className={inputCls} /></Field>
        <Field label="Priority" htmlFor="e-pr"><select id="e-pr" value={f.priority} onChange={set("priority")} className={inputCls}><option>NORMAL</option><option>RUSH</option><option>VIP</option></select></Field>
        <Field label="Vehicle class" htmlFor="e-vc"><select id="e-vc" value={f.vehicleClassCode} onChange={set("vehicleClassCode")} className={inputCls}><option value="">Not set</option><option value="cargo-van">Cargo van</option><option value="box-15">15-ft box truck</option><option value="box-20">20-ft box truck</option><option value="box-26">26-ft box truck</option></select></Field>
        <Field label="Guest name" htmlFor="e-gn"><input id="e-gn" value={f.guestName} onChange={set("guestName")} className={inputCls} /></Field>
        <Field label="Guest room" htmlFor="e-gr"><input id="e-gr" value={f.guestRoom} onChange={set("guestRoom")} className={inputCls} /></Field>
        <Field label="PO number" htmlFor="e-po"><input id="e-po" value={f.poNumber} onChange={set("poNumber")} className={inputCls} /></Field>
        <Field label="Cost center" htmlFor="e-cc"><input id="e-cc" value={f.costCenter} onChange={set("costCenter")} className={inputCls} /></Field>
        <Field label="Price (USD)" htmlFor="e-rt"><input id="e-rt" inputMode="decimal" value={f.retail} onChange={set("retail")} className={inputCls} /></Field>
        <Field label="Internal cost (USD)" htmlFor="e-ct"><input id="e-ct" inputMode="decimal" value={f.cost} onChange={set("cost")} className={inputCls} /></Field>
        <Field label="Payment status" htmlFor="e-ps"><select id="e-ps" value={f.paymentStatus} onChange={set("paymentStatus")} className={inputCls}>{["UNPAID", "DEPOSIT_PAID", "PAID", "INVOICED", "ACCOUNT", "REFUNDED"].map((s) => <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>)}</select></Field>
        <div className="sm:col-span-2"><Field label="Access notes" htmlFor="e-an"><textarea id="e-an" rows={2} value={f.accessNotes} onChange={set("accessNotes")} className={inputCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Special handling" htmlFor="e-sh"><textarea id="e-sh" rows={2} value={f.specialHandling} onChange={set("specialHandling")} className={inputCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Internal notes (never shown to customers)" htmlFor="e-in"><textarea id="e-in" rows={3} value={f.internalNotes} onChange={set("internalNotes")} className={inputCls} /></Field></div>
      </div>
    </Modal>
  );
}

function ManifestModal({ open, onClose, onImport, busy, error }: { open: boolean; onClose: () => void; onImport: (csv: string) => void; busy: boolean; error: string | null }) {
  const [csv, setCsv] = useState("");
  return (
    <Modal wide open={open} onClose={onClose} title="Import group manifest" footer={<><button className="btn-ghost" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy || csv.trim().length < 5} onClick={() => onImport(csv)}>Add pieces</button></>}>
      <p className="text-sm text-slate-ink">Paste CSV or choose a file. Header row required. Recognized columns: <code>guest</code>, <code>room</code>, <code>category</code> (carry-on, checked, large, oversized, golf, equipment…), <code>qty</code>, <code>description</code>, <code>notes</code>.</p>
      <input type="file" accept=".csv,text/csv" aria-label="Choose a CSV file" className="mt-3 text-sm" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setCsv(await file.text()); }} />
      <label htmlFor="manifest-csv" className="sr-only">Manifest CSV</label>
      <textarea id="manifest-csv" rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} className={`${inputCls} mt-3 font-mono text-xs`} placeholder={"guest,room,category,qty,notes\nAna Lopez,1204,checked,2,\nBen Ito,88,golf,1,fragile"} />
      {error && <p className="mt-2 text-sm text-rose-700"><ClipboardList className="mr-1 inline h-4 w-4" aria-hidden />{error}</p>}
    </Modal>
  );
}

function ExceptionModal({ open, onClose, onSave, busy }: { open: boolean; onClose: () => void; onSave: (b: { type: string; severity: string; detail: string }) => void; busy: boolean }) {
  const [f, setF] = useState({ type: "ADDRESS_PROBLEM", severity: "MEDIUM", detail: "" });
  return (
    <Modal open={open} onClose={onClose} title="Report an exception" footer={<><button className="btn-ghost" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy || f.detail.trim().length < 3} onClick={() => onSave(f)}>Report</button></>}>
      <div className="grid gap-4">
        <Field label="What happened" htmlFor="x-type"><select id="x-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={inputCls}>{Object.entries(EXCEPTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Severity" htmlFor="x-sev"><select id="x-sev" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })} className={inputCls}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></Field>
        <Field label="Details" htmlFor="x-detail"><textarea id="x-detail" rows={3} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} className={inputCls} /></Field>
      </div>
    </Modal>
  );
}
