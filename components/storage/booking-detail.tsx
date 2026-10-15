"use client";

/**
 * One storage booking: summary, intake (bag count, piece tags, bay per piece, condition photos),
 * extension (capacity re-checked), release with the authorized person + proof, and cancellation.
 * Writes the chain of custody on the linked order (Master §7.5).
 */
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, Camera, CheckCircle2, Clock3, LogOut, PackageCheck, X } from "lucide-react";
import { AdminTitle, Panel } from "@/components/admin/admin-shell";
import { api, API_URL, money, type ApiError } from "@/components/admin/api";
import { ConfirmButton, Field, inputCls } from "@/components/admin/ui";
import { ErrorNote, fromZonedInput, useApi, zonedInput } from "@/components/resources/shared";
import { COMBO_LABEL, miami, StorageStatus } from "./storage-admin";

type Piece = { id: string; pieceId: string; category: string; description: string | null; storageBay: string | null; custodyLocation: string | null; status: string };
type Detail = {
  booking: {
    id: string; reference: string; status: string; startsAt: string; endsAt: string; pieces: number; retailCents: number | null; withPickup: boolean; withDelivery: boolean; checkedInAt: string | null; releasedAt: string | null;
    location: { name: string; code: string; addressPrivate: string | null };
    order: { id: string; reference: string; status: string; customer: { name: string; email: string; phone: string | null }; pieces: Piece[] } | null;
  };
  meta: {
    combination: string; contactName: string | null; contactEmail: string | null; contactPhone: string | null; notes: string | null; pieceTags: string[]; bays: Record<string, string> | null;
    intakeCount: number | null; intakeNotes: string | null; intakeUploadIds: string[]; checkedInBy: string | null; releasedTo: string | null; releaseCount: number | null; releaseUploadIds: string[]; releasedBy: string | null;
    extensions: { at: string; previousEnd: string; newEnd: string; extraCents: number; by: string; note: string | null }[] | null; overstayCents: number; cancelReason: string | null;
    pricing: { retailCents: number; costCents: number; marginPercent: number; lines: { label: string; cents: number }[] } | null;
  } | null;
  uploads: { id: string; originalName: string; mimeType: string }[];
  overstayHours: number;
};

const fileSrc = (bookingId: string, uploadId: string) => `${API_URL}/v1/admin/storage/bookings/${bookingId}/files/${uploadId}`;

async function uploadPhoto(bookingId: string, file: File, kind = "storage-photo") {
  const fd = new FormData();
  fd.append("kind", kind);
  fd.append("file", file);
  const res = await fetch(`${API_URL}/v1/admin/storage/bookings/${bookingId}/uploads`, { method: "POST", body: fd, credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.id as string;
}

export function StorageBookingDetail({ id }: { id: string }) {
  const { data, error, reload } = useApi<Detail>(`/storage/bookings/${id}`);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const { booking: b, meta } = data;
  const contact = b.order ? b.order.customer : { name: meta?.contactName ?? "-", email: meta?.contactEmail ?? "", phone: meta?.contactPhone ?? null };
  const active = ["RESERVED", "CHECKED_IN", "OVERSTAY"].includes(b.status);

  return (
    <>
      <Link href="/admin/storage?tab=bookings" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-ink hover:text-navy"><ArrowLeft className="h-4 w-4" aria-hidden /> Storage bookings</Link>
      <AdminTitle title={`Storage ${b.reference}`} sub={`${COMBO_LABEL[meta?.combination ?? ""] ?? "Storage"} · ${b.location.name}`} actions={<StorageStatus status={b.status} />} />
      {data.overstayHours > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800" role="alert"><Clock3 className="h-4 w-4" aria-hidden /> {data.overstayHours} hours past the booked retrieval. Extend the booking or release the luggage; late rules apply at release.</p>
      )}
      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {b.status === "RESERVED" && <CheckInPanel data={data} onDone={reload} />}
          {(b.status === "CHECKED_IN" || b.status === "OVERSTAY") && <ReleasePanel data={data} onDone={reload} />}
          {b.order && (
            <Panel title={`Pieces on order ${b.order.reference}`} action={<Link className="text-sm font-semibold text-orange-700 hover:underline" href={`/admin/orders/${b.order.id}`}>Open order</Link>}>
              <ul className="divide-y divide-line text-sm">
                {b.order.pieces.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span><span className="font-mono text-xs font-semibold text-navy">{p.pieceId}</span> <span className="text-slate-ink">{p.description ?? p.category}</span></span>
                    <span className="text-xs text-muted">{p.storageBay ? `Bay ${p.storageBay}` : p.custodyLocation ?? "Not checked in"}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {(meta?.intakeCount || meta?.releasedTo) && (
            <Panel title="Chain of custody">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {meta?.intakeCount != null && <Item label="Checked in">{meta.intakeCount} piece(s){b.checkedInAt ? ` · ${miami(b.checkedInAt)}` : ""}{meta.checkedInBy ? ` · ${meta.checkedInBy}` : ""}</Item>}
                {meta?.intakeNotes && <Item label="Condition at intake">{meta.intakeNotes}</Item>}
                {meta?.pieceTags?.length ? <Item label="Tags recorded">{meta.pieceTags.map((t) => `${t}${meta.bays?.[t] ? ` (bay ${meta.bays[t]})` : ""}`).join(", ")}</Item> : null}
                {meta?.releasedTo && <Item label="Released to">{meta.releasedTo} · {meta.releaseCount} piece(s){b.releasedAt ? ` · ${miami(b.releasedAt)}` : ""}{meta.releasedBy ? ` · by ${meta.releasedBy}` : ""}</Item>}
                {meta && meta.overstayCents > 0 && <Item label="Overstay charge">{money(meta.overstayCents)}</Item>}
              </dl>
              <Photos bookingId={b.id} ids={[...(meta?.intakeUploadIds ?? []), ...(meta?.releaseUploadIds ?? [])]} uploads={data.uploads} />
            </Panel>
          )}
        </div>
        <div className="min-w-0 space-y-6">
          <Panel title="Booking">
            <dl className="space-y-3 text-sm">
              <Item label="Customer">{contact.name}<span className="block text-xs text-muted">{contact.email}{contact.phone ? ` · ${contact.phone}` : ""}</span></Item>
              <Item label="Drop-off / intake">{miami(b.startsAt)}</Item>
              <Item label="Retrieval / release">{miami(b.endsAt)}</Item>
              <Item label="Pieces reserved">{b.pieces}</Item>
              <Item label="Transport">{b.withPickup ? "Pickup to storage" : "Customer drop-off"} · {b.withDelivery ? "delivery from storage" : meta?.combination === "storage-shipping" ? "then nationwide shipping" : "customer collects"}</Item>
              <Item label="Location (private)">{b.location.name}{b.location.addressPrivate ? <span className="block text-xs text-muted">{b.location.addressPrivate}</span> : null}</Item>
              {meta?.notes && <Item label="Notes">{meta.notes}</Item>}
            </dl>
          </Panel>
          <Panel title="Price (internal)">
            <p className="font-display text-2xl font-bold text-navy">{money(b.retailCents)}</p>
            {meta?.pricing && <p className="text-xs text-muted">Est. cost {money(meta.pricing.costCents)} · margin {meta.pricing.marginPercent}%</p>}
            {meta?.pricing?.lines?.length ? (
              <ul className="mt-3 space-y-1 text-xs text-slate-ink">{meta.pricing.lines.map((l, i) => <li key={i} className="flex justify-between gap-2"><span>{l.label}</span><span>{money(l.cents)}</span></li>)}</ul>
            ) : null}
            {meta?.extensions?.length ? <p className="mt-3 text-xs text-muted">{meta.extensions.length} extension(s), last to {miami(meta.extensions[meta.extensions.length - 1].newEnd)}</p> : null}
          </Panel>
          {active && <ExtendPanel id={b.id} endsAt={b.endsAt} onDone={reload} />}
          {b.status === "RESERVED" && <CancelPanel id={b.id} onDone={reload} />}
          {meta?.cancelReason && <Panel title="Cancelled"><p className="text-sm text-slate-ink">{meta.cancelReason}</p></Panel>}
        </div>
      </div>
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 text-charcoal">{children}</dd>
    </div>
  );
}

function Photos({ bookingId, ids, uploads }: { bookingId: string; ids: string[]; uploads: Detail["uploads"] }) {
  if (!ids.length) return null;
  return (
    <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
      {ids.map((u) => {
        const meta = uploads.find((x) => x.id === u);
        return (
          <li key={u}>
            <a href={fileSrc(bookingId, u)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line bg-cloud">
              {meta?.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileSrc(bookingId, u)} alt={meta.originalName} className="aspect-square w-full object-cover" />
              ) : (
                <span className="flex aspect-square items-center justify-center p-2 text-center text-xs text-slate-ink">{meta?.originalName ?? "File"}</span>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Photo picker that uploads immediately and returns the ids. */
function PhotoPicker({ bookingId, ids, setIds, label }: { bookingId: string; ids: string[]; setIds: (v: string[]) => void; label: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setErr(null);
    try {
      const next = [...ids];
      for (const f of Array.from(files)) next.push(await uploadPhoto(bookingId, f));
      setIds(next);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <label className="btn-ghost inline-flex cursor-pointer !px-4 !py-2">
        <Camera className="h-4 w-4" aria-hidden /> {busy ? "Uploading…" : label}
        <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
      </label>
      {ids.length > 0 && <p className="mt-2 text-xs text-slate-ink">{ids.length} photo(s) attached</p>}
      {err && <p className="mt-2 text-xs text-rose-700" role="alert">{err}</p>}
    </div>
  );
}

function CheckInPanel({ data, onDone }: { data: Detail; onDone: () => void }) {
  const b = data.booking;
  const orderPieces = b.order?.pieces ?? [];
  const [count, setCount] = useState(String(orderPieces.length || b.pieces));
  const [tags, setTags] = useState<Record<string, { checked: boolean; bay: string }>>(Object.fromEntries(orderPieces.map((p) => [p.pieceId, { checked: true, bay: "" }])));
  const [freeTags, setFreeTags] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const picked = Object.entries(tags).filter(([, v]) => v.checked);
    const standalone = freeTags.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
    try {
      await api(`/storage/bookings/${b.id}/check-in`, {
        method: "POST",
        json: {
          pieceCount: Number(count),
          tags: orderPieces.length ? picked.map(([t]) => t) : standalone,
          bays: Object.fromEntries(picked.filter(([, v]) => v.bay).map(([t, v]) => [t, v.bay])),
          conditionNotes: notes,
          uploadIds: photos,
        },
      });
      onDone();
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  };
  return (
    <Panel title="Intake: check luggage in">
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote message={error} />
        <p className="text-sm text-slate-ink">Count every bag, confirm each tag and record the bay. Photograph any existing damage before storing (Express Care Standard).</p>
        <Field label="Bag count received" htmlFor="ci-count"><input id="ci-count" type="number" min={1} max={b.pieces} required className={`${inputCls} max-w-[10rem]`} value={count} onChange={(e) => setCount(e.target.value)} /></Field>
        {orderPieces.length > 0 ? (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-navy">Piece tags and storage bays</legend>
            <ul className="space-y-2">
              {orderPieces.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-[#E06010]" checked={tags[p.pieceId]?.checked ?? false} onChange={(e) => setTags((t) => ({ ...t, [p.pieceId]: { ...t[p.pieceId], checked: e.target.checked } }))} />
                    <span className="font-mono text-xs font-semibold text-navy">{p.pieceId}</span>
                    <span className="truncate text-slate-ink">{p.description ?? p.category}</span>
                  </label>
                  <label className="sr-only" htmlFor={`bay-${p.id}`}>Bay for {p.pieceId}</label>
                  <input id={`bay-${p.id}`} placeholder="Bay, e.g. B-04" className={`${inputCls} !w-32 !py-1.5`} value={tags[p.pieceId]?.bay ?? ""} onChange={(e) => setTags((t) => ({ ...t, [p.pieceId]: { ...t[p.pieceId], bay: e.target.value } }))} />
                </li>
              ))}
            </ul>
          </fieldset>
        ) : (
          <Field label="Tag codes (optional)" htmlFor="ci-tags" hint="Bag tag numbers, separated by commas or spaces"><input id="ci-tags" className={inputCls} value={freeTags} onChange={(e) => setFreeTags(e.target.value)} /></Field>
        )}
        <Field label="Condition notes" htmlFor="ci-notes" hint="Scuffs, broken wheels, open zips… noted before storage"><textarea id="ci-notes" rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <PhotoPicker bookingId={b.id} ids={photos} setIds={setPhotos} label="Add condition photos" />
        <button className="btn-primary" disabled={busy}><PackageCheck className="h-4 w-4" aria-hidden /> {busy ? "Saving…" : "Confirm intake"}</button>
      </form>
    </Panel>
  );
}

function ReleasePanel({ data, onDone }: { data: Detail; onDone: () => void }) {
  const b = data.booking;
  const [releasedTo, setReleasedTo] = useState(b.order?.customer.name ?? data.meta?.contactName ?? "");
  const [count, setCount] = useState(String(data.meta?.intakeCount ?? b.pieces));
  const [mode, setMode] = useState<"customer" | "driver" | "carrier">(b.withDelivery ? "driver" : data.meta?.combination === "storage-shipping" ? "carrier" : "customer");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ overstayCents: number }>(`/storage/bookings/${b.id}/release`, { method: "POST", json: { releasedTo, pieceCount: Number(count), mode, notes, uploadIds: photos } });
      setDone(r.overstayCents);
      onDone();
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  };
  if (done !== null) return <Panel title="Released"><p className="flex items-center gap-2 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden /> Release recorded{done ? `, overstay charge ${money(done)}` : ""}.</p></Panel>;
  return (
    <Panel title="Release / retrieval">
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote message={error} />
        <p className="text-sm text-slate-ink">Release only to the authorized person, re-count at handoff and note any difference.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Released to (authorized person)" htmlFor="rl-to"><input id="rl-to" required className={inputCls} value={releasedTo} onChange={(e) => setReleasedTo(e.target.value)} /></Field>
          <Field label="Bag count released" htmlFor="rl-count" hint={data.meta?.intakeCount ? `${data.meta.intakeCount} checked in` : undefined}><input id="rl-count" type="number" min={1} required className={inputCls} value={count} onChange={(e) => setCount(e.target.value)} /></Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-navy">Handed to</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {([["customer", "Customer / authorized person"], ["driver", "Express Bags driver (delivery)"], ["carrier", "Carrier (nationwide shipping)"]] as const).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === v} onChange={() => setMode(v)} className="accent-[#E06010]" /> {l}</label>
            ))}
          </div>
        </fieldset>
        <Field label="Notes" htmlFor="rl-notes" hint="Required when the count differs from intake"><textarea id="rl-notes" rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <PhotoPicker bookingId={b.id} ids={photos} setIds={setPhotos} label="Add release photos" />
        <button className="btn-primary" disabled={busy}><LogOut className="h-4 w-4" aria-hidden /> {busy ? "Saving…" : "Confirm release"}</button>
      </form>
    </Panel>
  );
}

function ExtendPanel({ id, endsAt, onDone }: { id: string; endsAt: string; onDone: () => void }) {
  const [value, setValue] = useState(zonedInput(new Date(new Date(endsAt).getTime() + 24 * 3_600_000)));
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ extraCents: number }>(`/storage/bookings/${id}/extend`, { method: "POST", json: { endsAt: fromZonedInput(value) } });
      setMsg(`Extended. Additional charge ${money(r.extraCents)}.`);
      onDone();
    } catch (err) {
      setError((err as ApiError).message);
    }
  };
  return (
    <Panel title="Extend storage">
      <form onSubmit={submit} className="space-y-3">
        <ErrorNote message={error} />
        {msg && <p className="text-sm text-emerald-800" role="status">{msg}</p>}
        <Field label="New retrieval (Miami time)" htmlFor="ex-end"><input id="ex-end" type="datetime-local" className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <button className="btn-navy !px-4 !py-2">Check space & extend</button>
      </form>
    </Panel>
  );
}

function CancelPanel({ id, onDone }: { id: string; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cancel = async () => {
    setError(null);
    try {
      await api(`/storage/bookings/${id}/cancel`, { method: "POST", json: { reason } });
      onDone();
    } catch (err) {
      setError((err as ApiError).message);
    }
  };
  return (
    <Panel title="Cancel booking">
      <ErrorNote message={error} />
      <Field label="Reason" htmlFor="cx-reason"><input id="cx-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="mt-3"><ConfirmButton onConfirm={cancel} className="btn-ghost !px-4 !py-2"><X className="h-4 w-4" aria-hidden /> Cancel booking</ConfirmButton></div>
    </Panel>
  );
}
