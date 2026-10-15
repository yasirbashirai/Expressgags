"use client";

/** Today / Upcoming / Recent job lists, in stop order, with the essentials a driver needs at a glance. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Clock, Crown, MapPin, Package, Phone, RefreshCw } from "lucide-react";
import { DriverApiError, driverFetch, offlineCache, telHref, WINDOW_LABEL, type JobSummary } from "./api";
import { StatusChip } from "./status-chip";

type Scope = "today" | "upcoming" | "recent";
const SCOPES: { value: Scope; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "recent", label: "Completed" },
];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });

export function JobList() {
  const [scope, setScope] = useState<Scope>("today");
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (s: Scope) => {
    setError(null);
    try {
      const res = await driverFetch<{ jobs: JobSummary[] }>(`/v1/driver/jobs?scope=${s}`);
      setJobs(res.jobs);
      setStale(false);
      offlineCache.set(`jobs:${s}`, res.jobs);
    } catch (e) {
      const cached = offlineCache.get<JobSummary[]>(`jobs:${s}`);
      if ((e as DriverApiError).status === 0 && cached) {
        setJobs(cached);
        setStale(true);
      } else {
        setJobs([]);
        setError((e as Error).message);
      }
    }
  }, []);

  useEffect(() => {
    setJobs(null);
    void load(scope);
  }, [scope, load]);

  const active = jobs?.filter((j) => !["DELIVERED", "CANCELLED"].includes(j.status)).length ?? 0;

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-navy">My jobs</h1>
          {jobs && scope === "today" && <p className="text-sm text-slate-ink">{active === 0 ? "No open jobs today. Check Upcoming for later days." : `${active} open ${active === 1 ? "job" : "jobs"} today`}</p>}
        </div>
        <button onClick={() => void load(scope)} aria-label="Refresh jobs" className="grid h-12 w-12 place-items-center rounded-full border border-line bg-white text-navy active:bg-navy-50">
          <RefreshCw className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div role="tablist" aria-label="Job lists" className="mt-4 grid grid-cols-3 gap-1 rounded-2xl border border-line bg-white p-1">
        {SCOPES.map((s) => (
          <button key={s.value} role="tab" aria-selected={scope === s.value} onClick={() => setScope(s.value)}
            className={`min-h-12 rounded-xl text-sm font-bold ${scope === s.value ? "bg-navy text-white" : "text-slate-ink"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {stale && <p className="mt-3 rounded-xl bg-charcoal p-3 text-sm text-white">Showing the last jobs saved on this phone.</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      {!jobs ? (
        <ul className="mt-4 space-y-3" aria-busy="true">{[0, 1].map((i) => <li key={i} className="h-40 animate-pulse rounded-3xl bg-white" />)}</ul>
      ) : jobs.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-line bg-white p-8 text-center">
          <Package className="mx-auto h-10 w-10 text-orange" aria-hidden />
          <p className="mt-3 font-display text-lg font-bold text-navy">{scope === "recent" ? "No completed jobs in the last 3 days" : "No jobs assigned"}</p>
          <p className="mt-1 text-sm text-slate-ink">Dispatch will assign jobs here. Pull to refresh or tap the refresh button.</p>
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {jobs.map((j, i) => (
            <li key={j.assignmentId}>
              <article className={`overflow-hidden rounded-3xl border bg-white shadow-[var(--shadow-card)] ${j.priority === "VIP" ? "border-orange" : "border-line"}`}>
                <Link href={`/driver/jobs/${j.orderId}`} className="block p-4 active:bg-navy-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy font-display text-sm font-bold text-white" aria-label={`Stop ${j.sequence || i + 1}`}>{j.sequence || i + 1}</span>
                      <div>
                        <p className="font-mono text-sm font-bold text-navy">{j.reference}</p>
                        <p className="flex items-center gap-1 text-xs text-slate-ink">
                          <Clock className="h-3.5 w-3.5" aria-hidden />
                          {scope === "today" ? "" : `${fmtDate(j.serviceDate)} · `}{j.timeWindow ? WINDOW_LABEL[j.timeWindow] ?? j.timeWindow : "Window to confirm"}
                        </p>
                      </div>
                    </div>
                    <StatusChip status={j.status} label={j.statusLabel} />
                  </div>
                  <div className="mt-4 space-y-2.5">
                    <p className="flex gap-2.5 text-[15px] leading-snug text-charcoal"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange" aria-hidden /><span><span className="font-semibold">Pickup:</span> {j.pickup.address || "To confirm"}</span></p>
                    <p className="flex gap-2.5 text-[15px] leading-snug text-charcoal"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-navy" aria-hidden /><span><span className="font-semibold">Deliver:</span> {j.delivery.address || "To confirm"}</span></p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2.5 py-1 text-navy"><Package className="h-3.5 w-3.5" aria-hidden />{j.pieceCount} {j.pieceCount === 1 ? "piece" : "pieces"}</span>
                    {j.priority !== "NORMAL" && <span className="inline-flex items-center gap-1 rounded-full bg-orange-600 px-2.5 py-1 text-white"><Crown className="h-3.5 w-3.5" aria-hidden />{j.priority}</span>}
                    {j.vehicle && <span className="rounded-full bg-cloud px-2.5 py-1 text-slate-ink">Unit {j.vehicle.unitNumber}</span>}
                    {j.specialHandling && <span className="rounded-full bg-orange-50 px-2.5 py-1 text-orange-700">Special handling</span>}
                  </div>
                  <span className="mt-3 flex items-center justify-end gap-1 text-sm font-bold text-orange-700">Open job <ChevronRight className="h-4 w-4" aria-hidden /></span>
                </Link>
                {j.pickup.contact && /\d{3}/.test(j.pickup.contact) && (
                  <a href={telHref(j.pickup.contact)} className="flex min-h-12 items-center justify-center gap-2 border-t border-line text-sm font-bold text-navy active:bg-navy-50">
                    <Phone className="h-4 w-4" aria-hidden /> Call pickup contact
                  </a>
                )}
              </article>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
