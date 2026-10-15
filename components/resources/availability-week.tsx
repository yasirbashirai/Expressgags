"use client";

/**
 * Week availability board (rows = people, columns = days). Shifts show green, time off / unavailable
 * show orange. Dispatch uses the same data for assignment conflict checks. All times and day columns
 * are Miami time (America/New_York), whatever time zone the viewer is in.
 */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/components/admin/api";
import { EmptyState, Field, inputCls, Modal } from "@/components/admin/ui";
import { ErrorNote, fromZonedInput, ROLE_LABEL, useApi, zonedInput, zonedParts, zonedTime, zonedToUtc } from "./shared";

type Block = { id: string; employeeId: string; kind: string; startsAt: string; endsAt: string; note: string | null };
type Person = { id: string; firstName: string; lastName: string; role: string };

export const KIND_LABEL: Record<string, string> = { SHIFT: "Shift", AVAILABLE: "Available", UNAVAILABLE: "Unavailable", TIME_OFF: "Time off" };
const KIND_STYLE: Record<string, string> = {
  SHIFT: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  AVAILABLE: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  UNAVAILABLE: "bg-rose-50 text-rose-900 ring-rose-200",
  TIME_OFF: "bg-orange-50 text-orange-800 ring-orange-200",
};

/** A business-time calendar day: its label parts and UTC start/end instants. */
type Day = { y: number; m: number; d: number; start: Date; end: Date; key: string };
const makeDay = (y: number, m: number, d: number): Day => {
  const start = zonedToUtc(y, m, d);
  const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
  const end = zonedToUtc(nextDate.getUTCFullYear(), nextDate.getUTCMonth() + 1, nextDate.getUTCDate());
  return { y, m, d, start, end, key: `${y}-${m}-${d}` };
};
/** Monday of the business-time week containing `at`. */
const weekOf = (at: Date) => {
  const p = zonedParts(at);
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday);
  const monday = new Date(Date.UTC(p.y, p.m - 1, p.d - dow));
  return makeDay(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
};
const shiftDays = (day: Day, n: number) => {
  const x = new Date(Date.UTC(day.y, day.m - 1, day.d + n));
  return makeDay(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
};
const dayLabel = (day: Day, opts: Intl.DateTimeFormatOptions) => new Date(Date.UTC(day.y, day.m - 1, day.d, 12)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
const time = (iso: string) => zonedTime(iso);
/** yyyy-mm-ddThh:mm in Miami time for datetime-local inputs */
export const localInput = (d: Date) => zonedInput(d);

export function AvailabilityWeek({ employees, canEdit, employeeId }: { employees: Person[]; canEdit: boolean; employeeId?: string }) {
  const [week, setWeek] = useState(() => weekOf(new Date()));
  const [adding, setAdding] = useState<{ employeeId: string; day: Day } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftDays(week, i)), [week]);
  const end = days[6].end;
  const path = `/team/availability?from=${encodeURIComponent(week.start.toISOString())}&to=${encodeURIComponent(end.toISOString())}${employeeId ? `&employeeId=${employeeId}` : ""}`;
  const { data, error: loadError, reload } = useApi<{ blocks: Block[] }>(path);
  const blocks = data?.blocks ?? [];

  async function remove(b: Block) {
    setError(null);
    try {
      await api(`/team/availability/${b.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const label = `${dayLabel(days[0], { month: "short", day: "numeric" })} – ${dayLabel(days[6], { month: "short", day: "numeric", year: "numeric" })} · Miami time`;
  const today = makeDay(zonedParts(new Date()).y, zonedParts(new Date()).m, zonedParts(new Date()).d).key;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button className="rounded-full border border-line bg-white p-2 hover:bg-cloud" onClick={() => setWeek(shiftDays(week, -7))} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
          <button className="rounded-full border border-line bg-white px-3 py-1.5 text-sm hover:bg-cloud" onClick={() => setWeek(weekOf(new Date()))}>This week</button>
          <button className="rounded-full border border-line bg-white p-2 hover:bg-cloud" onClick={() => setWeek(shiftDays(week, 7))} aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
          <p className="ml-2 text-sm font-semibold text-navy" aria-live="polite">{label}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {["SHIFT", "TIME_OFF", "UNAVAILABLE"].map((k) => <span key={k} className={`rounded-full px-2.5 py-0.5 ring-1 ring-inset ${KIND_STYLE[k]}`}>{KIND_LABEL[k]}</span>)}
        </div>
      </div>
      <ErrorNote message={error ?? loadError} />
      {!employees.length ? (
        <EmptyState title="No team members to schedule" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[860px] table-fixed text-left text-sm">
            <caption className="sr-only">Availability for the week of {label}</caption>
            <thead className="bg-cloud text-xs uppercase tracking-wider text-muted">
              <tr>
                {!employeeId && <th scope="col" className="w-44 px-3 py-2.5 font-semibold">Person</th>}
                {days.map((d) => (
                  <th key={d.key} scope="col" className={`px-2 py-2.5 font-semibold ${d.key === today ? "text-orange-700" : ""}`}>
                    {dayLabel(d, { weekday: "short" })} <span className="font-normal">{d.d}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {employees.map((p) => (
                <tr key={p.id} className="align-top">
                  {!employeeId && (
                    <th scope="row" className="px-3 py-2.5 font-medium text-navy">
                      <span className="block truncate">{p.firstName} {p.lastName}</span>
                      <span className="text-xs font-normal text-muted">{ROLE_LABEL[p.role] ?? p.role}</span>
                    </th>
                  )}
                  {days.map((d) => {
                    // A block belongs to the Miami day it starts in (overnight blocks are not repeated)
                    const mine = blocks.filter((b) => b.employeeId === p.id && new Date(b.startsAt) >= d.start && new Date(b.startsAt) < d.end);
                    const carried = blocks.filter((b) => b.employeeId === p.id && new Date(b.startsAt) < d.start && new Date(b.endsAt) > d.start);
                    return (
                      <td key={d.key} className="px-1.5 py-1.5">
                        <div className="flex min-h-[56px] flex-col gap-1">
                          {carried.map((b) => (
                            <span key={`c-${b.id}`} className={`rounded-lg px-2 py-1 text-[11px] leading-tight opacity-60 ring-1 ring-inset ${KIND_STYLE[b.kind] ?? ""}`}>
                              {KIND_LABEL[b.kind] ?? b.kind} until {time(b.endsAt)}
                            </span>
                          ))}
                          {mine.map((b) => (
                            <span key={b.id} className={`group flex items-start justify-between gap-1 rounded-lg px-2 py-1 text-[11px] leading-tight ring-1 ring-inset ${KIND_STYLE[b.kind] ?? ""}`} title={b.note ?? undefined}>
                              <span>
                                <span className="block font-semibold">{KIND_LABEL[b.kind] ?? b.kind}</span>
                                {time(b.startsAt)}–{time(b.endsAt)}
                                {b.note && <span className="block truncate opacity-75">{b.note}</span>}
                              </span>
                              {canEdit && (
                                <button onClick={() => remove(b)} className="rounded p-0.5 opacity-60 hover:opacity-100" aria-label={`Remove ${KIND_LABEL[b.kind]} on ${dayLabel(d, { weekday: "long", month: "long", day: "numeric" })}`}>
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </span>
                          ))}
                          {canEdit && (
                            <button onClick={() => setAdding({ employeeId: p.id, day: d })} className="mt-auto inline-flex items-center justify-center rounded-lg border border-dashed border-line py-1 text-[11px] text-muted hover:border-navy/40 hover:text-navy" aria-label={`Add availability for ${p.firstName} ${p.lastName} on ${dayLabel(d, { weekday: "long", month: "long", day: "numeric" })}`}>
                              <Plus className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <AddBlock target={adding} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); reload(); }} />}
    </div>
  );
}

function AddBlock({ target, onClose, onSaved }: { target: { employeeId: string; day: Day }; onClose: () => void; onSaved: () => void }) {
  const { y, m, d } = target.day;
  const [form, setForm] = useState({
    kind: "SHIFT",
    startsAt: localInput(zonedToUtc(y, m, d, 8)),
    endsAt: localInput(zonedToUtc(y, m, d, 18)),
    note: "",
    repeatDays: "0",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/team/${target.employeeId}/availability`, {
        method: "POST",
        json: { ...form, startsAt: fromZonedInput(form.startsAt).toISOString(), endsAt: fromZonedInput(form.endsAt).toISOString(), repeatDays: Number(form.repeatDays) },
      });
      onSaved();
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add availability" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button form="add-block" type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button></>}>
      <form id="add-block" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <ErrorNote message={error} />
        <Field label="Type" htmlFor="blk-kind">
          <select id="blk-kind" className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Repeat for the next" htmlFor="blk-repeat" hint="Copies the block daily">
          <select id="blk-repeat" className={inputCls} value={form.repeatDays} onChange={(e) => setForm({ ...form, repeatDays: e.target.value })}>
            <option value="0">Just this day</option>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} more day{n > 1 ? "s" : ""}</option>)}
          </select>
        </Field>
        <Field label="Starts (Miami time)" htmlFor="blk-start"><input id="blk-start" type="datetime-local" className={inputCls} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required /></Field>
        <Field label="Ends (Miami time)" htmlFor="blk-end"><input id="blk-end" type="datetime-local" className={inputCls} value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} required /></Field>
        <div className="sm:col-span-2">
          <Field label="Note (optional)" htmlFor="blk-note"><input id="blk-note" className={inputCls} value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Port shift, medical appointment" /></Field>
        </div>
      </form>
    </Modal>
  );
}
