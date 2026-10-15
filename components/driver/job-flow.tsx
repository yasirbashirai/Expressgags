"use client";

/**
 * The driver's guided job flow, following the Express Care Standard (form C4) and the job walkthrough
 * (form Q9 steps 6–8):
 *   Accept → En route → pickup checklist → scan every piece → condition photos → proof of pickup
 *   → (facility / storage bay · carrier handoff · out for delivery) → re-scan → recipient + signature
 *   → proof of delivery.
 * A problem can be reported at any step (count mismatch, damage, address…). Every action goes through
 * the offline queue, so a dead zone at a cruise terminal never loses a scan, photo or signature.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Camera, Check, CheckCircle2, ChevronDown, Clock, Crown, Flag, MapPin, Navigation, Package, Phone, PlaneTakeoff, ShieldCheck, Truck, Warehouse, X,
} from "lucide-react";
import { CATEGORY_LABEL, DriverApiError, driverFetch, mapsLinks, offlineCache, telHref, WINDOW_LABEL, type JobDetail, type Stop } from "./api";
import { compressImage, getPosition, vibrate, type Position } from "./media";
import { Scanner } from "./scanner";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";
import { StatusChip } from "./status-chip";
import { useDriverSync, type RunOutcome } from "./sync-provider";

type Stage = "PICKUP" | "FACILITY" | "DELIVERY";
type Photo = { ref: string; url: string };
type Toast = { tone: "ok" | "warn" | "error"; text: string } | null;

const EXCEPTION_TYPES: { value: string; label: string }[] = [
  { value: "COUNT_MISMATCH", label: "Bag count does not match" },
  { value: "DAMAGE", label: "Item damaged" },
  { value: "LATE_PICKUP", label: "Running late / customer not ready" },
  { value: "ADDRESS_PROBLEM", label: "Address or access problem" },
  { value: "OVERSIZED_ITEM", label: "Oversized or unexpected item" },
  { value: "DESTINATION_CHANGE", label: "Customer changed destination" },
  { value: "DELIVERY_FAILED", label: "Delivery attempt failed" },
  { value: "CARRIER_DELAY", label: "Carrier delay" },
  { value: "CAPACITY", label: "Vehicle full / capacity" },
  { value: "OTHER", label: "Something else" },
];

/** Same normalization as the server: pull the piece ID out of whatever the camera decoded. */
const normalize = (raw: string) => {
  const s = raw.trim().toUpperCase();
  return s.match(/EB-\d{6}-[A-Z0-9]{4}-\d{2,3}/)?.[0] ?? s;
};

export function JobFlow({ orderId }: { orderId: string }) {
  const sync = useDriverSync();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [localScans, setLocalScans] = useState<Record<Stage, string[]>>({ PICKUP: [], FACILITY: [], DELIVERY: [] });
  const [statusOverride, setStatusOverride] = useState<{ status: string; label: string } | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [checklist, setChecklist] = useState({ instructions: false, count: false, contact: false });
  const [pickupPhotos, setPickupPhotos] = useState<Photo[]>([]);
  const [deliveryPhotos, setDeliveryPhotos] = useState<Photo[]>([]);
  const [conditionNotes, setConditionNotes] = useState("");
  const [recipient, setRecipient] = useState("");
  const [cannotSign, setCannotSign] = useState(false);
  const [signed, setSigned] = useState(false);
  const [mismatchReported, setMismatchReported] = useState(false);
  const [modal, setModal] = useState<null | "exception" | "carrier" | "facility">(null);
  const pos = useRef<Position>(null);
  const sig = useRef<SignaturePadHandle>(null);

  const load = useCallback(async () => {
    try {
      const res = await driverFetch<{ job: JobDetail }>(`/v1/driver/jobs/${orderId}`);
      setJob(res.job);
      setStale(false);
      setStatusOverride(null);
      setMismatchReported(res.job.exceptions.some((e) => e.type === "COUNT_MISMATCH" && e.status !== "RESOLVED"));
      offlineCache.set(`job:${orderId}`, res.job);
    } catch (e) {
      const cached = offlineCache.get<JobDetail>(`job:${orderId}`);
      if ((e as DriverApiError).status === 0 && cached) {
        setJob(cached);
        setStale(true);
      } else setLoadError((e as Error).message);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
    void getPosition().then((p) => (pos.current = p));
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const refreshPosition = () => void getPosition(3000).then((p) => p && (pos.current = p));
  const geo = () => (pos.current ? { lat: pos.current.lat, lng: pos.current.lng } : {});

  /** Interpret a queue outcome for the driver, reload server state when the action went through. */
  const handle = useCallback(
    async (outcome: RunOutcome, okText: string, queuedText = "Saved on this phone. It will sync when you have signal.") => {
      if (outcome.state === "sent") {
        setToast({ tone: "ok", text: okText });
        await load();
        return true;
      }
      if (outcome.state === "queued") {
        setToast({ tone: "warn", text: queuedText });
        return true;
      }
      vibrate([80, 60, 80]);
      setToast({ tone: "error", text: outcome.error });
      return false;
    },
    [load],
  );

  const status = statusOverride?.status ?? job?.status ?? "";
  const statusLabel = statusOverride?.label ?? job?.statusLabel ?? "";
  const scans = useMemo(() => {
    const merge = (s: Stage) => Array.from(new Set([...(job?.scans[s] ?? []), ...localScans[s]]));
    return { PICKUP: merge("PICKUP"), FACILITY: merge("FACILITY"), DELIVERY: merge("DELIVERY") };
  }, [job, localScans]);

  if (loadError) {
    return (
      <div className="rounded-3xl bg-white p-6 text-center">
        <h1 className="font-display text-lg font-bold text-navy">Job unavailable</h1>
        <p className="mt-2 text-sm text-slate-ink">{loadError}</p>
        <Link href="/driver" className="mt-5 inline-flex min-h-12 items-center rounded-full bg-navy px-6 font-bold text-white">Back to my jobs</Link>
      </div>
    );
  }
  if (!job) return <div className="h-96 animate-pulse rounded-3xl bg-white" aria-busy="true" aria-label="Loading job" />;

  const total = job.pieces.length;
  const pieceIds = new Set(job.pieces.map((p) => p.pieceId));
  const assignmentAccepted = accepted || job.assignment.status !== "ASSIGNED";

  // ---------------- actions ----------------

  const setStatus = async (to: string, label: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    refreshPosition();
    const outcome = await sync.runJson({ orderId, label: `Status: ${label}`, path: `/v1/driver/jobs/${orderId}/status`, body: { to, ...extra, ...geo() } });
    if (outcome.state === "queued") setStatusOverride({ status: to, label });
    await handle(outcome, label);
    setBusy(false);
  };

  const accept = async () => {
    setBusy(true);
    const outcome = await sync.runJson({ orderId, label: "Accept job", path: `/v1/driver/jobs/${orderId}/accept`, body: {} });
    if (outcome.state !== "failed") setAccepted(true);
    await handle(outcome, "Job accepted");
    setBusy(false);
  };

  const scan = async (stage: Stage, raw: string) => {
    const code = normalize(raw);
    if (!pieceIds.has(code)) {
      vibrate([120, 80, 120]);
      setToast({ tone: "error", text: `${code} is not part of this order. Check the tag, or report a count mismatch.` });
      return;
    }
    if (scans[stage].includes(code)) {
      setToast({ tone: "warn", text: `${code} is already scanned.` });
      return;
    }
    vibrate(40);
    setLocalScans((s) => ({ ...s, [stage]: [...s[stage], code] }));
    refreshPosition();
    const outcome = await sync.runJson({ orderId, label: `Scan ${code}`, path: `/v1/driver/jobs/${orderId}/scan`, body: { code, stage, ...geo() } });
    if (outcome.state === "failed") {
      setLocalScans((s) => ({ ...s, [stage]: s[stage].filter((c) => c !== code) }));
      setToast({ tone: "error", text: outcome.error });
    } else {
      const n = scans[stage].length + 1;
      setToast({ tone: "ok", text: `${code} scanned · ${Math.min(n, total)} of ${total}` });
    }
  };

  const addPhotos = async (files: FileList | null, which: "pickup" | "delivery" | "exception", onAdd?: (p: Photo) => void) => {
    if (!files?.length) return;
    setBusy(true);
    for (const f of Array.from(files).slice(0, 8)) {
      const blob = await compressImage(f);
      const outcome = await sync.runUpload({
        orderId,
        label: "Photo",
        path: `/v1/driver/jobs/${orderId}/upload`,
        file: blob,
        // Extension must match the real type (compression may keep the original PNG/HEIC)
        filename: (f.name || "photo").replace(/\.\w+$/, "") + (blob.type === "image/jpeg" ? ".jpg" : blob.type === "image/png" ? ".png" : blob.type === "image/webp" ? ".webp" : (f.name.match(/\.\w+$/)?.[0] ?? ".jpg")),
        fields: { kind: "order-photo", caption: which === "pickup" ? "Pickup condition photo" : which === "delivery" ? "Delivery photo" : "Exception photo" },
      });
      if (outcome.state === "failed") {
        setToast({ tone: "error", text: outcome.error });
        continue;
      }
      const photo = { ref: outcome.ref, url: URL.createObjectURL(blob) };
      if (which === "pickup") setPickupPhotos((p) => [...p, photo]);
      else if (which === "delivery") setDeliveryPhotos((p) => [...p, photo]);
      onAdd?.(photo);
    }
    setBusy(false);
  };

  const confirmPickup = async () => {
    setBusy(true);
    refreshPosition();
    const outcome = await sync.runJson({
      orderId,
      label: "Proof of pickup",
      path: `/v1/driver/jobs/${orderId}/proof`,
      body: { kind: "PICKUP", photoUploadIds: pickupPhotos.map((p) => `ref:${p.ref}`), conditionNotes: conditionNotes || undefined, ...geo() },
    });
    if (outcome.state === "queued") setStatusOverride({ status: "PICKED_UP", label: "Picked up" });
    await handle(outcome, "Pickup confirmed. Load secured.");
    setBusy(false);
  };

  const confirmDelivery = async () => {
    if (!recipient.trim()) return setToast({ tone: "error", text: "Enter the name of the person receiving the items." });
    setBusy(true);
    refreshPosition();
    let signatureRef: string | undefined;
    if (!cannotSign) {
      const blob = await sig.current?.toBlob();
      if (!blob) {
        setBusy(false);
        return setToast({ tone: "error", text: "Ask the recipient to sign, or tick “Recipient unable to sign” and add a photo." });
      }
      const up = await sync.runUpload({ orderId, label: "Signature", path: `/v1/driver/jobs/${orderId}/upload`, file: blob, filename: "signature.png", fields: { kind: "signature" } });
      if (up.state === "failed") {
        setBusy(false);
        return setToast({ tone: "error", text: up.error });
      }
      signatureRef = `ref:${up.ref}`;
    } else if (deliveryPhotos.length === 0) {
      setBusy(false);
      return setToast({ tone: "error", text: "Without a signature, add at least one delivery photo." });
    }
    const outcome = await sync.runJson({
      orderId,
      label: "Proof of delivery",
      path: `/v1/driver/jobs/${orderId}/proof`,
      body: {
        kind: "DELIVERY",
        recipientName: recipient.trim(),
        signatureUploadId: signatureRef,
        photoUploadIds: deliveryPhotos.map((p) => `ref:${p.ref}`),
        conditionNotes: cannotSign ? `Recipient unable to sign. ${conditionNotes}`.trim() : conditionNotes || undefined,
        ...geo(),
      },
    });
    if (outcome.state === "queued") setStatusOverride({ status: "DELIVERED", label: "Delivered / released" });
    await handle(outcome, "Delivered. Proof of delivery recorded.");
    setBusy(false);
  };

  const reportException = async (data: { type: string; severity: string; detail: string; photoRefs: string[] }) => {
    setBusy(true);
    const outcome = await sync.runJson({
      orderId,
      label: "Report problem",
      path: `/v1/driver/jobs/${orderId}/exception`,
      body: { type: data.type, severity: data.severity, detail: data.detail, uploadIds: data.photoRefs.map((r) => `ref:${r}`), ...geo() },
    });
    const ok = await handle(outcome, "Problem reported to dispatch.", "Problem saved. Dispatch will see it as soon as you have signal.");
    if (ok && data.type === "COUNT_MISMATCH") setMismatchReported(true);
    if (ok) setModal(null);
    setBusy(false);
  };

  // ---------------- view ----------------

  const pickupStage = status === "EN_ROUTE";
  const transitStage = ["PICKED_UP", "AT_FACILITY", "IN_TRANSIT"].includes(status);
  const deliveryStage = status === "OUT_FOR_DELIVERY";
  const done = ["DELIVERED", "TRANSFERRED_TO_CARRIER", "CANCELLED"].includes(status);
  const pickupScanned = scans.PICKUP.length;
  const deliveryScanned = scans.DELIVERY.length;
  const checklistDone = checklist.instructions && checklist.count && checklist.contact;
  const canConfirmPickup = checklistDone && (pickupScanned >= total || mismatchReported);
  const canConfirmDelivery = (deliveryScanned >= total || mismatchReported) && recipient.trim().length > 1 && (cannotSign ? deliveryPhotos.length > 0 : signed);

  return (
    <div className="space-y-4">
      <Link href="/driver" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-navy"><ArrowLeft className="h-4 w-4" aria-hidden /> My jobs</Link>

      {/* Job header */}
      <section className={`rounded-3xl p-5 text-white shadow-[var(--shadow-lift)] ${job.priority === "VIP" ? "bg-gradient-to-br from-navy to-navy-950 ring-2 ring-orange" : "bg-navy"}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Job</p>
            <h1 className="font-mono text-xl font-bold text-white">{job.reference}</h1>
          </div>
          <StatusChip status={status} label={statusLabel} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1"><Clock className="h-3.5 w-3.5" aria-hidden />{job.timeWindow ? WINDOW_LABEL[job.timeWindow] ?? job.timeWindow : "Window to confirm"}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1"><Package className="h-3.5 w-3.5" aria-hidden />{total} {total === 1 ? "piece" : "pieces"}</span>
          {job.priority !== "NORMAL" && <span className="inline-flex items-center gap-1 rounded-full bg-orange-600 px-2.5 py-1"><Crown className="h-3.5 w-3.5" aria-hidden />{job.priority}</span>}
          {job.guestName && <span className="rounded-full bg-white/10 px-2.5 py-1">Guest: {job.guestName}{job.guestRoom ? ` · Room ${job.guestRoom}` : ""}</span>}
        </div>
        {stale && <p className="mt-3 rounded-xl bg-white/10 p-2.5 text-xs">Offline copy of this job. Changes will sync when you have signal.</p>}
      </section>

      {(job.specialHandling || job.accessNotes || job.customerNotes) && (
        <section className="rounded-3xl border-2 border-orange bg-orange-50 p-4" aria-label="Instructions">
          <p className="flex items-center gap-2 text-sm font-bold text-orange-700"><ShieldCheck className="h-4 w-4" aria-hidden /> Read before you load</p>
          <ul className="mt-2 space-y-1.5 text-[15px] text-charcoal">
            {job.specialHandling && <li><span className="font-semibold">Handling:</span> {job.specialHandling}</li>}
            {job.accessNotes && <li><span className="font-semibold">Access:</span> {job.accessNotes}</li>}
            {job.customerNotes && <li><span className="font-semibold">Customer notes:</span> {job.customerNotes}</li>}
          </ul>
        </section>
      )}

      <StopCard title="Pickup" stop={job.pickup} accent="orange" />
      {job.extraStops.map((s, i) => <StopCard key={i} title={`Stop ${i + 2}`} stop={s} accent="navy" />)}
      <StopCard title="Delivery" stop={job.delivery} accent="navy" />

      {job.customer.phone && !["DELIVERED", "CANCELLED"].includes(status) && (
        <a href={telHref(job.customer.phone)} className="flex min-h-14 flex-col items-center justify-center rounded-2xl border-2 border-navy bg-white px-4 py-2 text-navy active:bg-navy-50">
          <span className="flex items-center gap-2 text-base font-bold"><Phone className="h-5 w-5" aria-hidden /> Call customer</span>
          <span className="text-xs font-medium text-slate-ink">{job.customer.name}</span>
        </a>
      )}

      {/* ---------- Step: accept / start ---------- */}
      {(status === "CONFIRMED" || status === "DRIVER_ASSIGNED") && (
        <Step n={1} title={assignmentAccepted ? "Head to pickup" : "Accept this job"}>
          {!assignmentAccepted ? (
            <BigButton onClick={accept} disabled={busy} icon={<Check className="h-5 w-5" />}>Accept job</BigButton>
          ) : (
            <BigButton onClick={() => setStatus("EN_ROUTE", "Driver en route")} disabled={busy} icon={<Navigation className="h-5 w-5" />}>Start driving to pickup</BigButton>
          )}
          <p className="mt-2 text-sm text-slate-ink">Arrive on time or early for the confirmed window.</p>
        </Step>
      )}

      {/* ---------- Step: pickup ---------- */}
      {pickupStage && (
        <>
          <Step n={2} title="At pickup: confirm before loading">
            <Check3 label="Checked in with the authorized contact" checked={checklist.contact} onChange={(v) => setChecklist((c) => ({ ...c, contact: v }))} />
            <Check3 label="Read and confirmed the job instructions" checked={checklist.instructions} onChange={(v) => setChecklist((c) => ({ ...c, instructions: v }))} />
            <Check3 label={`Bag count matches the manifest (${total})`} checked={checklist.count} onChange={(v) => setChecklist((c) => ({ ...c, count: v }))} />
          </Step>
          <Step n={3} title="Scan every piece">
            <ScanProgress scanned={pickupScanned} total={total} />
            <Scanner onCode={(c) => void scan("PICKUP", c)} busy={busy} />
            <PieceList pieces={job.pieces} scanned={scans.PICKUP} />
          </Step>
          <Step n={4} title="Condition photos">
            <PhotoPicker photos={pickupPhotos} onFiles={(f) => void addPhotos(f, "pickup")} busy={busy} label="Add condition photos" />
            <label htmlFor="cond" className="mt-3 block text-sm font-semibold text-navy">Condition notes (optional)</label>
            <textarea id="cond" rows={2} value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} placeholder="e.g. scuff on the large black case" className="mt-1 w-full rounded-2xl border-2 border-line p-3 text-base focus:border-navy focus:outline-none" />
          </Step>
          <Step n={5} title="Load, secure and confirm pickup">
            {!checklistDone && <Hint>Complete the checklist in step 2.</Hint>}
            {checklistDone && pickupScanned < total && !mismatchReported && <Hint>{total - pickupScanned} {total - pickupScanned === 1 ? "piece is" : "pieces are"} not scanned. Scan them or report a count mismatch.</Hint>}
            {mismatchReported && pickupScanned < total && <Hint tone="warn">Count mismatch reported. Dispatch has been told.</Hint>}
            <BigButton onClick={confirmPickup} disabled={busy || !canConfirmPickup} icon={<CheckCircle2 className="h-5 w-5" />}>Confirm pickup ({Math.min(pickupScanned, total)} of {total})</BigButton>
          </Step>
        </>
      )}

      {/* ---------- Step: in transit ---------- */}
      {transitStage && (
        <Step n={6} title="Next move">
          <p className="mb-3 text-sm text-slate-ink">Never leave property unattended. Choose where the items go next.</p>
          <div className="grid gap-2">
            <BigButton onClick={() => setStatus("OUT_FOR_DELIVERY", "Out for delivery")} disabled={busy} icon={<Truck className="h-5 w-5" />}>Out for delivery</BigButton>
            {status !== "AT_FACILITY" && <BigButton variant="ghost" onClick={() => setModal("facility")} disabled={busy} icon={<Warehouse className="h-5 w-5" />}>Drop at Express Bags facility / storage</BigButton>}
            <BigButton variant="ghost" onClick={() => setModal("carrier")} disabled={busy} icon={<PlaneTakeoff className="h-5 w-5" />}>Hand to carrier (UPS, FedEx, DHL)</BigButton>
          </div>
        </Step>
      )}

      {/* ---------- Step: delivery ---------- */}
      {deliveryStage && (
        <>
          <Step n={7} title="Re-count at handoff">
            <ScanProgress scanned={deliveryScanned} total={total} />
            <Scanner onCode={(c) => void scan("DELIVERY", c)} busy={busy} />
            <PieceList pieces={job.pieces} scanned={scans.DELIVERY} />
          </Step>
          <Step n={8} title="Release to the authorized recipient">
            <label htmlFor="recipient" className="block text-sm font-semibold text-navy">Recipient name</label>
            <input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} autoComplete="off" placeholder="Who received the items?" className="mt-1 min-h-14 w-full rounded-2xl border-2 border-line px-4 text-base focus:border-navy focus:outline-none" />
            <div className="mt-4">
              {!cannotSign && <SignaturePad ref={sig} onChange={(empty) => setSigned(!empty)} />}
              <Check3 label="Recipient unable to sign (add a photo instead)" checked={cannotSign} onChange={setCannotSign} />
            </div>
            <div className="mt-3"><PhotoPicker photos={deliveryPhotos} onFiles={(f) => void addPhotos(f, "delivery")} busy={busy} label="Add delivery photo" /></div>
          </Step>
          <Step n={9} title="Complete the delivery">
            {deliveryScanned < total && !mismatchReported && <Hint>{total - deliveryScanned} {total - deliveryScanned === 1 ? "piece is" : "pieces are"} not re-scanned.</Hint>}
            <BigButton onClick={confirmDelivery} disabled={busy || !canConfirmDelivery} icon={<CheckCircle2 className="h-5 w-5" />}>Confirm delivery</BigButton>
          </Step>
        </>
      )}

      {done && (
        <section className={`rounded-3xl p-6 text-center ${status === "CANCELLED" ? "bg-rose-50" : "bg-emerald-50"}`}>
          <CheckCircle2 className={`mx-auto h-12 w-12 ${status === "CANCELLED" ? "text-rose-700" : "text-emerald-700"}`} aria-hidden />
          <p className="mt-3 font-display text-xl font-bold text-navy">{status === "CANCELLED" ? "Job cancelled" : status === "TRANSFERRED_TO_CARRIER" ? "Handed to carrier" : "Job complete"}</p>
          <p className="mt-1 text-sm text-slate-ink">{status === "CANCELLED" ? "Return any items to the facility and contact dispatch." : "Thank you. Proof is recorded and dispatch can see it."}</p>
          <Link href="/driver" className="mt-5 inline-flex min-h-12 items-center rounded-full bg-navy px-6 font-bold text-white">Next job</Link>
        </section>
      )}

      {!done && (
        <button onClick={() => setModal("exception")} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-rose-700 bg-white text-base font-bold text-rose-700 active:bg-rose-50">
          <Flag className="h-5 w-5" aria-hidden /> Report a problem
        </button>
      )}

      <Timeline job={job} />

      {modal === "exception" && <ExceptionSheet busy={busy} onClose={() => setModal(null)} onSubmit={reportException} onPhotos={(f, onAdd) => addPhotos(f, "exception", onAdd)} />}
      {modal === "carrier" && (
        <SimpleSheet title="Hand to carrier" onClose={() => setModal(null)}>
          <CarrierForm busy={busy} onSubmit={async (carrier, trackingNumber) => { await setStatus("TRANSFERRED_TO_CARRIER", "Transferred to carrier", { carrier, trackingNumber }); setModal(null); }} />
        </SimpleSheet>
      )}
      {modal === "facility" && (
        <SimpleSheet title="Drop at facility / storage" onClose={() => setModal(null)}>
          <FacilityForm busy={busy} onSubmit={async (storageBay) => { await setStatus("AT_FACILITY", "At Express Bags processing / storage", { storageBay: storageBay || undefined }); setModal(null); }} />
        </SimpleSheet>
      )}

      {toast && (
        <div role={toast.tone === "error" ? "alert" : "status"} className={`pointer-events-none fixed inset-x-4 top-20 z-50 mx-auto max-w-xl rounded-2xl px-4 py-3.5 text-base font-semibold text-white shadow-[var(--shadow-lift)] ${toast.tone === "ok" ? "bg-emerald-700" : toast.tone === "warn" ? "bg-charcoal" : "bg-rose-700"}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function StopCard({ title, stop, accent }: { title: string; stop: Stop; accent: "orange" | "navy" }) {
  const links = stop.address ? mapsLinks(stop.address) : null;
  return (
    <section className="rounded-3xl border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      <p className={`flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] ${accent === "orange" ? "text-orange-700" : "text-navy"}`}><MapPin className="h-4 w-4" aria-hidden />{title}{stop.type ? ` · ${stop.type.replace(/-/g, " ")}` : ""}</p>
      <p className="mt-1.5 text-[17px] font-semibold leading-snug text-charcoal">{stop.address || "Address to confirm with dispatch"}</p>
      {stop.contact && <p className="mt-1 text-sm text-slate-ink">Contact: {stop.contact}</p>}
      {stop.notes && <p className="mt-1 text-sm text-slate-ink">{stop.notes}</p>}
      {links && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={links.google} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-navy text-sm font-bold text-white"><Navigation className="h-4 w-4" aria-hidden />Google Maps</a>
          <a href={links.apple} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-cloud text-sm font-bold text-navy"><Navigation className="h-4 w-4" aria-hidden />Apple Maps</a>
        </div>
      )}
    </section>
  );
}

function ScanProgress({ scanned, total }: { scanned: number; total: number }) {
  const n = Math.min(scanned, total);
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div className="mb-3" data-testid="scan-progress">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-3xl font-extrabold text-navy" aria-live="polite">{n} <span className="text-lg font-bold text-slate-ink">of {total} scanned</span></p>
        {n === total && <span className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-bold text-white">All pieces</span>}
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-cloud" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={n} aria-label="Pieces scanned">
        <div className="h-full rounded-full bg-orange-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PieceList({ pieces, scanned }: { pieces: JobDetail["pieces"]; scanned: string[] }) {
  return (
    <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line">
      {pieces.map((p) => {
        const ok = scanned.includes(p.pieceId);
        return (
          <li key={p.id} className={`flex min-h-14 items-center justify-between gap-3 px-3.5 py-2 ${ok ? "bg-emerald-50" : "bg-white"}`}>
            <div className="min-w-0">
              <p className="truncate font-mono text-sm font-bold text-navy">{p.pieceId}</p>
              <p className="text-xs text-slate-ink">{CATEGORY_LABEL[p.category] ?? p.category}{p.description ? ` · ${p.description}` : ""}{p.storageBay ? ` · Bay ${p.storageBay}` : ""}</p>
            </div>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${ok ? "bg-emerald-700 text-white" : "border-2 border-dashed border-line text-muted"}`} aria-label={ok ? "Scanned" : "Not scanned"}>
              {ok ? <Check className="h-5 w-5" /> : <Package className="h-4 w-4" />}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function PhotoPicker({ photos, onFiles, busy, label }: { photos: Photo[]; onFiles: (f: FileList | null) => void; busy?: boolean; label: string }) {
  const id = `photo-${label.replace(/\W/g, "")}`;
  return (
    <div>
      <label htmlFor={id} className={`flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-navy/40 bg-navy-50 text-base font-bold text-navy active:bg-navy-100 ${busy ? "opacity-60" : ""}`}>
        <Camera className="h-5 w-5" aria-hidden /> {label}
      </label>
      <input id={id} type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} disabled={busy} />
      {photos.length > 0 && (
        <ul className="mt-3 grid grid-cols-4 gap-2" aria-label={`${photos.length} photos added`}>
          {photos.map((p) => (
            <li key={p.ref} className="aspect-square overflow-hidden rounded-xl bg-cloud">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={p.url} alt="Photo preview" className="h-full w-full object-cover" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-white p-4 shadow-[var(--shadow-card)]" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="mb-3 flex items-center gap-2.5 font-display text-lg font-bold text-navy">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-orange-600 text-sm text-white">{n}</span>{title}
      </h2>
      {children}
    </section>
  );
}

function BigButton({ children, onClick, disabled, icon, variant = "primary" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; icon?: React.ReactNode; variant?: "primary" | "ghost" }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-bold transition disabled:opacity-50 ${variant === "primary" ? "bg-orange-600 text-white shadow-[0_10px_24px_-12px_rgb(224_96_16/0.9)] active:bg-orange-700" : "border-2 border-navy bg-white text-navy active:bg-navy-50"}`}>
      {icon}{children}
    </button>
  );
}

function Check3({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-1 py-1.5 text-[15px] font-medium text-charcoal">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-6 w-6 shrink-0 rounded-md accent-[#E06010]" />
      {label}
    </label>
  );
}

function Hint({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  return <p className={`mb-3 rounded-xl p-3 text-sm font-medium ${tone === "warn" ? "bg-orange-50 text-orange-700" : "bg-cloud text-slate-ink"}`}>{children}</p>;
}

function SimpleSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button aria-label="Close" className="absolute inset-0 bg-navy-950/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-navy">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full bg-cloud"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const sheetField = "mt-1 min-h-14 w-full rounded-2xl border-2 border-line px-4 text-base focus:border-navy focus:outline-none";

function ExceptionSheet({ busy, onClose, onSubmit, onPhotos }: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (d: { type: string; severity: string; detail: string; photoRefs: string[] }) => void;
  onPhotos: (f: FileList | null, onAdd: (p: Photo) => void) => Promise<void>;
}) {
  const [type, setType] = useState("COUNT_MISMATCH");
  const [severity, setSeverity] = useState("MEDIUM");
  const [detail, setDetail] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  return (
    <SimpleSheet title="Report a problem" onClose={onClose}>
      <p className="mb-4 text-sm text-slate-ink">Dispatch is alerted right away. Describe exactly what you see. Never guess.</p>
      <label htmlFor="ex-type" className="block text-sm font-semibold text-navy">What happened?</label>
      <select id="ex-type" value={type} onChange={(e) => setType(e.target.value)} className={sheetField}>
        {EXCEPTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-navy">How serious?</legend>
        <div className="mt-1 grid grid-cols-4 gap-1.5">
          {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
            <label key={s} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 text-xs font-bold ${severity === s ? "border-navy bg-navy text-white" : "border-line text-slate-ink"}`}>
              <input type="radio" name="severity" value={s} checked={severity === s} onChange={() => setSeverity(s)} className="sr-only" />{s.toLowerCase()}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor="ex-detail" className="mt-4 block text-sm font-semibold text-navy">Details</label>
      <textarea id="ex-detail" rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} className="mt-1 w-full rounded-2xl border-2 border-line p-3 text-base focus:border-navy focus:outline-none" placeholder="e.g. 7 bags on the manifest, 6 at the bell desk" />
      <div className="mt-3"><PhotoPicker photos={photos} onFiles={(f) => void onPhotos(f, (p) => setPhotos((x) => [...x, p]))} busy={busy} label="Add photo of the problem" /></div>
      <div className="mt-5">
        <BigButton onClick={() => onSubmit({ type, severity, detail, photoRefs: photos.map((p) => p.ref) })} disabled={busy || detail.trim().length < 3} icon={<Flag className="h-5 w-5" />}>Send to dispatch</BigButton>
      </div>
    </SimpleSheet>
  );
}

function CarrierForm({ busy, onSubmit }: { busy: boolean; onSubmit: (carrier: string, tracking: string) => void }) {
  const [carrier, setCarrier] = useState("UPS");
  const [tracking, setTracking] = useState("");
  return (
    <div>
      <label htmlFor="cr" className="block text-sm font-semibold text-navy">Carrier</label>
      <select id="cr" value={carrier} onChange={(e) => setCarrier(e.target.value)} className={sheetField}>
        {["UPS", "FedEx", "DHL", "USPS", "Other"].map((c) => <option key={c}>{c}</option>)}
      </select>
      <label htmlFor="trk" className="mt-4 block text-sm font-semibold text-navy">Carrier tracking number</label>
      <input id="trk" value={tracking} onChange={(e) => setTracking(e.target.value.toUpperCase())} autoCapitalize="characters" className={`${sheetField} font-mono`} placeholder="1Z…" />
      <p className="mt-2 text-xs text-slate-ink">Keep the carrier number separate from the Express Bags job number.</p>
      <div className="mt-5"><BigButton onClick={() => onSubmit(carrier, tracking.trim())} disabled={busy || tracking.trim().length < 4} icon={<PlaneTakeoff className="h-5 w-5" />}>Confirm handoff</BigButton></div>
    </div>
  );
}

function FacilityForm({ busy, onSubmit }: { busy: boolean; onSubmit: (bay: string) => void }) {
  const [bay, setBay] = useState("");
  return (
    <div>
      <label htmlFor="bay" className="block text-sm font-semibold text-navy">Storage bay or shelf (optional)</label>
      <input id="bay" value={bay} onChange={(e) => setBay(e.target.value.toUpperCase())} className={sheetField} placeholder="e.g. B-04" />
      <p className="mt-2 text-xs text-slate-ink">Items stay in Express Bags custody. The bay is recorded on every piece.</p>
      <div className="mt-5"><BigButton onClick={() => onSubmit(bay.trim())} disabled={busy} icon={<Warehouse className="h-5 w-5" />}>Confirm drop-off</BigButton></div>
    </div>
  );
}

function Timeline({ job }: { job: JobDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-3xl border border-line bg-white">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-14 w-full items-center justify-between px-4 text-base font-bold text-navy">
        Job history ({job.timeline.length}) <ChevronDown className={`h-5 w-5 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ol className="space-y-3 border-t border-line p-4">
          {job.timeline.map((e) => (
            <li key={e.id} className="text-sm">
              <p className="font-semibold text-charcoal">{(e.detail ?? e.type).replace(/^STAGE:\w+ /, "Scanned ")}</p>
              <p className="text-xs text-muted">{new Date(e.createdAt).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}{e.actorName ? ` · ${e.actorName}` : ""}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
