"use client";

/**
 * Orders list (filters + search) and order detail: route, schedule, pieces, customer-visible timeline,
 * proof of delivery, assigned driver (first name only, after assignment), carrier tracking numbers
 * (labeled separately from the Express Bags reference), documents and "Book this again".
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Download, FileUp, ImageIcon, MapPin, Phone, RotateCcw, Search, Truck } from "lucide-react";
import { LUGGAGE_CATEGORY_LABELS } from "@/lib/quote-schema";
import { dateOnly, dateTime, fileUrl, money, placeLabel, portal } from "./api";
import { serviceName } from "./dashboard";
import { Alert, Card, Empty, input, Loading, PageTitle, StatusPill } from "./ui";

type OrderRow = { id: string; reference: string; status: string; statusLabel: string; serviceType: string; serviceDate: string; timeWindow: string | null; pickup: unknown; delivery: unknown; guestName: string | null; poNumber: string | null; pieceCount: number };

const FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export function OrdersList() {
  const params = useSearchParams();
  const router = useRouter();
  const status = (params.get("status") as (typeof FILTERS)[number]["value"]) || "all";
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    const qs = new URLSearchParams({ status, ...(params.get("search") ? { search: params.get("search")! } : {}) });
    portal<{ orders: OrderRow[] }>(`/orders?${qs}`).then((r) => setRows(r.orders)).catch((e) => setError(e.message));
  }, [status, params]);

  const go = (s: string, q = search) => router.replace(`/account/orders?${new URLSearchParams({ status: s, ...(q ? { search: q } : {}) })}`);

  return (
    <div>
      <PageTitle title="Orders & tracking" sub="Every booking with its live status, proof of delivery and documents." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Filter orders" className="flex gap-1 rounded-full border border-line bg-white p-1">
          {FILTERS.map((f) => (
            <button key={f.value} role="tab" aria-selected={status === f.value} onClick={() => go(f.value)} className={`rounded-full px-4 py-1.5 text-sm font-medium ${status === f.value ? "bg-navy text-white" : "text-slate-ink hover:bg-cloud"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); go(status); }} className="flex min-w-[14rem] flex-1 items-center gap-2" role="search">
          <label htmlFor="order-search" className="sr-only">Search orders</label>
          <input id="order-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Reference, guest or PO number" className={`${input} !py-2.5`} />
          <button className="btn-ghost !px-4" aria-label="Search"><Search className="h-4 w-4" /></button>
        </form>
      </div>
      {error && <Alert>{error}</Alert>}
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && <Empty title="No orders here yet" text="Confirmed bookings appear here with every handoff recorded." href="/request-a-quote" cta="Request a Quote" />}
      {rows && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={`/account/orders/${o.id}`} className="group grid gap-3 rounded-[1.25rem] border border-line bg-white p-5 shadow-[var(--shadow-card)] transition hover:border-orange/40 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-navy">{o.reference}</span>
                    <StatusPill status={o.status} label={o.statusLabel} />
                    {o.poNumber && <span className="text-xs text-muted">PO {o.poNumber}</span>}
                  </div>
                  <p className="mt-2 truncate text-sm text-charcoal">{placeLabel(o.pickup)} <span className="text-orange">→</span> {placeLabel(o.delivery)}</p>
                  <p className="mt-0.5 text-xs text-muted">{serviceName(o.serviceType)} · {dateOnly(o.serviceDate)} · {o.pieceCount} {o.pieceCount === 1 ? "piece" : "pieces"}{o.guestName ? ` · Guest ${o.guestName}` : ""}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-orange-700">Details <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------- Detail -------------------------------- */
type Detail = {
  order: { id: string; reference: string; status: string; statusLabel: string; serviceType: string; pickup: unknown; delivery: unknown; extraStops: unknown; serviceDate: string; timeWindow: string | null; specialHandling: string | null; accessNotes: string | null; customerNotes: string | null; poNumber: string | null; costCenter: string | null; guestName: string | null; guestRoom: string | null; retailCents: number | null; depositCents: number | null; paymentStatus: string; completedAt: string | null };
  pieces: { id: string; pieceId: string; category: string; description: string | null; status: string }[];
  timeline: { id: string; label: string | null; detail: string | null; createdAt: string; uploadIds: string[] }[];
  proofs: { id: string; kind: string; pieceCount: number; recipientName: string | null; signatureUploadId: string | null; photoUploadIds: string[]; conditionNotes: string | null; capturedAt: string }[];
  carrierTracking: { id: string; carrier: string; ebServiceLevel: string; trackingNumber: string | null; status: string }[];
  driver: { firstName: string; contactVia: string; phoneHref: string } | null;
  documents: { id: string; title: string; uploadId: string; createdAt: string }[];
};

const PROOF_LABEL: Record<string, string> = { PICKUP: "Proof of pickup", DELIVERY: "Proof of delivery", RELEASE: "Release from storage", CARRIER_HANDOFF: "Handoff to carrier" };
const catLabel = (c: string) => (LUGGAGE_CATEGORY_LABELS as Record<string, string>)[c]?.split(" (")[0] ?? (c === "cargo" ? "Cargo item" : c);

export function OrderDetail({ id }: { id: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const load = () => portal<Detail>(`/orders/${id}`).then(setD).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <Alert>{error}</Alert>;
  if (!d) return <Loading />;
  const o = d.order;
  const file = (uploadId: string, download = false) => fileUrl(`/orders/${o.id}/files/${uploadId}${download ? "?download=1" : ""}`);

  const upload = async (form: HTMLFormElement) => {
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData(form);
      fd.set("orderId", o.id);
      await portal("/documents", { method: "POST", body: fd });
      form.reset();
      setUploadMsg("Document added to this order.");
      await load();
    } catch (e) {
      setUploadMsg((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/account/orders" className="text-sm font-semibold text-orange-700 hover:underline">← All orders</Link>
          <h1 className="mt-2 font-mono text-3xl font-extrabold">{o.reference}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-ink">
            <StatusPill status={o.status} label={o.statusLabel} />
            <span>{serviceName(o.serviceType)}</span>
            <span>· {dateOnly(o.serviceDate)}{o.timeWindow ? ` · ${o.timeWindow.replace("-", " ")}` : ""}</span>
          </div>
        </div>
        <Link href={`/request-a-quote?repeat=${o.id}`} className="btn-primary"><RotateCcw className="h-4 w-4" aria-hidden /> Book this again</Link>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Route" className="xl:col-span-2">
          <ol className="relative space-y-5 border-l-2 border-dashed border-orange/50 pl-6">
            {[{ label: "Pickup", place: o.pickup }, ...(Array.isArray(o.extraStops) ? (o.extraStops as unknown[]).map((s, i) => ({ label: `Stop ${i + 1}`, place: s })) : []), { label: "Delivery", place: o.delivery }].map((s) => (
              <li key={s.label} className="relative">
                <span className="absolute -left-[33px] top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white ring-2 ring-orange"><MapPin className="h-3 w-3 text-orange" aria-hidden /></span>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{s.label}</p>
                <p className="mt-0.5 font-medium text-navy">{placeLabel(s.place)}</p>
              </li>
            ))}
          </ol>
          <dl className="mt-6 grid gap-x-6 gap-y-3 border-t border-line pt-5 text-sm sm:grid-cols-2">
            {o.guestName && <Item label="Guest" value={`${o.guestName}${o.guestRoom ? `, room ${o.guestRoom}` : ""}`} />}
            {o.poNumber && <Item label="PO number" value={o.poNumber} />}
            {o.costCenter && <Item label="Cost center" value={o.costCenter} />}
            {o.retailCents !== null && <Item label="Order total" value={money(o.retailCents)} />}
            {o.specialHandling && <Item label="Special handling" value={o.specialHandling} />}
            {o.accessNotes && <Item label="Access notes" value={o.accessNotes} />}
          </dl>
        </Card>

        <div className="space-y-6">
          <Card title="Your driver">
            {d.driver ? (
              <div>
                <p className="flex items-center gap-2 text-lg font-bold text-navy"><Truck className="h-5 w-5 text-orange" aria-hidden /> {d.driver.firstName}</p>
                <p className="mt-2 text-sm text-slate-ink">For changes or questions about this job, contact {d.driver.contactVia}.</p>
                <a href={d.driver.phoneHref} className="btn-ghost mt-4 !py-2"><Phone className="h-4 w-4" aria-hidden /> Call dispatch</a>
              </div>
            ) : (
              <p className="text-sm text-slate-ink">Your driver&apos;s name appears here once dispatch assigns your job.</p>
            )}
          </Card>
          {d.carrierTracking.length > 0 && (
            <Card title="Carrier tracking">
              <p className="mb-3 text-xs text-muted">These carrier numbers are separate from your Express Bags reference {o.reference}.</p>
              <ul className="space-y-2 text-sm">
                {d.carrierTracking.map((s) => (
                  <li key={s.id} className="rounded-xl bg-cloud px-3 py-2">
                    <span className="font-semibold text-navy">{s.carrier}</span> · <span className="font-mono">{s.trackingNumber ?? "label pending"}</span>
                    <span className="block text-xs text-muted">{s.ebServiceLevel} service · {s.status.replace(/_/g, " ").toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Timeline" className="xl:col-span-2">
          {d.timeline.length === 0 ? <p className="text-sm text-slate-ink">No updates yet.</p> : (
            <ol className="space-y-4">
              {[...d.timeline].reverse().map((e, i) => (
                <li key={e.id} className="flex gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${i === 0 ? "bg-orange ring-4 ring-orange-100" : "bg-navy/30"}`} aria-hidden />
                  <div>
                    <p className="font-semibold text-navy">{e.label ?? e.detail}</p>
                    {e.label && e.detail && e.detail !== e.label && <p className="text-sm text-slate-ink">{e.detail}</p>}
                    <p className="text-xs text-muted">{dateTime(e.createdAt)}</p>
                    {e.uploadIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {e.uploadIds.map((u) => <a key={u} href={file(u)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-cloud px-3 py-1 text-xs font-semibold text-navy hover:bg-navy-50"><ImageIcon className="h-3.5 w-3.5" aria-hidden /> Photo</a>)}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title={`Pieces (${d.pieces.length})`}>
          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1 text-sm">
            {d.pieces.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-cloud px-3 py-2">
                <span><span className="font-mono text-xs font-semibold text-navy">{p.pieceId}</span><span className="block text-xs text-slate-ink">{catLabel(p.category)}{p.description ? ` · ${p.description}` : ""}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Proof of pickup & delivery">
        {d.proofs.length === 0 ? <p className="text-sm text-slate-ink">Proof of pickup and delivery (count, recipient, time, signature or photo) is recorded here at each handoff.</p> : (
          <ul className="grid gap-4 md:grid-cols-2">
            {d.proofs.map((p) => (
              <li key={p.id} className="rounded-2xl border border-line p-4">
                <p className="font-semibold text-navy">{PROOF_LABEL[p.kind] ?? p.kind}</p>
                <p className="text-sm text-slate-ink">{dateTime(p.capturedAt)} · {p.pieceCount} pieces{p.recipientName ? ` · received by ${p.recipientName}` : ""}</p>
                {p.conditionNotes && <p className="mt-1 text-xs text-muted">Notes: {p.conditionNotes}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.signatureUploadId && <a href={file(p.signatureUploadId)} target="_blank" rel="noreferrer" className="btn-ghost !py-1.5 !text-xs">Signature</a>}
                  {p.photoUploadIds.map((u, i) => <a key={u} href={file(u)} target="_blank" rel="noreferrer" className="btn-ghost !py-1.5 !text-xs">Photo {i + 1}</a>)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Documents for this order">
        {d.documents.length > 0 && (
          <ul className="mb-4 divide-y divide-line text-sm">
            {d.documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="font-medium text-navy">{doc.title} <span className="text-xs font-normal text-muted">· {dateOnly(doc.createdAt)}</span></span>
                <a href={fileUrl(`/documents/${doc.id}/file`)} className="inline-flex items-center gap-1 text-sm font-semibold text-orange-700 hover:underline"><Download className="h-4 w-4" aria-hidden /> Download</a>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={(e) => { e.preventDefault(); upload(e.currentTarget); }} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="doc-title" className="mb-1.5 block text-sm font-semibold text-navy">Title</label>
            <input id="doc-title" name="title" placeholder="e.g. Group manifest" className={input} />
          </div>
          <div>
            <label htmlFor="doc-file" className="mb-1.5 block text-sm font-semibold text-navy">File</label>
            <input id="doc-file" name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv" className="block w-full text-sm text-slate-ink file:mr-3 file:rounded-full file:border-0 file:bg-navy file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" />
          </div>
          <button disabled={uploading} className="btn-navy"><FileUp className="h-4 w-4" aria-hidden /> {uploading ? "Uploading…" : "Upload"}</button>
        </form>
        {uploadMsg && <p className="mt-3 text-sm text-slate-ink" role="status">{uploadMsg}</p>}
      </Card>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 text-charcoal">{value}</dd>
    </div>
  );
}
