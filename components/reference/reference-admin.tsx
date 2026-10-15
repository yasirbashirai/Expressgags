"use client";

/**
 * Markets & zones admin (Master §5.5, §5.6, §6): market tiers, editable zones and sub-zones
 * (e.g. the five Florida Keys zones), zone-pair trip prices that feed the local pricing engine
 * (each save is a new rule version), recognized locations, vehicle classes (capacities set by
 * Express Bags, never invented) and the automatic-pricing vs custom-quote thresholds.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronRight, Plus, Save, Trash2 } from "lucide-react";
import { AdminTitle, Panel, useAdminUser } from "@/components/admin/admin-shell";
import { api, type ApiError } from "@/components/admin/api";
import { Badge } from "@/components/admin/labels";
import { DataTable, EmptyState, Field, inputCls, Modal, Tabs, Toolbar } from "@/components/admin/ui";
import { ErrorNote, selectCls, useApi } from "@/components/resources/shared";
import { SERVICE_LABELS, SERVICE_TYPES } from "@/lib/quote-schema";

type Zone = { id: string; code: string; name: string; marketId: string; parentId: string | null; active: boolean; sortOrder: number; children?: Zone[] };
type Loc = { id: string; code: string; name: string; type: string; marketId: string; instructions: string | null; surchargeCents: number; active: boolean };
type Market = { id: string; slug: string; name: string; tier: string; isHq: boolean; active: boolean; sortOrder: number; zones: Zone[]; locations: Loc[] };
type VClass = { id: string; code: string; name: string; maxPieces: number | null; maxWeightLbs: number | null; sortOrder: number; active: boolean };
type Thresholds = {
  maxAutoPieces: number; maxAutoExtraStops: number; maxAutoTravelers: number; maxAutoItemWeightLbs: number; maxAutoItemLengthGirthIn: number; maxAutoOversizedPieces: number; alwaysCustomServices: string[];
};
type Overview = { markets: Market[]; vehicleClasses: VClass[]; thresholds: Thresholds };

const TIER_LABEL: Record<string, string> = { top: "Top priority", next: "Next priority", additional: "Additional focus" };
const LOC_TYPES = ["airport", "cruise-port", "hotel", "private-aviation", "venue", "business", "storage", "other"];
const LOC_LABEL: Record<string, string> = { airport: "Airport", "cruise-port": "Cruise port", hotel: "Hotel / resort", "private-aviation": "Private aviation", venue: "Venue", business: "Business", storage: "Storage", other: "Other" };
const dollars = (c: number) => (c / 100).toFixed(2);
const cents = (v: string) => Math.round(Number(v || 0) * 100);

type Tab = "markets" | "zones" | "locations" | "vehicles" | "thresholds";

export function ReferenceAdmin() {
  const params = useSearchParams();
  const router = useRouter();
  const user = useAdminUser();
  const canWrite = user?.role === "OWNER" || user?.role === "STAFF";
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "zones");
  const ov = useApi<Overview>("/reference/overview");
  const change = (t: Tab) => {
    setTab(t);
    router.replace(`/admin/reference?tab=${t}`, { scroll: false });
  };
  return (
    <>
      <AdminTitle title="Markets & zones" sub="Reference data behind quotes, dispatch and the pricing engines. Nothing here is hard-coded: Express Bags sets every value." />
      <Tabs<Tab> value={tab} onChange={change} tabs={[{ value: "zones", label: "Zones & trip prices" }, { value: "markets", label: "Markets" }, { value: "locations", label: "Recognized locations" }, { value: "vehicles", label: "Vehicle classes" }, { value: "thresholds", label: "Custom-quote thresholds" }]} />
      <ErrorNote message={ov.error} />
      {!ov.data && !ov.error && <p className="text-sm text-muted">Loading…</p>}
      {ov.data && (
        <>
          {tab === "markets" && <MarketsTab markets={ov.data.markets} canWrite={canWrite} reload={ov.reload} />}
          {tab === "zones" && <ZonesTab markets={ov.data.markets} canWrite={canWrite} reload={ov.reload} />}
          {tab === "locations" && <LocationsTab markets={ov.data.markets} canWrite={canWrite} reload={ov.reload} />}
          {tab === "vehicles" && <VehiclesTab rows={ov.data.vehicleClasses} canWrite={canWrite} reload={ov.reload} />}
          {tab === "thresholds" && <ThresholdsTab initial={ov.data.thresholds} canWrite={canWrite} reload={ov.reload} />}
        </>
      )}
    </>
  );
}

const fieldErrors = (e: unknown) => Object.fromEntries(((e as ApiError).details ?? []).map((d) => [d.path, d.message]));

/* -------------------------------- Markets -------------------------------- */

function MarketsTab({ markets, canWrite, reload }: { markets: Market[]; canWrite: boolean; reload: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const patch = async (m: Market, data: Partial<Market>) => {
    setError(null);
    try {
      await api(`/reference/markets/${m.id}`, { method: "PATCH", json: data });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <ErrorNote message={error} />
      <DataTable
        rows={markets}
        rowKey={(m) => m.id}
        columns={[
          { key: "name", header: "Market", cell: (m) => <span><span className="font-semibold text-navy">{m.name}</span>{m.isHq && <Badge className="ml-2 bg-orange-50 text-orange-700 ring-orange-200">HQ</Badge>}<span className="block text-xs text-muted">{m.slug}</span></span> },
          {
            key: "tier", header: "Tier", cell: (m) => canWrite ? (
              <select aria-label={`Tier for ${m.name}`} className={selectCls} value={m.tier} onChange={(e) => patch(m, { tier: e.target.value })}>{Object.entries(TIER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            ) : TIER_LABEL[m.tier],
          },
          { key: "zones", header: "Zones", cell: (m) => m.zones.reduce((s, z) => s + 1 + (z.children?.length ?? 0), 0) },
          { key: "locs", header: "Locations", cell: (m) => m.locations.length },
          { key: "order", header: "Order", cell: (m) => canWrite ? <input aria-label={`Sort order for ${m.name}`} type="number" className={`${selectCls} w-20`} defaultValue={m.sortOrder} onBlur={(e) => Number(e.target.value) !== m.sortOrder && patch(m, { sortOrder: Number(e.target.value) })} /> : m.sortOrder, mobile: false },
          { key: "active", header: "Active", cell: (m) => <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canWrite} checked={m.active} onChange={(e) => patch(m, { active: e.target.checked })} className="h-4 w-4 accent-[#E06010]" /> {m.active ? "Yes" : "No"}</label> },
        ]}
      />
      <p className="mt-3 text-xs text-muted">Tiers follow the owner&apos;s priority-market plan. Inactive markets stay in history but are not offered for new jobs.</p>
    </>
  );
}

/* ---------------------------- Zones & prices ----------------------------- */

type Pair = { a: string; b: string; cents: number };

function ZonesTab({ markets, canWrite, reload }: { markets: Market[]; canWrite: boolean; reload: () => void }) {
  const [marketId, setMarketId] = useState(markets[0]?.id ?? "");
  const market = markets.find((m) => m.id === marketId);
  const [zoneModal, setZoneModal] = useState<{ zone: Zone | null; parentId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allZones = useMemo(() => markets.flatMap((m) => m.zones.flatMap((z) => [{ ...z, market: m.name }, ...(z.children ?? []).map((c) => ({ ...c, market: m.name }))])), [markets]);

  const remove = async (z: Zone) => {
    if (!window.confirm(`Delete zone ${z.code}?`)) return;
    setError(null);
    try {
      await api(`/reference/zones/${z.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <Panel title="Zones" action={canWrite && market ? <button className="btn-navy !px-4 !py-2" onClick={() => setZoneModal({ zone: null, parentId: null })}><Plus className="h-4 w-4" aria-hidden /> Add zone</button> : undefined}>
        <Toolbar>
          <label htmlFor="z-market" className="sr-only">Market</label>
          <select id="z-market" className={selectCls} value={marketId} onChange={(e) => setMarketId(e.target.value)}>{markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <p className="text-xs text-muted">Sub-zones handle long corridors (the Keys run Key Largo → Key West) so trips are priced by zone, not by city.</p>
        </Toolbar>
        <ErrorNote message={error} />
        {market && market.zones.length === 0 && <EmptyState title="No zones in this market" text="Add the first zone to start pricing trips by zone." />}
        <ul className="space-y-2">
          {market?.zones.map((z) => (
            <li key={z.id} className="rounded-2xl border border-line">
              <ZoneRow z={z} canWrite={canWrite} onEdit={() => setZoneModal({ zone: z, parentId: null })} onDelete={() => remove(z)} onAddChild={() => setZoneModal({ zone: null, parentId: z.id })} />
              {z.children && z.children.length > 0 && (
                <ul className="border-t border-line bg-cloud/60">
                  {z.children.map((c) => (
                    <li key={c.id} className="border-b border-line last:border-0">
                      <ZoneRow z={c} child canWrite={canWrite} onEdit={() => setZoneModal({ zone: c, parentId: z.id })} onDelete={() => remove(c)} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      <ZonePrices zones={allZones} canWrite={canWrite} />
      {zoneModal && market && <ZoneModal market={market} zone={zoneModal.zone} parentId={zoneModal.parentId} onClose={() => setZoneModal(null)} onSaved={() => { setZoneModal(null); reload(); }} />}
    </div>
  );
}

function ZoneRow({ z, child, canWrite, onEdit, onDelete, onAddChild }: { z: Zone; child?: boolean; canWrite: boolean; onEdit: () => void; onDelete: () => void; onAddChild?: () => void }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${child ? "pl-8" : ""}`}>
      <span className="flex min-w-0 items-center gap-2">
        {child && <ChevronRight className="h-4 w-4 text-muted" aria-hidden />}
        <span className="min-w-0">
          <span className="block truncate font-medium text-navy">{z.name}</span>
          <span className="block font-mono text-xs text-muted">{z.code}{!z.active ? " · inactive" : ""}</span>
        </span>
      </span>
      {canWrite && (
        <span className="flex gap-1.5">
          {onAddChild && <button className="btn-ghost !px-3 !py-1 !text-xs" onClick={onAddChild}><Plus className="h-3.5 w-3.5" aria-hidden /> Sub-zone</button>}
          <button className="btn-ghost !px-3 !py-1 !text-xs" onClick={onEdit}>Edit</button>
          <button className="btn-ghost !px-2 !py-1 !text-xs" aria-label={`Delete ${z.code}`} onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></button>
        </span>
      )}
    </div>
  );
}

function ZoneModal({ market, zone, parentId, onClose, onSaved }: { market: Market; zone: Zone | null; parentId: string | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(zone?.code ?? "");
  const [name, setName] = useState(zone?.name ?? "");
  const [active, setActive] = useState(zone?.active ?? true);
  const [sortOrder, setSortOrder] = useState(String(zone?.sortOrder ?? 0));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const parent = market.zones.find((z) => z.id === parentId);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (zone) await api(`/reference/zones/${zone.id}`, { method: "PATCH", json: { name, active, sortOrder: Number(sortOrder) } });
      else await api("/reference/zones", { method: "POST", json: { code: code.toUpperCase(), name, marketId: market.id, parentId, sortOrder: Number(sortOrder), active } });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setErrors(fieldErrors(err));
    }
  };
  return (
    <Modal open onClose={onClose} title={zone ? `Edit ${zone.code}` : parent ? `New sub-zone of ${parent.name}` : `New zone in ${market.name}`} footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="zone-form">Save</button></>}>
      <form id="zone-form" onSubmit={save} className="grid gap-4">
        <ErrorNote message={error} />
        <Field label="Code" htmlFor="zn-code" hint="Uppercase, e.g. KEYS-MARATHON. Used in zone-pair prices." error={errors.code}><input id="zn-code" required disabled={!!zone} className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></Field>
        <Field label="Name" htmlFor="zn-name" error={errors.name}><input id="zn-name" required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Sort order" htmlFor="zn-sort"><input id="zn-sort" type="number" min={0} className={inputCls} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[#E06010]" /> Active</label>
      </form>
    </Modal>
  );
}

function ZonePrices({ zones, canWrite }: { zones: (Zone & { market: string })[]; canWrite: boolean }) {
  const { data, error, reload } = useApi<{ sameZoneBase: number; perMile: number; minimumMilesCharged: number; pairs: Pair[]; version: number }>("/reference/zone-prices");
  const [base, setBase] = useState({ sameZoneBase: "", perMile: "", minimumMilesCharged: "" });
  const [pairs, setPairs] = useState<{ a: string; b: string; price: string }[]>([]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const versions = useApi<{ versions: { id: string; version: number; active: boolean; note: string | null; createdBy: string | null; createdAt: string }[] }>("/reference/rule-versions?engine=local");

  useEffect(() => {
    if (!data) return;
    setBase({ sameZoneBase: dollars(data.sameZoneBase), perMile: dollars(data.perMile), minimumMilesCharged: String(data.minimumMilesCharged) });
    setPairs(data.pairs.map((p) => ({ a: p.a, b: p.b, price: dollars(p.cents) })));
  }, [data]);

  const zoneLabel = (code: string) => {
    const z = zones.find((x) => x.code === code);
    return z ? `${z.name} (${z.market})` : code;
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      const r = await api<{ version: number }>("/reference/zone-prices", {
        method: "PUT",
        json: { sameZoneBase: cents(base.sameZoneBase), perMile: cents(base.perMile), minimumMilesCharged: Number(base.minimumMilesCharged), pairs: pairs.filter((p) => p.a && p.b).map((p) => ({ a: p.a, b: p.b, cents: cents(p.price) })), note: note || undefined },
      });
      setMsg(`Saved as local pricing rules version ${r.version}. Earlier versions are kept.`);
      setNote("");
      reload();
      versions.reload();
    } catch (e2) {
      setErr((e2 as Error).message);
    }
  };
  const zoneOptions = zones.filter((z) => z.active);
  return (
    <Panel title="Trip prices (local pricing engine)">
      <ErrorNote message={error ?? err} />
      {msg && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{msg}</p>}
      {data && (
        <form onSubmit={save} className="space-y-5">
          <p className="text-sm text-slate-ink">How a local trip is priced: both ends in the same zone → same-zone base; a priced zone pair → that price; otherwise distance × per-mile (with a minimum). Piece, vehicle, location and timing rules are in Settings &amp; pricing. Current version: {data.version || "defaults"}.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Same-zone base ($)" htmlFor="zp-same"><input id="zp-same" type="number" min={0} step="0.01" disabled={!canWrite} className={inputCls} value={base.sameZoneBase} onChange={(e) => setBase({ ...base, sameZoneBase: e.target.value })} /></Field>
            <Field label="Per mile ($)" htmlFor="zp-mile"><input id="zp-mile" type="number" min={0} step="0.01" disabled={!canWrite} className={inputCls} value={base.perMile} onChange={(e) => setBase({ ...base, perMile: e.target.value })} /></Field>
            <Field label="Minimum miles charged" htmlFor="zp-min"><input id="zp-min" type="number" min={0} disabled={!canWrite} className={inputCls} value={base.minimumMilesCharged} onChange={(e) => setBase({ ...base, minimumMilesCharged: e.target.value })} /></Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-navy">Zone-pair prices (either direction)</p>
            {pairs.length === 0 && <p className="mb-2 text-sm text-muted">No zone pairs priced yet: trips between zones use distance.</p>}
            <ul className="space-y-2">
              {pairs.map((p, i) => (
                <li key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
                  <label className="sr-only" htmlFor={`pa-${i}`}>From zone</label>
                  <select id={`pa-${i}`} disabled={!canWrite} className={selectCls} value={p.a} onChange={(e) => setPairs(pairs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))}>
                    <option value="">From zone…</option>{zoneOptions.map((z) => <option key={z.code} value={z.code}>{zoneLabel(z.code)}</option>)}
                  </select>
                  <label className="sr-only" htmlFor={`pb-${i}`}>To zone</label>
                  <select id={`pb-${i}`} disabled={!canWrite} className={selectCls} value={p.b} onChange={(e) => setPairs(pairs.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)))}>
                    <option value="">To zone…</option>{zoneOptions.map((z) => <option key={z.code} value={z.code}>{zoneLabel(z.code)}</option>)}
                  </select>
                  <label className="sr-only" htmlFor={`pp-${i}`}>Price</label>
                  <input id={`pp-${i}`} type="number" min={0} step="0.01" disabled={!canWrite} className={selectCls} placeholder="$" value={p.price} onChange={(e) => setPairs(pairs.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
                  {canWrite && <button type="button" aria-label="Remove pair" className="rounded-lg p-2 text-muted hover:bg-cloud" onClick={() => setPairs(pairs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>}
                </li>
              ))}
            </ul>
            {canWrite && <button type="button" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-orange-700" onClick={() => setPairs([...pairs, { a: "", b: "", price: "" }])}><Plus className="h-4 w-4" aria-hidden /> Add zone pair</button>}
          </div>
          {canWrite && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[16rem] flex-1"><Field label="What changed? (saved with the version)" htmlFor="zp-note"><input id="zp-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
              <button className="btn-primary"><Save className="h-4 w-4" aria-hidden /> Save as new version</button>
            </div>
          )}
        </form>
      )}
      {versions.data && versions.data.versions.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-navy">Version history ({versions.data.versions.length})</summary>
          <ul className="mt-2 divide-y divide-line text-sm">
            {versions.data.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>v{v.version}{v.active && <Badge className="ml-2 bg-emerald-50 text-emerald-800 ring-emerald-200">Active</Badge>} <span className="text-slate-ink">{v.note ?? ""}</span></span>
                <span className="text-xs text-muted">{v.createdBy ?? "system"} · {new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

/* ---------------------------- Recognized locations ------------------------ */

function LocationsTab({ markets, canWrite, reload }: { markets: Market[]; canWrite: boolean; reload: () => void }) {
  const [editing, setEditing] = useState<Loc | "new" | null>(null);
  const [type, setType] = useState("");
  const rows = markets.flatMap((m) => m.locations.map((l) => ({ ...l, market: m.name }))).filter((l) => !type || l.type === type);
  return (
    <>
      <Toolbar>
        {canWrite && <button className="btn-navy !px-4 !py-2" onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden /> Add location</button>}
        <label htmlFor="rl-type" className="sr-only">Type</label>
        <select id="rl-type" className={selectCls} value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{LOC_TYPES.map((t) => <option key={t} value={t}>{LOC_LABEL[t]}</option>)}</select>
        <p className="text-xs text-muted">Frequently served hotels, terminals and venues with their own instructions and price adjustments (staff only).</p>
      </Toolbar>
      <DataTable
        rows={rows}
        rowKey={(l) => l.id}
        onRowClick={canWrite ? (l) => setEditing(l) : undefined}
        empty={<EmptyState title="No locations" text="Add a hotel, terminal or venue you serve often." />}
        columns={[
          { key: "n", header: "Location", cell: (l) => <span><span className="font-semibold text-navy">{l.name}</span><span className="block font-mono text-xs text-muted">{l.code}</span></span> },
          { key: "t", header: "Type", cell: (l) => LOC_LABEL[l.type] ?? l.type },
          { key: "m", header: "Market", cell: (l) => l.market },
          { key: "s", header: "Surcharge", cell: (l) => (l.surchargeCents ? `$${dollars(l.surchargeCents)}` : "-") },
          { key: "i", header: "Instructions", cell: (l) => <span className="line-clamp-2 text-sm text-slate-ink">{l.instructions ?? "-"}</span>, mobile: false },
          { key: "a", header: "Active", cell: (l) => (l.active ? "Yes" : "No") },
        ]}
      />
      {editing && <LocationModal markets={markets} initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function LocationModal({ markets, initial, onClose, onSaved }: { markets: Market[]; initial: Loc | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ code: initial?.code ?? "", name: initial?.name ?? "", type: initial?.type ?? "hotel", marketId: initial?.marketId ?? markets[0]?.id ?? "", instructions: initial?.instructions ?? "", surcharge: dollars(initial?.surchargeCents ?? 0), active: initial?.active ?? true });
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const body = { name: f.name, type: f.type, marketId: f.marketId, instructions: f.instructions || null, surchargeCents: cents(f.surcharge), active: f.active };
      if (initial) await api(`/reference/locations/${initial.id}`, { method: "PATCH", json: body });
      else await api("/reference/locations", { method: "POST", json: { ...body, code: f.code } });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setErrors(fieldErrors(err));
    }
  };
  return (
    <Modal open onClose={onClose} title={initial ? `Edit ${initial.name}` : "Add recognized location"} footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="rl-form">Save</button></>}>
      <form id="rl-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorNote message={error} /></div>
        <div className="sm:col-span-2"><Field label="Name" htmlFor="rlf-name" error={errors.name}><input id="rlf-name" required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field></div>
        <Field label="Code" htmlFor="rlf-code" hint="Letters, numbers, dashes" error={errors.code}><input id="rlf-code" required disabled={!!initial} className={inputCls} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <Field label="Type" htmlFor="rlf-type"><select id="rlf-type" className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{LOC_TYPES.map((t) => <option key={t} value={t}>{LOC_LABEL[t]}</option>)}</select></Field>
        <Field label="Market" htmlFor="rlf-market"><select id="rlf-market" className={inputCls} value={f.marketId} onChange={(e) => setF({ ...f, marketId: e.target.value })}>{markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Price adjustment ($)" htmlFor="rlf-sur" hint="Added to local trips at this location"><input id="rlf-sur" type="number" min={0} step="0.01" className={inputCls} value={f.surcharge} onChange={(e) => setF({ ...f, surcharge: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="Instructions & access notes (staff only)" htmlFor="rlf-ins" hint="Loading dock, bell desk contact, terminal rules, parking"><textarea id="rlf-ins" rows={3} className={inputCls} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="h-4 w-4 accent-[#E06010]" /> Active</label>
      </form>
    </Modal>
  );
}

/* ----------------------------- Vehicle classes ---------------------------- */

function VehiclesTab({ rows, canWrite, reload }: { rows: VClass[]; canWrite: boolean; reload: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const patch = async (v: VClass, data: Partial<VClass>) => {
    setError(null);
    try {
      await api(`/reference/vehicle-classes/${v.id}`, { method: "PATCH", json: data });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return (
    <>
      <Toolbar>
        {canWrite && <button className="btn-navy !px-4 !py-2" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden /> Add vehicle class</button>}
        <p className="text-xs text-muted">Leave capacity blank until Express Bags confirms real numbers: the platform never invents luggage-count capacities.</p>
      </Toolbar>
      <ErrorNote message={error} />
      <DataTable
        rows={rows}
        rowKey={(v) => v.id}
        columns={[
          { key: "n", header: "Class", cell: (v) => <span><span className="font-semibold text-navy">{v.name}</span><span className="block font-mono text-xs text-muted">{v.code}</span></span> },
          { key: "p", header: "Max pieces", cell: (v) => (canWrite ? <input aria-label={`Max pieces for ${v.name}`} type="number" min={1} className={`${selectCls} w-28`} placeholder="Not set" defaultValue={v.maxPieces ?? ""} onBlur={(e) => num(e.target.value) !== v.maxPieces && patch(v, { maxPieces: num(e.target.value) })} /> : v.maxPieces ?? "Not set") },
          { key: "w", header: "Max weight (lbs)", cell: (v) => (canWrite ? <input aria-label={`Max weight for ${v.name}`} type="number" min={1} className={`${selectCls} w-28`} placeholder="Not set" defaultValue={v.maxWeightLbs ?? ""} onBlur={(e) => num(e.target.value) !== v.maxWeightLbs && patch(v, { maxWeightLbs: num(e.target.value) })} /> : v.maxWeightLbs ?? "Not set") },
          { key: "a", header: "Active", cell: (v) => <input type="checkbox" aria-label={`${v.name} active`} disabled={!canWrite} checked={v.active} onChange={(e) => patch(v, { active: e.target.checked })} className="h-4 w-4 accent-[#E06010]" /> },
        ]}
      />
      {adding && <VehicleModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </>
  );
}

function VehicleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api("/reference/vehicle-classes", { method: "POST", json: { code, name } });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Modal open onClose={onClose} title="Add vehicle class" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="vc-form">Save</button></>}>
      <form id="vc-form" onSubmit={save} className="grid gap-4">
        <ErrorNote message={error} />
        <Field label="Code" htmlFor="vc-code" hint="lowercase, e.g. sprinter"><input id="vc-code" required className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} /></Field>
        <Field label="Name" htmlFor="vc-name"><input id="vc-name" required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

/* ------------------------------- Thresholds ------------------------------- */

const THRESHOLD_HELP: { key: Exclude<keyof Thresholds, "alwaysCustomServices">; label: string; help: string }[] = [
  { key: "maxAutoPieces", label: "Maximum pieces for automatic pricing", help: "Requests with more pieces go to a custom quotation (group and fleet-scale jobs)." },
  { key: "maxAutoExtraStops", label: "Maximum extra stops", help: "Multi-location jobs above this need logistics planning." },
  { key: "maxAutoTravelers", label: "Maximum travelers", help: "Group movements above this are quoted manually." },
  { key: "maxAutoOversizedPieces", label: "Maximum oversized / special pieces", help: "Unusual items above this need a size and handling review." },
  { key: "maxAutoItemWeightLbs", label: "Maximum weight per item (lbs)", help: "Heavier single items need special handling." },
  { key: "maxAutoItemLengthGirthIn", label: "Maximum length + girth per item (inches)", help: "Larger items need a vehicle and access check." },
];

function ThresholdsTab({ initial, canWrite, reload }: { initial: Thresholds; canWrite: boolean; reload: () => void }) {
  const [t, setT] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);
    try {
      await api("/reference/thresholds", { method: "PUT", json: t });
      setMsg("Thresholds saved. New quote requests are routed with these values.");
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Panel title="When automatic pricing stops and a custom quotation starts">
      <form onSubmit={save} className="space-y-5">
        <ErrorNote message={error} />
        {msg && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{msg}</p>}
        <p className="text-sm text-slate-ink">Any request above one of these limits is routed to a custom quotation so dispatch can plan trucks, drivers, helpers, timing and staging. Applies to every service except those always quoted manually.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {THRESHOLD_HELP.map((h) => (
            <Field key={h.key} label={h.label} htmlFor={`th-${h.key}`} hint={h.help}>
              <input id={`th-${h.key}`} type="number" min={0} disabled={!canWrite} className={inputCls} value={t[h.key]} onChange={(e) => setT({ ...t, [h.key]: Number(e.target.value) })} />
            </Field>
          ))}
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-navy">Always quoted manually</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {SERVICE_TYPES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm text-slate-ink">
                <input type="checkbox" disabled={!canWrite} className="h-4 w-4 accent-[#E06010]" checked={t.alwaysCustomServices.includes(s)} onChange={(e) => setT({ ...t, alwaysCustomServices: e.target.checked ? [...t.alwaysCustomServices, s] : t.alwaysCustomServices.filter((x) => x !== s) })} />
                {SERVICE_LABELS[s]}
              </label>
            ))}
          </div>
        </fieldset>
        {canWrite && <button className="btn-primary"><Save className="h-4 w-4" aria-hidden /> Save thresholds</button>}
      </form>
    </Panel>
  );
}
