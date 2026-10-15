"use client";

/**
 * Storage operations admin (Master §7): Today (intakes, releases, occupancy, overstays), capacity
 * calendar (reserved vs capacity per hour block or day), bookings list and storage locations.
 * Every time is shown and entered in Miami time.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlarmClock, ArrowDownToLine, ArrowUpFromLine, Boxes, Plus, RefreshCw, Warehouse } from "lucide-react";
import { AdminTitle, Panel } from "@/components/admin/admin-shell";
import { api, ApiError, money } from "@/components/admin/api";
import { Badge } from "@/components/admin/labels";
import { DataTable, EmptyState, Field, inputCls, Modal, StatCard, Tabs, Toolbar } from "@/components/admin/ui";
import { ErrorNote, fromZonedInput, MARKET_OPTIONS, marketName, selectCls, useApi, zonedInput, zonedTime } from "@/components/resources/shared";

export type Location = { id: string; code: string; name: string; market: string; capacityPieces: number; addressPrivate: string | null; active: boolean; rules: { blockHours?: number } | null };
type BookingRow = {
  id: string; reference: string; status: string; startsAt: string; endsAt: string; pieces: number; retailCents: number | null; withPickup: boolean; withDelivery: boolean;
  combination: string | null; contactName: string | null; overstayHours: number; location: { name: string; code: string }; order: { reference: string } | null;
};
type Dash = {
  date: string;
  intakes: (BookingRow & { location: { name: string } })[];
  releases: (BookingRow & { location: { name: string } })[];
  overstays: (BookingRow & { location: { name: string } })[];
  occupancy: { id: string; name: string; code: string; market: string; capacity: number; held: number; percent: number }[];
};

export const STATUS_STYLE: Record<string, string> = {
  RESERVED: "bg-navy-50 text-navy ring-navy-100",
  CHECKED_IN: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  OVERSTAY: "bg-rose-50 text-rose-800 ring-rose-200",
  RELEASED: "bg-cloud text-muted ring-line",
  CANCELLED: "bg-cloud text-muted ring-line",
};
export const STATUS_LABEL: Record<string, string> = { RESERVED: "Reserved", CHECKED_IN: "In storage", OVERSTAY: "Overstay", RELEASED: "Released", CANCELLED: "Cancelled" };
export const COMBO_LABEL: Record<string, string> = {
  "storage-only": "Storage only",
  "pickup-storage": "Pickup + storage",
  "storage-delivery": "Storage + delivery",
  "pickup-storage-delivery": "Door to door",
  "storage-shipping": "Storage + shipping",
};
export const StorageStatus = ({ status }: { status: string }) => <Badge className={STATUS_STYLE[status] ?? "bg-cloud ring-line"}>{STATUS_LABEL[status] ?? status}</Badge>;
export const miami = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

type Tab = "today" | "calendar" | "bookings" | "locations";

export function StorageAdmin() {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "today");
  const [newOpen, setNewOpen] = useState(false);
  const locs = useApi<{ locations: Location[] }>("/storage/locations");
  const change = (t: Tab) => {
    setTab(t);
    router.replace(`/admin/storage?tab=${t}`, { scroll: false });
  };

  return (
    <>
      <AdminTitle
        title="Storage"
        sub="Capacity-managed luggage storage: intake, chain of custody, release and overstays. Times in Miami."
        actions={<button className="btn-primary" onClick={() => setNewOpen(true)} disabled={!locs.data?.locations.some((l) => l.active)}><Plus className="h-4 w-4" aria-hidden /> New booking</button>}
      />
      <Tabs<Tab> value={tab} onChange={change} tabs={[{ value: "today", label: "Today" }, { value: "calendar", label: "Capacity calendar" }, { value: "bookings", label: "Bookings" }, { value: "locations", label: "Locations", count: locs.data?.locations.length }]} />
      {tab === "today" && <TodayTab onNew={() => setNewOpen(true)} hasLocations={!!locs.data?.locations.length} />}
      {tab === "calendar" && <CalendarTab locations={locs.data?.locations ?? []} />}
      {tab === "bookings" && <BookingsTab locations={locs.data?.locations ?? []} />}
      {tab === "locations" && <LocationsTab rows={locs.data?.locations ?? null} error={locs.error} reload={locs.reload} />}
      {newOpen && <NewBookingModal locations={(locs.data?.locations ?? []).filter((l) => l.active)} onClose={() => setNewOpen(false)} />}
    </>
  );
}

/* --------------------------------- Today -------------------------------- */

function TodayTab({ onNew, hasLocations }: { onNew: () => void; hasLocations: boolean }) {
  const { data, error, reload } = useApi<Dash>("/storage/dashboard");
  const [sweeping, setSweeping] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const sweep = async () => {
    setSweeping(true);
    try {
      const r = await api<{ overstays: number; reminders: number }>("/storage/sweep", { method: "POST" });
      setNote(`${r.overstays} new overstay(s) flagged, ${r.reminders} retrieval reminder(s) created.`);
      reload();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setSweeping(false);
    }
  };
  if (error) return <ErrorNote message={error} />;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  if (!hasLocations && !data.occupancy.length) {
    return <EmptyState title="No storage locations yet" text="Add a storage location with its capacity (set by Express Bags) before taking bookings." action={<Link href="/admin/storage?tab=locations" className="btn-primary">Add a location</Link>} />;
  }
  const held = data.occupancy.reduce((s, o) => s + o.held, 0);
  const cap = data.occupancy.reduce((s, o) => s + o.capacity, 0);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Intakes today" value={data.intakes.length} Icon={ArrowDownToLine} hint="Reserved drop-offs and pickups" />
        <StatCard label="Releases today" value={data.releases.length} Icon={ArrowUpFromLine} hint="Retrievals and deliveries due" />
        <StatCard label="Occupancy now" value={cap ? `${Math.round((held / cap) * 100)}%` : "-"} Icon={Boxes} hint={`${held} of ${cap} spaces in use`} tone="navy" />
        <StatCard label="Overstays" value={data.overstays.length} Icon={AlarmClock} tone={data.overstays.length ? "orange" : "white"} hint="Past their booked retrieval" />
      </div>

      <Panel title="Occupancy by location" action={<button className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={sweep} disabled={sweeping}><RefreshCw className="h-3.5 w-3.5" aria-hidden /> {sweeping ? "Checking…" : "Check overstays & reminders"}</button>}>
        {note && <p className="mb-3 rounded-xl bg-navy-50 px-3 py-2 text-sm text-navy" role="status">{note}</p>}
        <ul className="grid gap-4 md:grid-cols-2">
          {data.occupancy.map((o) => (
            <li key={o.id} className="rounded-2xl border border-line p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold text-navy">{o.name}</p>
                <p className="text-sm text-slate-ink">{o.held} / {o.capacity}</p>
              </div>
              <p className="text-xs text-muted">{marketName(o.market)}</p>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-cloud" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={o.percent} aria-label={`${o.name} occupancy`}>
                <div className={`h-full rounded-full ${o.percent >= 90 ? "bg-rose-600" : o.percent >= 70 ? "bg-orange" : "bg-navy"}`} style={{ width: `${Math.min(100, o.percent)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Intakes today" action={<button className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={onNew}><Plus className="h-3.5 w-3.5" aria-hidden /> Book</button>}>
          <MiniList rows={data.intakes} when={(b) => zonedTime(b.startsAt)} empty="No intakes scheduled today." />
        </Panel>
        <Panel title="Releases today">
          <MiniList rows={data.releases} when={(b) => zonedTime(b.endsAt)} empty="No releases due today." />
        </Panel>
      </div>
      {data.overstays.length > 0 && (
        <Panel title="Overstays needing action">
          <MiniList rows={data.overstays} when={(b) => `${b.overstayHours} h late`} empty="" danger />
        </Panel>
      )}
    </div>
  );
}

function MiniList({ rows, when, empty, danger }: { rows: (BookingRow & { location: { name: string } })[]; when: (b: BookingRow) => string; empty: string; danger?: boolean }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((b) => (
        <li key={b.id}>
          <Link href={`/admin/storage/bookings/${b.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-navy-50/40">
            <span className="min-w-0">
              <span className="block truncate font-medium text-navy">{b.contactName ?? b.order?.reference ?? b.reference}</span>
              <span className="block text-xs text-muted">{b.reference} · {b.pieces} pc · {b.location.name}</span>
            </span>
            <span className={`shrink-0 text-sm font-semibold ${danger ? "text-rose-700" : "text-slate-ink"}`}>{when(b)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------- Calendar ------------------------------- */

function CalendarTab({ locations }: { locations: Location[] }) {
  const active = locations.filter((l) => l.active);
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState(() => zonedInput(new Date()).slice(0, 10));
  const [view, setView] = useState<"day" | "week">("day");
  const id = locationId || active[0]?.id || "";
  const { data, error } = useApi<{ location: { name: string; capacity: number }; blocks: { start: string; end: string; peak: number; capacity: number; available: number }[]; peak: number }>(id ? `/storage/calendar?locationId=${id}&date=${date}&view=${view}` : null);
  if (!active.length) return <EmptyState title="No active storage locations" text="Add a location on the Locations tab first." />;
  const label = (iso: string) => (view === "week" ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" }) : zonedTime(iso));
  return (
    <Panel>
      <Toolbar>
        <label className="sr-only" htmlFor="cal-loc">Location</label>
        <select id="cal-loc" className={selectCls} value={id} onChange={(e) => setLocationId(e.target.value)}>
          {active.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="cal-date">Date</label>
        <input id="cal-date" type="date" className={selectCls} value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex rounded-full border border-line p-0.5">
          {(["day", "week"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`rounded-full px-3 py-1 text-sm ${view === v ? "bg-navy text-white" : "text-slate-ink"}`}>{v === "day" ? "Day" : "Week"}</button>
          ))}
        </div>
      </Toolbar>
      <ErrorNote message={error} />
      {data && (
        <>
          <p className="mb-4 text-sm text-slate-ink">Peak {data.peak} of {data.location.capacity} spaces · {view === "day" ? "per hour block" : "per day"} · bookings never exceed capacity at any moment.</p>
          <ol className="space-y-1.5">
            {data.blocks.map((b) => {
              const pct = b.capacity ? Math.round((b.peak / b.capacity) * 100) : 0;
              return (
                <li key={b.start} className="grid grid-cols-[4.5rem_1fr_4.5rem] items-center gap-3 text-sm sm:grid-cols-[7rem_1fr_6rem]">
                  <span className="text-xs text-muted">{label(b.start)}</span>
                  <span className="h-5 overflow-hidden rounded-md bg-cloud" aria-label={`${label(b.start)}: ${b.peak} of ${b.capacity} reserved`}>
                    <span className={`block h-full ${pct >= 100 ? "bg-rose-600" : pct >= 75 ? "bg-orange" : "bg-navy"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </span>
                  <span className={`text-right text-xs font-semibold ${b.available === 0 ? "text-rose-700" : "text-slate-ink"}`}>{b.available === 0 ? "Full" : `${b.available} free`}</span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </Panel>
  );
}

/* ------------------------------- Bookings ------------------------------- */

function BookingsTab({ locations }: { locations: Location[] }) {
  const router = useRouter();
  const [status, setStatus] = useState("active");
  const [locationId, setLocationId] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const path = useMemo(() => `/storage/bookings?${new URLSearchParams({ ...(status ? { status } : {}), ...(locationId ? { locationId } : {}), ...(query ? { q: query } : {}) })}`, [status, locationId, query]);
  const { data, error } = useApi<{ bookings: BookingRow[]; total: number }>(path);
  return (
    <>
      <Toolbar>
        <form className="flex min-w-0 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
          <label className="sr-only" htmlFor="st-q">Search bookings</label>
          <input id="st-q" className={`${inputCls} max-w-xs`} placeholder="Reference, order or name" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-ghost !px-4 !py-2">Search</button>
        </form>
        <label className="sr-only" htmlFor="st-status">Status</label>
        <select id="st-status" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active (reserved, in storage, overstay)</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          <option value="">All</option>
        </select>
        <label className="sr-only" htmlFor="st-loc">Location</label>
        <select id="st-loc" className={selectCls} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">All locations</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Toolbar>
      <ErrorNote message={error} />
      {data && (
        <DataTable
          rows={data.bookings}
          rowKey={(b) => b.id}
          onRowClick={(b) => router.push(`/admin/storage/bookings/${b.id}`)}
          empty={<EmptyState title="No bookings match" text="Change the filters or create a booking." />}
          columns={[
            { key: "ref", header: "Booking", cell: (b) => <span><span className="whitespace-nowrap font-semibold text-navy">{b.reference}</span>{b.order && <span className="block whitespace-nowrap text-xs text-muted">Order {b.order.reference}</span>}</span> },
            { key: "who", header: "Customer", cell: (b) => b.contactName ?? "-" },
            { key: "when", header: "Drop-off → retrieval", cell: (b) => <span className="text-sm"><span className="whitespace-nowrap">{miami(b.startsAt)}</span> → <span className="whitespace-nowrap">{miami(b.endsAt)}</span></span> },
            { key: "pc", header: "Pieces", cell: (b) => b.pieces },
            { key: "combo", header: "Type", cell: (b) => COMBO_LABEL[b.combination ?? ""] ?? "-", mobile: false },
            { key: "loc", header: "Location", cell: (b) => b.location.name, mobile: false },
            { key: "st", header: "Status", cell: (b) => <span className="inline-flex items-center gap-1.5"><StorageStatus status={b.status} />{b.overstayHours > 0 && <span className="text-xs font-semibold text-rose-700">{b.overstayHours} h late</span>}</span> },
            { key: "price", header: "Price", cell: (b) => money(b.retailCents), className: "text-right" },
          ]}
        />
      )}
    </>
  );
}

/* ------------------------------- Locations ------------------------------ */

function LocationsTab({ rows, error, reload }: { rows: Location[] | null; error: string | null; reload: () => void }) {
  const [editing, setEditing] = useState<Location | "new" | null>(null);
  return (
    <>
      <Toolbar>
        <button className="btn-navy !px-4 !py-2" onClick={() => setEditing("new")}><Warehouse className="h-4 w-4" aria-hidden /> Add location</button>
        <p className="text-xs text-muted">Capacity is the maximum number of pieces held at once, set by Express Bags. Addresses are private (shared with booked customers only).</p>
      </Toolbar>
      <ErrorNote message={error} />
      {rows && (
        <DataTable
          rows={rows}
          rowKey={(l) => l.id}
          onRowClick={(l) => setEditing(l)}
          empty={<EmptyState title="No storage locations" text="Add the first storage location and its capacity." />}
          columns={[
            { key: "name", header: "Location", cell: (l) => <span><span className="font-semibold text-navy">{l.name}</span><span className="block text-xs text-muted">{l.code}</span></span> },
            { key: "market", header: "Market", cell: (l) => marketName(l.market) },
            { key: "cap", header: "Capacity", cell: (l) => `${l.capacityPieces} pieces` },
            { key: "addr", header: "Private address", cell: (l) => l.addressPrivate ?? <span className="text-muted">Not set</span>, mobile: false },
            { key: "active", header: "Status", cell: (l) => (l.active ? <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-200">Active</Badge> : <Badge className="bg-cloud text-muted ring-line">Inactive</Badge>) },
          ]}
        />
      )}
      {editing && <LocationModal initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function LocationModal({ initial, onClose, onSaved }: { initial: Location | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    market: initial?.market ?? "miami",
    capacityPieces: String(initial?.capacityPieces ?? ""),
    blockHours: String(initial?.rules?.blockHours ?? 1),
    addressPrivate: initial?.addressPrivate ?? "",
    active: initial?.active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { code: form.code, name: form.name, market: form.market, capacityPieces: Number(form.capacityPieces), rules: { blockHours: Number(form.blockHours) || 1 }, addressPrivate: form.addressPrivate || null, active: form.active };
      await api(initial ? `/storage/locations/${initial.id}` : "/storage/locations", { method: initial ? "PATCH" : "POST", json: body });
      onSaved();
    } catch (err) {
      const ae = err as ApiError;
      setError(ae.message);
      setErrors(Object.fromEntries((ae.details ?? []).map((d) => [d.path, d.message])));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={initial ? `Edit ${initial.name}` : "Add storage location"} footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="loc-form" disabled={busy}>{busy ? "Saving…" : "Save"}</button></>}>
      <form id="loc-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <ErrorNote message={error} />
        <div className="sm:col-span-2"><Field label="Name" htmlFor="l-name" error={errors.name}><input id="l-name" required className={inputCls} value={form.name} onChange={set("name")} /></Field></div>
        <Field label="Code" htmlFor="l-code" hint="lowercase, e.g. mia-hub" error={errors.code}><input id="l-code" required disabled={!!initial} className={inputCls} value={form.code} onChange={set("code")} /></Field>
        <Field label="Market" htmlFor="l-market"><select id="l-market" className={inputCls} value={form.market} onChange={set("market")}>{MARKET_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
        <Field label="Capacity (pieces held at once)" htmlFor="l-cap" error={errors.capacityPieces}><input id="l-cap" required type="number" min={0} className={inputCls} value={form.capacityPieces} onChange={set("capacityPieces")} /></Field>
        <Field label="Calendar block (hours)" htmlFor="l-block" hint="Day view granularity"><select id="l-block" className={inputCls} value={form.blockHours} onChange={set("blockHours")}>{[1, 2, 3, 4, 6].map((h) => <option key={h} value={h}>{h}</option>)}</select></Field>
        <div className="sm:col-span-2"><Field label="Private address (staff only)" htmlFor="l-addr" hint="Never shown on the website; shared with booked customers only"><input id="l-addr" className={inputCls} value={form.addressPrivate} onChange={set("addressPrivate")} /></Field></div>
        <label className="flex items-center gap-2 text-sm text-slate-ink sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="h-4 w-4 accent-[#E06010]" /> Active (accepts bookings)</label>
      </form>
    </Modal>
  );
}

/* ------------------------------ New booking ----------------------------- */

type OrderHit = { id: string; reference: string; status: string; customer: { name: string }; _count: { pieces: number } };

function NewBookingModal({ locations, onClose }: { locations: Location[]; onClose: () => void }) {
  const router = useRouter();
  const now = new Date();
  const start = new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);
  const [form, setForm] = useState({
    locationId: locations[0]?.id ?? "",
    combination: "storage-only",
    startsAt: zonedInput(start),
    endsAt: zonedInput(new Date(start.getTime() + 6 * 3_600_000)),
    pieces: "2",
    oversizedPieces: "0",
    afterHours: false,
    linkOrder: false,
    orderRef: "",
    orderId: "",
    name: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [hits, setHits] = useState<OrderHit[]>([]);
  const [price, setPrice] = useState<{ retailCents: number; costCents: number; marginPercent: number; manualReview: boolean; notes: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Live internal price preview from the admin storage rules
  useEffect(() => {
    const t = setTimeout(() => {
      if (!form.startsAt || !form.endsAt || !(Number(form.pieces) > 0)) return setPrice(null);
      api<{ price: typeof price }>("/storage/quote", { method: "POST", json: { startsAt: fromZonedInput(form.startsAt), endsAt: fromZonedInput(form.endsAt), pieces: Number(form.pieces), oversizedPieces: Number(form.oversizedPieces) || 0, combination: form.combination, afterHours: form.afterHours } })
        .then((r) => setPrice(r.price))
        .catch(() => setPrice(null));
    }, 300);
    return () => clearTimeout(t);
  }, [form.startsAt, form.endsAt, form.pieces, form.oversizedPieces, form.combination, form.afterHours]);

  const findOrder = async () => {
    if (form.orderRef.trim().length < 3) return;
    const r = await api<{ orders: OrderHit[] }>(`/storage/order-lookup?ref=${encodeURIComponent(form.orderRef.trim())}`).catch(() => ({ orders: [] }));
    setHits(r.orders);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const body = {
        locationId: form.locationId,
        combination: form.combination,
        startsAt: fromZonedInput(form.startsAt),
        endsAt: fromZonedInput(form.endsAt),
        pieces: Number(form.pieces),
        oversizedPieces: Number(form.oversizedPieces) || 0,
        afterHours: form.afterHours,
        notes: form.notes,
        ...(form.linkOrder && form.orderId ? { orderId: form.orderId } : { contact: { name: form.name, email: form.email, phone: form.phone } }),
      };
      const r = await api<{ booking: { id: string } }>("/storage/bookings", { method: "POST", json: body });
      router.push(`/admin/storage/bookings/${r.booking.id}`);
    } catch (err) {
      const ae = err as ApiError;
      setError(ae.message);
      setErrors(Object.fromEntries((ae.details ?? []).map((d) => [d.path, d.message])));
      setBusy(false);
    }
  };

  return (
    <Modal wide open onClose={onClose} title="New storage booking" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" form="new-booking" disabled={busy}>{busy ? "Checking capacity…" : "Create booking"}</button></>}>
      <form id="new-booking" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {error && <div className="sm:col-span-2"><ErrorNote message={error} /></div>}
        <Field label="Location" htmlFor="b-loc"><select id="b-loc" className={inputCls} value={form.locationId} onChange={set("locationId")}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.capacityPieces})</option>)}</select></Field>
        <Field label="Service combination" htmlFor="b-combo"><select id="b-combo" className={inputCls} value={form.combination} onChange={set("combination")}>{Object.entries(COMBO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Drop-off / intake (Miami time)" htmlFor="b-start" error={errors.startsAt}><input id="b-start" type="datetime-local" required className={inputCls} value={form.startsAt} onChange={set("startsAt")} /></Field>
        <Field label="Retrieval / release (Miami time)" htmlFor="b-end" error={errors.endsAt}><input id="b-end" type="datetime-local" required className={inputCls} value={form.endsAt} onChange={set("endsAt")} /></Field>
        <Field label="Pieces" htmlFor="b-pieces" error={errors.pieces}><input id="b-pieces" type="number" min={1} required className={inputCls} value={form.pieces} onChange={set("pieces")} /></Field>
        <Field label="Of which oversized" htmlFor="b-over"><input id="b-over" type="number" min={0} className={inputCls} value={form.oversizedPieces} onChange={set("oversizedPieces")} /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-ink sm:col-span-2"><input type="checkbox" checked={form.afterHours} onChange={(e) => setForm((f) => ({ ...f, afterHours: e.target.checked }))} className="h-4 w-4 accent-[#E06010]" /> After-hours intake or release</label>

        <fieldset className="rounded-2xl border border-line p-4 sm:col-span-2">
          <legend className="px-1 text-sm font-semibold text-navy">Customer</legend>
          <div className="mb-3 flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="who" checked={!form.linkOrder} onChange={() => setForm((f) => ({ ...f, linkOrder: false }))} className="accent-[#E06010]" /> Standalone (enter contact)</label>
            <label className="flex items-center gap-2"><input type="radio" name="who" checked={form.linkOrder} onChange={() => setForm((f) => ({ ...f, linkOrder: true }))} className="accent-[#E06010]" /> Link an existing order</label>
          </div>
          {form.linkOrder ? (
            <div>
              <div className="flex gap-2">
                <label className="sr-only" htmlFor="b-ref">Order reference</label>
                <input id="b-ref" className={inputCls} placeholder="Order reference, e.g. EB-261203-7K3P" value={form.orderRef} onChange={set("orderRef")} />
                <button type="button" className="btn-ghost !px-4" onClick={findOrder}>Find</button>
              </div>
              <ul className="mt-2 space-y-1">
                {hits.map((h) => (
                  <li key={h.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-cloud">
                      <input type="radio" name="order" checked={form.orderId === h.id} onChange={() => setForm((f) => ({ ...f, orderId: h.id, pieces: String(h._count.pieces) }))} className="accent-[#E06010]" />
                      <span className="font-semibold text-navy">{h.reference}</span> · {h.customer.name} · {h._count.pieces} pc
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name" htmlFor="b-name" error={errors["contact.name"]}><input id="b-name" className={inputCls} value={form.name} onChange={set("name")} /></Field>
              <Field label="Email" htmlFor="b-email" error={errors["contact.email"] ?? errors.contact}><input id="b-email" type="email" className={inputCls} value={form.email} onChange={set("email")} /></Field>
              <Field label="Phone" htmlFor="b-phone"><input id="b-phone" type="tel" className={inputCls} value={form.phone} onChange={set("phone")} /></Field>
            </div>
          )}
        </fieldset>
        <div className="sm:col-span-2"><Field label="Notes" htmlFor="b-notes"><textarea id="b-notes" rows={2} className={inputCls} value={form.notes} onChange={set("notes")} /></Field></div>
        <div className="rounded-2xl bg-navy-50 p-4 text-sm sm:col-span-2" aria-live="polite">
          {price ? (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="font-display text-xl font-bold text-navy">{money(price.retailCents)}</span>
              <span className="text-slate-ink">Est. cost {money(price.costCents)} · margin {price.marginPercent}%</span>
              {price.manualReview && <span className="font-semibold text-orange-700">Below minimum profit: staff review</span>}
              <span className="w-full text-xs text-muted">Internal preview from the storage pricing rules (Settings & pricing). Customers only ever see the final price.</span>
            </div>
          ) : (
            <span className="text-muted">Enter dates and pieces to preview the price.</span>
          )}
        </div>
      </form>
    </Modal>
  );
}
