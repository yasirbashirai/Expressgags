"use client";

/**
 * Staff rate shopping for one nationwide order: every Express Bags service level with the carrier
 * service it maps to, carrier billable cost, retail, profit, markup and gross margin side by side,
 * the parcels (one label per bag, dimensional weight shown), then "Buy labels".
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw, Tag } from "lucide-react";
import { api, money } from "@/components/admin/api";
import { AdminTitle, Panel } from "@/components/admin/admin-shell";
import { Badge } from "@/components/admin/labels";
import { ConfirmButton, Field, inputCls } from "@/components/admin/ui";
import { CATEGORY_LABEL, pct } from "./labels";

type Offer = {
  level: string;
  levelName: string;
  carrier: string;
  carrierService: string;
  transitDays: number;
  retailCents: number;
  costCents: number;
  profitCents: number;
  markupPercent: number;
  marginPercent: number;
  manualReview: boolean;
  notes: string[];
};
type Parcel = { category: string; weightLbs: number; lengthIn: number; widthIn: number; heightIn: number; billableWeightLbs: number; lengthPlusGirth: number; eligible: string[]; usedDefaults: boolean };
type Result =
  | { status: "priced"; offers: Offer[]; carriersFailed: string[]; parcels: Parcel[]; origin: { city: string; state: string; zip: string } }
  | { status: "request-quote"; reason: string; carriersFailed: string[]; parcels: Parcel[] };
type Resp = { order: { id: string; reference: string; pieces: number }; destination: { street1: string; city: string; state: string; zip: string; country: string; confident: boolean }; result: Result };
type Settings = { processingPoints: { code: string; name: string; active: boolean }[]; defaultProcessingPoint: string };

export function RateShop({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [point, setPoint] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);

  const shop = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api<Resp>(`/carriers/orders/${orderId}/rates`, { method: "POST", json: { ...(destination.trim() ? { destination: destination.trim() } : {}), ...(point ? { processingPoint: point } : {}) } });
      setData(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [orderId, destination, point]);

  useEffect(() => {
    api<{ settings: Settings }>("/carriers/settings").then((r) => setSettings(r.settings)).catch(() => undefined);
    void shop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buy(level: string) {
    setBuying(level);
    setError(null);
    try {
      await api(`/carriers/orders/${orderId}/labels`, { method: "POST", json: { level, ...(destination.trim() ? { destination: destination.trim() } : {}), ...(point ? { processingPoint: point } : {}) } });
      router.push(`/admin/shipments?q=${encodeURIComponent(data?.order.reference ?? "")}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuying(null);
    }
  }

  const res = data?.result;
  return (
    <>
      <Link href="/admin/shipments" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden /> Shipments</Link>
      <AdminTitle
        title={data ? `Rate shop ${data.order.reference}` : "Rate shop"}
        sub="Internal view: carrier cost and margin are never shown to customers. One label is bought per bag."
        actions={<Link href={`/admin/orders/${orderId}`} className="btn-ghost !px-4 !py-2">Open order</Link>}
      />

      <Panel title="Route" className="mb-6">
        <div className="grid gap-4 md:grid-cols-[1fr_260px_auto] md:items-end">
          <Field label="Destination address (override)" htmlFor="rs-dest" hint={data ? `Using: ${[data.destination.street1, data.destination.city, data.destination.state, data.destination.zip, data.destination.country].filter(Boolean).join(", ")}${data.destination.confident ? "" : " (please confirm)"}` : undefined}>
            <input id="rs-dest" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Street, City, ST 12345" className={inputCls} />
          </Field>
          <Field label="Processing point (first mile)" htmlFor="rs-point">
            <select id="rs-point" value={point} onChange={(e) => setPoint(e.target.value)} className={inputCls}>
              <option value="">Default</option>
              {settings?.processingPoints.filter((p) => p.active).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </Field>
          <button type="button" onClick={() => void shop()} disabled={loading} className="btn-navy">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} Refresh rates
          </button>
        </div>
      </Panel>

      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {res && res.carriersFailed.length > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> No rates from {res.carriersFailed.join(", ")} right now. Other carriers are shown.
        </p>
      )}

      {res?.status === "request-quote" && (
        <Panel className="mb-6">
          <p className="font-semibold text-navy">No automatic carrier price</p>
          <p className="mt-1 text-sm text-slate-ink">{res.reason}</p>
        </Panel>
      )}

      {res?.status === "priced" && (
        <Panel title="Express Bags service levels" className="mb-6">
          <div className="grid gap-3 lg:grid-cols-2">
            {res.offers.map((o) => (
              <article key={o.level} className="rounded-2xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-bold text-navy">{o.levelName}</h3>
                    <p className="text-sm text-slate-ink">{o.carrier} {o.carrierService} · about {o.transitDays} day(s)</p>
                  </div>
                  {o.manualReview ? <Badge className="bg-rose-50 text-rose-800 ring-rose-200">Review</Badge> : <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-200">OK</Badge>}
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-5">
                  {[
                    ["Retail", money(o.retailCents)],
                    ["Cost", money(o.costCents)],
                    ["Profit", money(o.profitCents)],
                    ["Markup", pct(o.markupPercent)],
                    ["Margin", pct(o.marginPercent)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs uppercase tracking-wider text-muted">{k}</dt>
                      <dd className="font-semibold text-navy">{v}</dd>
                    </div>
                  ))}
                </dl>
                {o.notes.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-muted">{o.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
                <div className="mt-4">
                  <ConfirmButton className="btn-primary w-full sm:w-auto" confirmText={`Buy ${data?.order.pieces} label(s) now?`} onConfirm={() => void buy(o.level)}>
                    {buying === o.level ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Tag className="h-4 w-4" aria-hidden />} Buy labels for {o.levelName}
                  </ConfirmButton>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      )}

      {res && (
        <Panel title="Parcels (one label per bag)">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted">
                <tr><th className="py-2">#</th><th>Bag</th><th>Actual</th><th>Size (in)</th><th>Billable</th><th>Eligible carriers</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {res.parcels.map((p, i) => (
                  <tr key={i}>
                    <td className="py-2">{i + 1}</td>
                    <td>{CATEGORY_LABEL[p.category] ?? p.category}{p.usedDefaults && <span className="ml-1 text-xs text-amber-700">(default size)</span>}</td>
                    <td>{p.weightLbs} lb</td>
                    <td>{p.lengthIn}×{p.widthIn}×{p.heightIn}</td>
                    <td className={p.billableWeightLbs > p.weightLbs ? "font-semibold text-orange-700" : ""}>{p.billableWeightLbs} lb</td>
                    <td>{p.eligible.join(", ") || "None (above carrier limits)"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">Billable weight is the larger of actual and dimensional weight (L×W×H ÷ 139). DHL is offered for international destinations only; USPS up to 70 lb.</p>
        </Panel>
      )}
    </>
  );
}
