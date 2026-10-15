"use client";

/**
 * Settings & pricing: contact flags, feature flags, custom-quote thresholds, the three pricing
 * rule sets (with live preview: cost, retail, profit, markup %, gross margin %) and notable-project
 * publication permissions. Only the OWNER can save; other roles see a read-only view.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Save } from "lucide-react";
import { api, money } from "./api";
import { AdminTitle, Panel, useAdminUser } from "./admin-shell";
import { PricingBreakdown } from "./quote-detail";

type Rules = Record<string, unknown>;
type SettingsData = {
  settings: {
    contact: { emailLive: boolean; notifyEmail: string };
    features: { pricingEnabled: boolean; hubspotSyncEnabled: boolean };
    thresholds: Record<string, number | string[]>;
  };
  rules: { local: Rules; carrier: Rules; storage: Rules };
  notableProjects: { id: string; title: string; period: string; permissionGranted: boolean; evidenceNote: string }[];
};

type FieldDef = { key: string; label: string; kind: "cents" | "percent" | "number" | "bool" | "select"; options?: string[]; hint?: string };

const ENGINE_FIELDS: Record<"local" | "carrier" | "storage", FieldDef[]> = {
  local: [
    { key: "sameZoneBase", label: "Same-zone trip base", kind: "cents" },
    { key: "perMile", label: "Per mile (no zone price)", kind: "cents" },
    { key: "minimumMilesCharged", label: "Minimum miles charged", kind: "number" },
    { key: "waitingPerHour", label: "Waiting per hour", kind: "cents" },
    { key: "minimumCharge", label: "Minimum local charge", kind: "cents" },
    { key: "minimumProfit", label: "Minimum profit", kind: "cents" },
    { key: "estimatedCostPercent", label: "Estimated direct cost", kind: "percent", hint: "of retail, used for profit guardrails" },
    { key: "promoPercent", label: "Promotion", kind: "percent" },
  ],
  carrier: [
    { key: "mode", label: "Profit method", kind: "select", options: ["markup", "margin"], hint: "markup: cost × (1 + %) · margin: cost ÷ (1 − %)" },
    { key: "defaultPercent", label: "Default markup / margin", kind: "percent" },
    { key: "handlingFee", label: "Handling fee", kind: "cents" },
    { key: "pickupFee", label: "First-mile pickup fee", kind: "cents" },
    { key: "oversizeFeePerPiece", label: "Oversize fee per piece", kind: "cents" },
    { key: "overweightFeePerPiece", label: "Overweight fee per piece", kind: "cents" },
    { key: "reservePercent", label: "Backup / reserve", kind: "percent", hint: "exact value to be set by Express Bags" },
    { key: "minimumPrice", label: "Minimum selling price", kind: "cents" },
    { key: "minimumProfitPerPiece", label: "Minimum profit per piece", kind: "cents" },
    { key: "raiseToFloor", label: "Raise to floor (off = manual review)", kind: "bool" },
    { key: "preferenceTolerancePercent", label: "Preferred-carrier tolerance", kind: "percent" },
    { key: "showCarrierNameBeforeCheckout", label: "Show carrier name before checkout", kind: "bool" },
    { key: "promoPercent", label: "Promotion", kind: "percent" },
  ],
  storage: [
    { key: "structure", label: "Charging structure", kind: "select", options: ["daily", "hourly"] },
    { key: "perPiecePerHour", label: "Per piece per hour", kind: "cents" },
    { key: "perPiecePerDay", label: "Per piece per day", kind: "cents" },
    { key: "dayCapHours", label: "Hourly cap before daily rate (h)", kind: "number" },
    { key: "minimumCharge", label: "Minimum storage charge", kind: "cents" },
    { key: "oversizedPerPiece", label: "Oversized item charge", kind: "cents" },
    { key: "pickupFee", label: "Pickup fee", kind: "cents" },
    { key: "deliveryFee", label: "Delivery fee", kind: "cents" },
    { key: "afterHoursFee", label: "After-hours fee", kind: "cents" },
    { key: "overstayPerPiecePerDay", label: "Overstay per piece per day", kind: "cents" },
    { key: "reservePercent", label: "Backup / reserve", kind: "percent" },
    { key: "minimumProfit", label: "Minimum profit", kind: "cents" },
  ],
};

const SAMPLES = {
  local: { pickupZone: "MIA-BEACH", deliveryZone: "MIA-MAINLAND", miles: 12, pieces: [{ category: "standard-checked", quantity: 4 }, { category: "carry-on", quantity: 2 }], deliveryLocationType: "cruise-port" },
  storage: { start: "2026-11-01T10:00:00Z", end: "2026-11-03T10:00:00Z", pieces: 3, withDelivery: true },
  carrier: { pieces: 1 },
};
const SAMPLE_RATES = [
  { carrier: "UPS", rates: [{ carrier: "UPS", service: "2nd Day Air", billableCostCents: 8200, transitDays: 2 }] },
  { carrier: "FedEx", rates: [{ carrier: "FedEx", service: "2Day", billableCostCents: 7600, transitDays: 2 }] },
  { carrier: "DHL", rates: [{ carrier: "DHL", service: "Express", billableCostCents: 10500, transitDays: 2 }] },
];

const THRESHOLD_LABELS: Record<string, string> = {
  maxAutoPieces: "Max pieces for standard pricing",
  maxAutoExtraStops: "Max extra stops",
  maxAutoTravelers: "Max travelers",
  maxAutoItemWeightLbs: "Max single-item weight (lbs)",
  maxAutoItemLengthGirthIn: "Max length + girth (in)",
  maxAutoOversizedPieces: "Max oversized / special pieces",
};

export function SettingsPanel() {
  const user = useAdminUser();
  const isOwner = user?.role === "OWNER";
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(() => {
    api<SettingsData>("/settings").then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const flash = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2500);
  };

  async function patch(key: "contact" | "features" | "thresholds", value: object, msg: string) {
    setError(null);
    try {
      await api(`/settings/${key}`, { method: "PATCH", json: value });
      flash(msg);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!data) return error ? <p className="text-sm text-rose-700">{error}</p> : <p className="text-sm text-muted">Loading settings…</p>;
  const { contact, features, thresholds } = data.settings;

  return (
    <>
      <AdminTitle title="Settings & pricing" sub={isOwner ? "Changes are saved and audited." : "Read-only: only the owner account can change settings."} />
      {saved && <p role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" /> {saved}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Website contact">
          <Toggle label="Show info@express-bags.com on the website" hint="Turn on only after the mailbox is created, tested and monitored." checked={contact.emailLive} disabled={!isOwner}
            onChange={(v) => patch("contact", { emailLive: v }, "Contact settings saved")} />
          <NotifyEmail value={contact.notifyEmail} disabled={!isOwner} onSave={(v) => patch("contact", { notifyEmail: v }, "Notification email saved")} />
        </Panel>

        <Panel title="Platform features">
          <Toggle label="Automatic public pricing" checked={features.pricingEnabled} disabled={!isOwner}
            hint="Keep OFF until Express Bags has tested and approved real carrier rates, dimensional weight, surcharges, margins, minimums, protection, refunds and terms."
            onChange={(v) => {
              if (v && !window.confirm("Turn ON automatic public pricing? Customers will start seeing prices. Only do this after every rate has been approved.")) return;
              patch("features", { pricingEnabled: v }, v ? "Automatic pricing is ON" : "Automatic pricing is OFF");
            }} />
          {features.pricingEnabled && <p className="mb-3 flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-700"><AlertTriangle className="h-4 w-4" /> Public pricing is live.</p>}
          <Toggle label="Sync new requests to HubSpot" hint="Requires the HUBSPOT_TOKEN server variable. Apollo.io can enrich the same records later." checked={features.hubspotSyncEnabled} disabled={!isOwner}
            onChange={(v) => patch("features", { hubspotSyncEnabled: v }, "HubSpot setting saved")} />
        </Panel>

        <Panel title="Custom-quote thresholds" className="xl:col-span-2">
          <p className="mb-4 text-sm text-muted">Requests above any limit go to a planned custom quotation instead of standard pricing. Group, VIP, event and box-truck requests are always custom.</p>
          <ThresholdForm values={thresholds} disabled={!isOwner} onSave={(v) => patch("thresholds", v, "Thresholds saved")} />
        </Panel>
      </div>

      <h2 className="mb-4 mt-10 font-display text-xl font-bold text-navy">Pricing rules</h2>
      <p className="mb-4 max-w-3xl text-sm text-muted">These are placeholder defaults until Express Bags enters its real rates. Every save creates a new version; the preview shows the internal result. Customers see nothing while automatic pricing is off.</p>
      <div className="grid gap-6">
        {(["local", "carrier", "storage"] as const).map((engine) => (
          <RuleEditor key={engine} engine={engine} rules={data.rules[engine]} disabled={!isOwner} onSaved={() => { flash(`${engine} pricing rules saved as a new version`); load(); }} onError={setError} />
        ))}
      </div>

      <h2 className="mb-4 mt-10 font-display text-xl font-bold text-navy">Notable projects: publication permission</h2>
      <Panel>
        <p className="mb-4 text-sm text-muted">Named clients, artists, teams and partners stay hidden on the website until written permission is recorded here. Also update the public site configuration before publishing a name.</p>
        <ul className="divide-y divide-line">
          {data.notableProjects.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-charcoal">{p.title}</p>
                <p className="text-xs text-muted">{p.period}</p>
              </div>
              <Toggle compact label={p.permissionGranted ? "Written permission recorded" : "No permission (hidden)"} checked={p.permissionGranted} disabled={!isOwner}
                onChange={async (v) => {
                  try {
                    await api(`/notable-projects/${p.id}`, { method: "PUT", json: { permissionGranted: v } });
                    flash("Permission updated");
                    load();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }} />
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

function Toggle({ label, hint, checked, disabled, onChange, compact }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; compact?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-start justify-between gap-4 ${compact ? "" : "mb-4"} ${disabled ? "cursor-not-allowed opacity-70" : ""}`}>
      <span>
        <span className="block text-sm font-medium text-charcoal">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-line transition peer-checked:bg-orange peer-focus-visible:ring-2 peer-focus-visible:ring-orange/50" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

const input = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:border-navy focus:outline-none disabled:bg-cloud";

function NotifyEmail({ value, disabled, onSave }: { value: string; disabled: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(v.trim()); }}>
      <label htmlFor="notify" className="block text-sm font-medium text-charcoal">Staff notification email</label>
      <p className="text-xs text-muted">New quote requests, messages and applications are sent here. Use a team mailbox, not a personal address.</p>
      <div className="mt-2 flex gap-2">
        <input id="notify" type="email" className={input} value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} placeholder="dispatch@express-bags.com" />
        <button className="btn-navy !py-2" disabled={disabled || v === value}>Save</button>
      </div>
    </form>
  );
}

function ThresholdForm({ values, disabled, onSave }: { values: Record<string, number | string[]>; disabled: boolean; onSave: (v: object) => void }) {
  const [v, setV] = useState(values);
  useEffect(() => setV(values), [values]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(Object.fromEntries(Object.keys(THRESHOLD_LABELS).map((k) => [k, Number(v[k])]))); }}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(THRESHOLD_LABELS).map(([k, label]) => (
          <label key={k} className="text-sm">
            <span className="font-medium text-charcoal">{label}</span>
            <input type="number" min={0} className={`${input} mt-1`} disabled={disabled} value={String(v[k] ?? "")} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />
          </label>
        ))}
      </div>
      <button className="btn-navy mt-4 !py-2" disabled={disabled}><Save className="h-4 w-4" /> Save thresholds</button>
    </form>
  );
}

function RuleEditor({ engine, rules, disabled, onSaved, onError }: { engine: "local" | "carrier" | "storage"; rules: Rules; disabled: boolean; onSaved: () => void; onError: (m: string) => void }) {
  const [draft, setDraft] = useState<Rules>(rules);
  const [advanced, setAdvanced] = useState("");
  const [preview, setPreview] = useState<unknown>(null);
  const fields = ENGINE_FIELDS[engine];
  const simpleKeys = useMemo(() => new Set(fields.map((f) => f.key)), [fields]);

  useEffect(() => {
    setDraft(rules);
    setAdvanced(JSON.stringify(Object.fromEntries(Object.entries(rules).filter(([k]) => !simpleKeys.has(k))), null, 2));
  }, [rules, simpleKeys]);

  const merged = useCallback(() => {
    let extra: Rules = {};
    try {
      extra = advanced.trim() ? JSON.parse(advanced) : {};
    } catch {
      throw new Error(`${engine}: advanced rules are not valid JSON`);
    }
    return { ...draft, ...extra };
  }, [advanced, draft, engine]);

  // Live preview (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const body = engine === "carrier" ? { engine, rules: merged(), input: SAMPLES.carrier, rates: SAMPLE_RATES } : { engine, rules: merged(), input: SAMPLES[engine] };
        const r = await api<{ result: unknown }>("/pricing-preview", { method: "POST", json: body });
        setPreview(r.result);
      } catch {
        setPreview(null);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [engine, merged]);

  async function save() {
    try {
      await api(`/pricing-rules/${engine}`, { method: "PUT", json: { rules: merged() } });
      onSaved();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  const title = { local: "Local pickup & drop-off", carrier: "Nationwide carrier shipping", storage: "Luggage storage" }[engine];
  const sampleText = {
    local: "Sample: Miami Beach → mainland cruise port, 12 mi, 4 checked + 2 carry-on",
    carrier: "Sample: client example rates UPS $82 · FedEx $76 · DHL $105 (2-day)",
    storage: "Sample: 3 pieces, 2 days, with delivery",
  }[engine];

  return (
    <Panel title={title} action={<button onClick={save} disabled={disabled} className="btn-navy !py-2"><Save className="h-4 w-4" /> Save new version</button>}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <RuleField key={f.key} def={f} value={draft[f.key]} disabled={disabled} onChange={(val) => setDraft({ ...draft, [f.key]: val })} />
            ))}
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-navy">Advanced rules (zones, categories, carriers)</summary>
            <p className="mt-1 text-xs text-muted">Money values are in cents (e.g. 2500 = $25.00). Zone pairs use &quot;ZONE_A|ZONE_B&quot;.</p>
            <textarea aria-label={`${title} advanced rules`} rows={10} spellCheck={false} disabled={disabled} value={advanced} onChange={(e) => setAdvanced(e.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-cloud p-3 font-mono text-xs focus:border-navy focus:outline-none" />
          </details>
        </div>
        <div className="min-w-0 rounded-2xl border border-dashed border-line p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Live preview</p>
          <p className="mb-3 text-xs text-muted">{sampleText}</p>
          <PreviewView engine={engine} preview={preview} />
        </div>
      </div>
    </Panel>
  );
}

function RuleField({ def, value, disabled, onChange }: { def: FieldDef; value: unknown; disabled: boolean; onChange: (v: unknown) => void }) {
  if (def.kind === "bool") {
    return (
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--color-orange)]" />
        <span className="font-medium text-charcoal">{def.label}</span>
      </label>
    );
  }
  return (
    <label className="text-sm">
      <span className="font-medium text-charcoal">{def.label}</span>
      {def.kind === "select" ? (
        <select className={`${input} mt-1`} disabled={disabled} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {def.options!.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <div className="relative mt-1">
          {def.kind === "cents" && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>}
          <input
            type="number"
            step={def.kind === "cents" ? "0.01" : "0.1"}
            min={0}
            disabled={disabled}
            className={`${input} ${def.kind === "cents" ? "pl-7" : ""} ${def.kind === "percent" ? "pr-8" : ""}`}
            value={def.kind === "cents" ? ((Number(value) || 0) / 100).toString() : String(value ?? 0)}
            onChange={(e) => onChange(def.kind === "cents" ? Math.round(Number(e.target.value) * 100) : Number(e.target.value))}
          />
          {def.kind === "percent" && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>}
        </div>
      )}
      {def.hint && <span className="mt-0.5 block text-xs text-muted">{def.hint}</span>}
    </label>
  );
}

function PreviewView({ engine, preview }: { engine: string; preview: unknown }) {
  if (!preview) return <p className="text-sm text-muted">Calculating…</p>;
  if (engine !== "carrier") return <PricingBreakdown result={preview as never} />;
  const p = preview as { status: string; reason?: string; offers?: { level: string; levelName: string; carrier: string; transitDays: number; costCents: number; retailCents: number; profitCents: number; markupPercent: number; marginPercent: number; manualReview: boolean }[] };
  if (p.status !== "priced") return <p className="text-sm text-slate-ink">Falls back to Request a Quote: {p.reason}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="uppercase tracking-wider text-muted"><tr><th className="py-1">Level</th><th>Carrier (internal)</th><th>Cost</th><th>Retail</th><th>Profit</th><th>Markup</th><th>GM</th></tr></thead>
        <tbody className="divide-y divide-line">
          {p.offers!.map((o) => (
            <tr key={o.level}>
              <td className="py-1.5 font-semibold text-navy">{o.levelName}</td>
              <td>{o.carrier}</td>
              <td>{money(o.costCents)}</td>
              <td className="font-semibold">{money(o.retailCents)}</td>
              <td>{money(o.profitCents)}</td>
              <td>{o.markupPercent}%</td>
              <td>{o.marginPercent}%{o.manualReview ? " ⚠" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
