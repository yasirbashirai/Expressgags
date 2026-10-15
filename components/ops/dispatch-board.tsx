"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, Clock, Package, Truck, UserPlus, Users, X } from "lucide-react";
import { api } from "@/components/admin/api";
import { AdminTitle } from "@/components/admin/admin-shell";
import { Badge, marketLabel } from "@/components/admin/labels";
import { EmptyState, Field, inputCls, Modal, StatCard } from "@/components/admin/ui";
import { isoDay, ORDER_STATUS_LABEL, ORDER_STATUS_STYLE, PRIORITY_STYLE, stopText, timeOf } from "./labels";

type Job = {
  id: string;
  reference: string;
  status: string;
  serviceType: string;
  market: string;
  priority: string;
  timeWindow: string | null;
  windowStart: string;
  windowEnd: string;
  pickup: unknown;
  delivery: unknown;
  guestName: string | null;
  customer: string;
  pieces: number;
  vehicleClassCode: string | null;
  openExceptions: number;
  assignments: { id: string; employeeId: string; role: string; sequence: number; vehicle: { id: string; unitNumber: string } | null }[];
};
type Lane = { employee: { id: string; name: string; role: string; homeMarket: string | null }; unavailable: boolean; jobs: { jobId: string; sequence: number; role: string }[] };
type Vehicle = { id: string; unitNumber: string; vehicleClassCode: string; status: string; homeMarket: string | null };
type Board = { date: string; jobs: Job[]; lanes: Lane[]; unassigned: string[]; vehicles: Vehicle[]; stats: Record<string, number> };
type Conflict = { code: string; severity: "warning" | "critical"; message: string };

const shiftDay = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00`);
  x.setDate(x.getDate() + n);
  return isoDay(x);
};

/** Day dispatch board: unassigned queue + one lane per driver/helper, assignment with live conflict warnings. */
export function DispatchBoard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const date = params.get("date") ?? isoDay();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<Job | null>(null);

  const load = useCallback(() => {
    api<Board>(`/dispatch/board?date=${date}`).then(setBoard).catch((e) => setError(e.message));
  }, [date]);
  useEffect(() => {
    setBoard(null);
    load();
  }, [load]);

  const jobsById = useMemo(() => Object.fromEntries((board?.jobs ?? []).map((j) => [j.id, j])), [board]);
  const go = (d: string) => router.replace(`${pathname}?date=${d}`);

  async function unassign(assignmentId: string) {
    try {
      await api(`/dispatch/assignments/${assignmentId}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function move(lane: Lane, idx: number, dir: -1 | 1) {
    const ids = lane.jobs.map((j) => j.jobId);
    const t = idx + dir;
    if (t < 0 || t >= ids.length) return;
    [ids[idx], ids[t]] = [ids[t], ids[idx]];
    try {
      await api("/dispatch/reorder", { method: "POST", json: { employeeId: lane.employee.id, date, orderIds: ids } });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const label = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <AdminTitle
        title="Dispatch board"
        sub={label}
        actions={
          <div className="flex items-center gap-1 rounded-full border border-line bg-white p-1">
            <button onClick={() => go(shiftDay(date, -1))} aria-label="Previous day" className="rounded-full p-2 hover:bg-cloud"><ChevronLeft className="h-4 w-4" /></button>
            <label className="flex items-center gap-1.5 px-1 text-sm"><CalendarDays className="h-4 w-4 text-orange" aria-hidden /><span className="sr-only">Date</span>
              <input type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} className="bg-transparent text-sm outline-none" />
            </label>
            <button onClick={() => go(shiftDay(date, 1))} aria-label="Next day" className="rounded-full p-2 hover:bg-cloud"><ChevronRight className="h-4 w-4" /></button>
            <button onClick={() => go(isoDay())} className="rounded-full px-3 py-1.5 text-sm font-medium text-navy hover:bg-cloud">Today</button>
          </div>
        }
      />
      {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</p>}
      {!board ? (
        <p className="text-sm text-muted">Loading board…</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <StatCard label="Jobs" value={board.stats.jobs} Icon={Package} />
            <StatCard label="Need a driver" value={board.stats.unassigned} tone={board.stats.unassigned ? "orange" : "white"} Icon={UserPlus} />
            <StatCard label="In progress" value={board.stats.inProgress} Icon={Truck} />
            <StatCard label="Delivered" value={board.stats.delivered} />
            <StatCard label="Pieces" value={board.stats.pieces} />
            <StatCard label="Open exceptions" value={board.stats.exceptions} tone={board.stats.exceptions ? "navy" : "white"} Icon={AlertTriangle} />
          </div>

          {board.jobs.length === 0 ? (
            <EmptyState title="No jobs scheduled" text="Orders scheduled for this day will appear here." action={<Link href="/admin/orders/new" className="btn-primary">Create an order</Link>} />
          ) : (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:overflow-x-auto lg:pb-4">
              <section aria-label="Unassigned jobs" className="w-full shrink-0 rounded-2xl bg-orange-50 p-3 lg:w-80">
                <h2 className="mb-3 flex items-center justify-between px-1 font-display text-sm font-bold text-orange-700">Needs a driver <span className="rounded-full bg-white px-2 py-0.5 text-xs">{board.unassigned.length}</span></h2>
                <ul className="space-y-3">
                  {board.unassigned.map((id) => jobsById[id] && (
                    <li key={id}><JobCard job={jobsById[id]} onAssign={() => setAssigning(jobsById[id])} /></li>
                  ))}
                  {board.unassigned.length === 0 && <li className="rounded-xl bg-white p-4 text-center text-sm text-muted">Every job has a driver.</li>}
                </ul>
              </section>

              {board.lanes.map((lane) => (
                <section key={lane.employee.id} aria-label={`Jobs for ${lane.employee.name}`} className="w-full shrink-0 rounded-2xl bg-white p-3 ring-1 ring-line lg:w-80">
                  <div className="mb-3 flex items-start justify-between gap-2 px-1">
                    <div>
                      <h2 className="font-display text-sm font-bold text-navy">{lane.employee.name}</h2>
                      <p className="text-xs text-muted">{lane.employee.role.toLowerCase()}{lane.employee.homeMarket ? ` · ${marketLabel(lane.employee.homeMarket)}` : ""}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="rounded-full bg-cloud px-2 py-0.5 text-xs">{lane.jobs.length} stop{lane.jobs.length === 1 ? "" : "s"}</span>
                      {lane.unavailable && <Badge className="bg-rose-50 text-rose-800 ring-rose-200">Unavailable</Badge>}
                    </div>
                  </div>
                  <ol className="space-y-3">
                    {lane.jobs.map((lj, i) => {
                      const job = jobsById[lj.jobId];
                      if (!job) return null;
                      const mine = job.assignments.find((a) => a.employeeId === lane.employee.id)!;
                      return (
                        <li key={lj.jobId} className="relative">
                          <span className="absolute -left-1 top-3 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-navy text-[10px] font-bold text-white">{i + 1}</span>
                          <JobCard job={job} role={lj.role} onAssign={() => setAssigning(job)}>
                            <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                              <span className="text-xs text-muted">{mine.vehicle ? `Unit ${mine.vehicle.unitNumber}` : "No vehicle"}</span>
                              <span className="flex gap-1">
                                <button aria-label="Move earlier" disabled={i === 0} onClick={() => move(lane, i, -1)} className="rounded-full p-1.5 hover:bg-cloud disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                                <button aria-label="Move later" disabled={i === lane.jobs.length - 1} onClick={() => move(lane, i, 1)} className="rounded-full p-1.5 hover:bg-cloud disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                                <button aria-label={`Unassign ${lane.employee.name}`} onClick={() => unassign(mine.id)} className="rounded-full p-1.5 text-rose-700 hover:bg-rose-50"><X className="h-3.5 w-3.5" /></button>
                              </span>
                            </div>
                          </JobCard>
                        </li>
                      );
                    })}
                    {lane.jobs.length === 0 && <li className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">No stops yet</li>}
                  </ol>
                </section>
              ))}
              {board.lanes.length === 0 && (
                <div className="flex-1"><EmptyState title="No active drivers or helpers" text="Add team members (role Driver or Helper) in Team to start assigning jobs." action={<Link href="/admin/team" className="btn-navy">Go to Team</Link>} /></div>
              )}
            </div>
          )}
        </>
      )}
      {assigning && board && <AssignModal job={assigning} board={board} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); load(); }} />}
    </>
  );
}

function JobCard({ job, role, onAssign, children }: { job: Job; role?: string; onAssign: () => void; children?: React.ReactNode }) {
  return (
    <article className="rounded-xl border border-line bg-white p-3 pl-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/admin/orders/${job.id}`} className="font-mono text-xs font-semibold text-navy hover:underline">{job.reference}</Link>
        <Badge className={ORDER_STATUS_STYLE[job.status]}>{ORDER_STATUS_LABEL[job.status]}</Badge>
      </div>
      <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-charcoal"><Clock className="h-3 w-3 text-orange" aria-hidden /> {timeOf(job.windowStart)} – {timeOf(job.windowEnd)}</p>
      <p className="mt-1 truncate text-sm font-medium text-charcoal">{job.customer}{job.guestName ? ` · ${job.guestName}` : ""}</p>
      <p className="truncate text-xs text-slate-ink">From {stopText(job.pickup)}</p>
      <p className="truncate text-xs text-slate-ink">To {stopText(job.delivery)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Badge className="bg-cloud text-slate-ink ring-line">{job.pieces} pcs</Badge>
        {job.priority !== "NORMAL" && <Badge className={PRIORITY_STYLE[job.priority]}>{job.priority}</Badge>}
        {job.vehicleClassCode && <Badge className="bg-cloud text-slate-ink ring-line">{job.vehicleClassCode}</Badge>}
        {job.openExceptions > 0 && <Badge className="bg-rose-50 text-rose-800 ring-rose-200"><AlertTriangle className="mr-1 h-3 w-3" aria-hidden />{job.openExceptions}</Badge>}
        {role && role !== "DRIVER" && <Badge className="bg-navy-50 text-navy ring-navy-100">{role.toLowerCase()}</Badge>}
        {job.assignments.length > 0 && <span className="ml-auto flex items-center gap-1 text-xs text-muted"><Users className="h-3 w-3" aria-hidden />{job.assignments.length}</span>}
      </div>
      {job.status !== "DELIVERED" && (
        <button onClick={onAssign} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-orange-700 hover:underline"><UserPlus className="h-3.5 w-3.5" aria-hidden /> Assign crew</button>
      )}
      {children}
    </article>
  );
}

function AssignModal({ job, board, onClose, onDone }: { job: Job; board: Board; onClose: () => void; onDone: () => void }) {
  const hasDriver = job.assignments.some((a) => a.role === "DRIVER");
  const [employeeId, setEmployeeId] = useState("");
  const [role, setRole] = useState(hasDriver ? "HELPER" : "DRIVER");
  const [vehicleId, setVehicleId] = useState("");
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!employeeId) return setConflicts(null);
    let cancelled = false;
    api<{ conflicts: Conflict[] }>("/dispatch/check", { method: "POST", json: { orderId: job.id, employeeId, role, vehicleId: vehicleId || null } })
      .then((r) => !cancelled && setConflicts(r.conflicts))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [employeeId, vehicleId, role, job.id]);

  async function assign() {
    setBusy(true);
    try {
      await api("/dispatch/assign", { method: "POST", json: { orderId: job.id, employeeId, role, vehicleId: vehicleId || null } });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const critical = conflicts?.some((c) => c.severity === "critical");
  return (
    <Modal open onClose={onClose} title={`Assign crew · ${job.reference}`} footer={<><button className="btn-ghost" onClick={onClose}>Close</button><button className={critical ? "btn bg-rose-700 text-white hover:bg-rose-800" : "btn-primary"} disabled={!employeeId || busy} onClick={assign}>{critical ? "Assign anyway" : "Assign"}</button></>}>
      <p className="mb-4 text-sm text-slate-ink">{timeOf(job.windowStart)} – {timeOf(job.windowEnd)} · {job.pieces} pieces · to {stopText(job.delivery)}</p>
      {error && <p className="mb-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-4">
        <Field label="Team member" htmlFor="as-emp">
          <select id="as-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputCls}>
            <option value="">Choose…</option>
            {board.lanes.map((l) => <option key={l.employee.id} value={l.employee.id}>{l.employee.name} ({l.employee.role.toLowerCase()}, {l.jobs.length} stop{l.jobs.length === 1 ? "" : "s"}){l.unavailable ? " · unavailable" : ""}</option>)}
          </select>
        </Field>
        <Field label="Role on this job" htmlFor="as-role">
          <select id="as-role" value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
            <option value="DRIVER">Driver</option><option value="HELPER">Helper</option><option value="SUPERVISOR">Supervisor</option>
          </select>
        </Field>
        <Field label="Vehicle" htmlFor="as-veh" hint={job.vehicleClassCode ? `Requested class: ${job.vehicleClassCode}` : undefined}>
          <select id="as-veh" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={inputCls}>
            <option value="">No vehicle (helper / walking crew)</option>
            {board.vehicles.map((v) => <option key={v.id} value={v.id}>{v.unitNumber} · {v.vehicleClassCode}{v.status !== "AVAILABLE" ? ` · ${v.status.toLowerCase()}` : ""}</option>)}
          </select>
        </Field>
      </div>
      {conflicts && (
        <div className={`mt-4 rounded-xl p-3 text-sm ${conflicts.length === 0 ? "bg-emerald-50 text-emerald-800" : critical ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"}`} role="status">
          {conflicts.length === 0 ? "No conflicts found." : (
            <ul className="space-y-1">{conflicts.map((c) => <li key={c.code + c.message} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{c.message}</li>)}</ul>
          )}
        </div>
      )}
    </Modal>
  );
}
