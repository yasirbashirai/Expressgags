"use client";

/** One carrier shipment: tracking, carrier events timeline, label print, refresh tracking, void. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Printer, RefreshCw, XCircle } from "lucide-react";
import { api, API_URL, dateTime, money } from "@/components/admin/api";
import { AdminTitle, Panel } from "@/components/admin/admin-shell";
import { Badge } from "@/components/admin/labels";
import { ConfirmButton } from "@/components/admin/ui";
import { CATEGORY_LABEL, LEVEL_LABEL, SHIPMENT_STATUS_LABEL, SHIPMENT_STATUS_STYLE } from "./labels";

type Shipment = {
  id: string;
  carrier: string;
  service: string;
  ebServiceLevel: string;
  trackingNumber: string | null;
  status: string;
  provider: string;
  costCents: number;
  retailCents: number;
  billableWeightLbs: number | null;
  transitDays: number | null;
  labelUploadId: string | null;
  createdAt: string;
  events: { at: string; status: string; detail?: string; location?: string }[] | null;
  order: { id: string; reference: string; status: string; customer: { name: string; email: string } };
};

export function ShipmentDetail({ id }: { id: string }) {
  const [s, setS] = useState<Shipment | null>(null);
  const [piece, setPiece] = useState<{ pieceId: string; category: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ shipment: Shipment; piece: { pieceId: string; category: string } | null }>(`/carriers/shipments/${id}`);
      setS(r.shipment);
      setPiece(r.piece);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => void load(), [load]);

  async function act(path: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/carriers/shipments/${id}/${path}`, { method: "POST" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!s) return error ? <p role="alert" className="text-sm text-rose-800">{error}</p> : <p className="text-sm text-muted">Loading…</p>;
  const events = [...(s.events ?? [])].reverse();
  return (
    <>
      <Link href="/admin/shipments" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden /> Shipments</Link>
      <AdminTitle
        title={s.trackingNumber ?? "Carrier shipment"}
        sub={`${s.carrier} ${s.service} · sold as ${LEVEL_LABEL[s.ebServiceLevel] ?? s.ebServiceLevel}`}
        actions={
          <>
            {s.labelUploadId && s.status !== "VOIDED" && (
              <a href={`${API_URL}/v1/admin/carriers/shipments/${s.id}/label`} target="_blank" rel="noopener noreferrer" className="btn-navy !px-4 !py-2"><Printer className="h-4 w-4" aria-hidden /> Print label</a>
            )}
            <button type="button" disabled={busy || s.status === "VOIDED"} onClick={() => void act("refresh")} className="btn-ghost !px-4 !py-2"><RefreshCw className="h-4 w-4" aria-hidden /> Refresh tracking</button>
            {["CREATED", "LABELED"].includes(s.status) && (
              <ConfirmButton className="btn-ghost !px-4 !py-2 text-rose-700" confirmText="Void this label?" onConfirm={() => void act("void")}><XCircle className="h-4 w-4" aria-hidden /> Void label</ConfirmButton>
            )}
          </>
        }
      />
      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Panel title="Carrier events">
          {events.length === 0 ? (
            <p className="text-sm text-muted">No carrier events yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-line pl-5">
              {events.map((e, i) => (
                <li key={i}>
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-orange" aria-hidden />
                  <p className="font-semibold text-navy">{SHIPMENT_STATUS_LABEL[e.status] ?? e.status}</p>
                  <p className="text-sm text-slate-ink">{[e.detail, e.location].filter(Boolean).join(" · ")}</p>
                  <p className="text-xs text-muted">{dateTime(e.at)}</p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <Panel title="Details">
          <dl className="grid gap-3 text-sm">
            <Row k="Status" v={<Badge className={SHIPMENT_STATUS_STYLE[s.status]}>{SHIPMENT_STATUS_LABEL[s.status] ?? s.status}</Badge>} />
            <Row k="Express Bags order" v={<Link href={`/admin/orders/${s.order.id}`} className="font-semibold text-orange-700 underline">{s.order.reference}</Link>} />
            <Row k="Customer" v={s.order.customer.name} />
            {piece && <Row k="Piece" v={`${piece.pieceId} (${CATEGORY_LABEL[piece.category] ?? piece.category})`} />}
            <Row k="Billable weight" v={s.billableWeightLbs ? `${s.billableWeightLbs} lb` : "-"} />
            <Row k="Promised transit" v={s.transitDays ? `about ${s.transitDays} day(s)` : "-"} />
            <Row k="Carrier cost (internal)" v={money(s.costCents)} />
            <Row k="Retail share (internal)" v={money(s.retailCents)} />
            <Row k="Provider" v={s.provider === "mock" ? "Test mode (mock)" : s.provider} />
            <Row k="Created" v={dateTime(s.createdAt)} />
          </dl>
          <p className="mt-4 text-xs text-muted">Customers see this as carrier tracking, separate from the Express Bags reference.</p>
        </Panel>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-medium text-navy">{v}</dd>
    </div>
  );
}
