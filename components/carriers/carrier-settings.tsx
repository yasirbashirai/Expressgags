"use client";

/**
 * Carrier settings: default luggage measurements per category, enabled carriers, carrier name
 * visibility before checkout, first-mile processing points (private addresses), label format and
 * notes about Express Bags-owned carrier accounts. Prices live in Settings & pricing (carrier rules).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { api, ApiError } from "@/components/admin/api";
import { AdminTitle, Panel, useAdminUser } from "@/components/admin/admin-shell";
import { Field, inputCls } from "@/components/admin/ui";
import { CATEGORY_LABEL } from "./labels";

type Dims = { weightLbs: number; lengthIn: number; widthIn: number; heightIn: number };
type Point = { code: string; name: string; street1: string; city: string; state: string; zip: string; active: boolean };
type Settings = {
  defaultDims: Record<string, Dims>;
  enabledCarriers: string[];
  showCarrierBeforeCheckout: boolean;
  processingPoints: Point[];
  defaultProcessingPoint: string;
  labelFormat: "PDF" | "PNG";
  accountNotes: string;
};
const CARRIERS = ["UPS", "FedEx", "DHL", "USPS"];
const CARRIER_NOTE: Record<string, string> = { DHL: "International only", USPS: "Up to 70 lb", UPS: "Up to 150 lb", FedEx: "Up to 150 lb" };

export function CarrierSettingsForm() {
  const user = useAdminUser();
  const canEdit = user?.role === "OWNER" || user?.role === "STAFF";
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ settings: Settings }>("/carriers/settings").then((r) => setS(r.settings)).catch((e) => setMsg({ ok: false, text: (e as Error).message }));
  }, []);

  if (!s) return <p className="text-sm text-muted">{msg?.text ?? "Loading…"}</p>;
  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch });
  const setDim = (cat: string, k: keyof Dims, v: string) => set({ defaultDims: { ...s.defaultDims, [cat]: { ...s.defaultDims[cat], [k]: Number(v) } } });
  const setPoint = (i: number, patch: Partial<Point>) => set({ processingPoints: s.processingPoints.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api<{ settings: Settings }>("/carriers/settings", { method: "PUT", json: s });
      setS(r.settings);
      setMsg({ ok: true, text: "Carrier settings saved." });
    } catch (e) {
      const d = e instanceof ApiError ? e.details?.map((x) => `${x.path}: ${x.message}`).join(" · ") : "";
      setMsg({ ok: false, text: `${(e as Error).message}${d ? ` (${d})` : ""}` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Link href="/admin/shipments" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden /> Shipments</Link>
      <AdminTitle
        title="Carrier settings"
        sub="All carrier accounts belong to Express Bags, Inc. Pricing rules (markups, floors, margins) are in Settings & pricing."
        actions={canEdit ? <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary !px-4 !py-2"><Save className="h-4 w-4" aria-hidden /> {saving ? "Saving…" : "Save settings"}</button> : undefined}
      />
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mb-4 rounded-xl border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{msg.text}</p>}

      <fieldset disabled={!canEdit} className="grid gap-6">
        <Panel title="Carriers">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CARRIERS.map((c) => (
              <label key={c} className="flex items-center gap-3 rounded-xl border border-line p-3">
                <input type="checkbox" className="h-4 w-4 accent-[#E06010]" checked={s.enabledCarriers.includes(c)} onChange={(e) => set({ enabledCarriers: e.target.checked ? [...s.enabledCarriers, c] : s.enabledCarriers.filter((x) => x !== c) })} />
                <span><span className="block font-semibold text-navy">{c}</span><span className="text-xs text-muted">{CARRIER_NOTE[c]}</span></span>
              </label>
            ))}
          </div>
          <label className="mt-4 flex items-start gap-3 rounded-xl bg-cloud p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#E06010]" checked={s.showCarrierBeforeCheckout} onChange={(e) => set({ showCarrierBeforeCheckout: e.target.checked })} />
            <span><span className="font-semibold text-navy">Show the carrier name before checkout</span><span className="block text-muted">Off: customers see Express Bags service names only until the label is generated.</span></span>
          </label>
        </Panel>

        <Panel title="Default luggage measurements">
          <p className="mb-3 text-sm text-slate-ink">Used when a customer does not enter exact measurements. Carriers bill by the larger of actual and dimensional weight, so keep these realistic.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted"><tr><th className="py-2">Category</th><th>Weight (lb)</th><th>Length (in)</th><th>Width (in)</th><th>Height (in)</th></tr></thead>
              <tbody className="divide-y divide-line">
                {Object.entries(s.defaultDims).map(([cat, d]) => (
                  <tr key={cat}>
                    <td className="py-2 font-medium text-navy">{CATEGORY_LABEL[cat] ?? cat}</td>
                    {(["weightLbs", "lengthIn", "widthIn", "heightIn"] as const).map((k) => (
                      <td key={k} className="pr-2"><input aria-label={`${CATEGORY_LABEL[cat] ?? cat} ${k}`} type="number" min={1} step="0.5" value={d[k]} onChange={(e) => setDim(cat, k, e.target.value)} className={`${inputCls} !py-1.5`} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Processing points (first mile)"
          action={canEdit ? <button type="button" className="btn-ghost !px-3 !py-1.5" onClick={() => set({ processingPoints: [...s.processingPoints, { code: `point-${s.processingPoints.length + 1}`, name: "", street1: "", city: "", state: "FL", zip: "", active: true }] })}><Plus className="h-4 w-4" aria-hidden /> Add</button> : undefined}
        >
          <p className="mb-3 text-sm text-slate-ink">Express Bags picks the bags up, brings them to a processing point, then hands them to the carrier. Rates are shopped from here. These addresses are private and never shown publicly.</p>
          <div className="grid gap-4">
            {s.processingPoints.map((p, i) => (
              <div key={i} className="grid gap-3 rounded-2xl border border-line p-4 md:grid-cols-6">
                <Field label="Code" htmlFor={`pp-code-${i}`}><input id={`pp-code-${i}`} value={p.code} onChange={(e) => setPoint(i, { code: e.target.value })} className={inputCls} /></Field>
                <div className="md:col-span-2"><Field label="Name" htmlFor={`pp-name-${i}`}><input id={`pp-name-${i}`} value={p.name} onChange={(e) => setPoint(i, { name: e.target.value })} className={inputCls} /></Field></div>
                <div className="md:col-span-3"><Field label="Street" htmlFor={`pp-street-${i}`}><input id={`pp-street-${i}`} value={p.street1} onChange={(e) => setPoint(i, { street1: e.target.value })} className={inputCls} /></Field></div>
                <div className="md:col-span-2"><Field label="City" htmlFor={`pp-city-${i}`}><input id={`pp-city-${i}`} value={p.city} onChange={(e) => setPoint(i, { city: e.target.value })} className={inputCls} /></Field></div>
                <Field label="State" htmlFor={`pp-state-${i}`}><input id={`pp-state-${i}`} maxLength={2} value={p.state} onChange={(e) => setPoint(i, { state: e.target.value.toUpperCase() })} className={inputCls} /></Field>
                <Field label="ZIP" htmlFor={`pp-zip-${i}`}><input id={`pp-zip-${i}`} value={p.zip} onChange={(e) => setPoint(i, { zip: e.target.value })} className={inputCls} /></Field>
                <label className="flex items-center gap-2 text-sm md:mt-7"><input type="checkbox" className="h-4 w-4 accent-[#E06010]" checked={p.active} onChange={(e) => setPoint(i, { active: e.target.checked })} /> Active</label>
                <label className="flex items-center gap-2 text-sm md:mt-7"><input type="radio" name="default-point" className="h-4 w-4 accent-[#E06010]" checked={s.defaultProcessingPoint === p.code} onChange={() => set({ defaultProcessingPoint: p.code })} /> Default</label>
                {s.processingPoints.length > 1 && canEdit && (
                  <button type="button" aria-label={`Remove ${p.name || p.code}`} onClick={() => set({ processingPoints: s.processingPoints.filter((_, j) => j !== i) })} className="self-end justify-self-start rounded-full p-2 text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" aria-hidden /></button>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Labels & accounts">
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <Field label="Label format" htmlFor="cs-format">
              <select id="cs-format" value={s.labelFormat} onChange={(e) => set({ labelFormat: e.target.value as Settings["labelFormat"] })} className={inputCls}>
                <option value="PDF">PDF (4×6)</option>
                <option value="PNG">PNG</option>
              </select>
            </Field>
            <Field label="Carrier account notes (internal)" htmlFor="cs-notes" hint="Which Express Bags-owned UPS / FedEx / DHL / USPS accounts are connected in the carrier platform. Never paste passwords or API keys here.">
              <textarea id="cs-notes" rows={4} value={s.accountNotes} onChange={(e) => set({ accountNotes: e.target.value })} className={inputCls} />
            </Field>
          </div>
        </Panel>
      </fieldset>
    </>
  );
}
