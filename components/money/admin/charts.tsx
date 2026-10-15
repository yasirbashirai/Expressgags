"use client";

/**
 * Accessible inline-SVG charts for the admin (no chart library).
 * Palette validated with the dataviz validator (light surface): series 1 #2f63a8 (Express blue step),
 * series 2 #E06010 (Express orange). One y-axis only; legend for 2 series; hover tooltip; table view.
 */
import { useId, useMemo, useState } from "react";

export const SERIES = ["#2f63a8", "#E06010"] as const;
const INK = "#1f2933";
const MUTED = "#616e7c";
const GRID = "#e4e7eb";

const usd0 = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

type Point = { date: string; [k: string]: number | string };

/** Two-series line chart over days with a crosshair tooltip and a table toggle. */
export function TrendChart({ data, series, height = 220, format = usd0, title }: { data: Point[]; series: { key: string; label: string }[]; height?: number; format?: (v: number) => string; title: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = 720;
  const H = height;
  const pad = { l: 56, r: 16, t: 14, b: 26 };
  const max = useMemo(() => Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0))), [data, series]);
  const niceMax = Math.ceil(max / Math.pow(10, Math.floor(Math.log10(max)))) * Math.pow(10, Math.floor(Math.log10(max)));
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, data.length - 1);
  const y = (v: number) => pad.t + (1 - v / niceMax) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * niceMax);
  const empty = data.every((d) => series.every((s) => !Number(d[s.key])));

  return (
    <figure aria-labelledby={`${id}-t`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <figcaption id={`${id}-t`} className="text-sm font-semibold text-navy">{title}</figcaption>
        <div className="flex items-center gap-4 text-xs text-slate-ink">
          {series.map((s, i) => (
            <span key={s.key} className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: SERIES[i] }} aria-hidden />{s.label}</span>
          ))}
          <button className="font-semibold text-orange-700 underline" onClick={() => setTable((t) => !t)}>{table ? "Chart" : "Table"}</button>
        </div>
      </div>
      {table ? (
        <div className="max-h-64 overflow-auto rounded-xl border border-line">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-cloud"><tr><th className="px-3 py-2 text-left">Date</th>{series.map((s) => <th key={s.key} className="px-3 py-2 text-right">{s.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{data.map((d) => <tr key={d.date}><td className="px-3 py-1.5">{d.date}</td>{series.map((s) => <td key={s.key} className="px-3 py-1.5 text-right">{format(Number(d[s.key]) || 0)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" aria-label={`${title}. Use the Table button for exact values.`} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} />
                <text x={pad.l - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill={MUTED}>{format(t)}</text>
              </g>
            ))}
            {data.map((d, i) => (i % Math.ceil(data.length / 6) === 0 || i === data.length - 1) && (
              <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill={MUTED}>{new Date(`${d.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</text>
            ))}
            {series.map((s, si) => (
              <polyline key={s.key} fill="none" stroke={SERIES[si]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={data.map((d, i) => `${x(i)},${y(Number(d[s.key]) || 0)}`).join(" ")} />
            ))}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke={MUTED} strokeDasharray="3 3" />
                {series.map((s, si) => <circle key={s.key} cx={x(hover)} cy={y(Number(data[hover][s.key]) || 0)} r="4.5" fill={SERIES[si]} stroke="#fff" strokeWidth="2" />)}
              </g>
            )}
            {/* Hit targets wider than the marks */}
            {data.map((d, i) => (
              <rect key={d.date} x={x(i) - (W - pad.l - pad.r) / data.length / 2} y={pad.t} width={(W - pad.l - pad.r) / Math.max(1, data.length)} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
            ))}
          </svg>
          {empty && <p className="absolute inset-0 grid place-items-center text-sm text-muted">No activity in this period yet.</p>}
          {hover !== null && (
            <div className="pointer-events-none absolute top-2 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-[var(--shadow-card)]" style={{ left: `${Math.min(80, (x(hover) / W) * 100)}%` }}>
              <p className="font-semibold text-navy">{new Date(`${data[hover].date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
              {series.map((s, si) => (
                <p key={s.key} className="mt-0.5 flex items-center gap-1.5" style={{ color: INK }}><span className="h-2 w-2 rounded-full" style={{ background: SERIES[si] }} aria-hidden />{s.label}: {format(Number(data[hover][s.key]) || 0)}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Horizontal single-series bars with labels and values (no legend needed for one series). */
export function BarList({ rows, format = (v: number) => String(v), label }: { rows: { key: string; label: string; value: number; hint?: string }[]; format?: (v: number) => string; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-muted">No data yet.</p>;
  return (
    <ul className="space-y-2.5" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${format(r.value)}${r.hint ? ` · ${r.hint}` : ""}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-charcoal">{r.label}</span>
            <span className="shrink-0 font-semibold text-navy">{format(r.value)}{r.hint && <span className="ml-1 text-xs font-normal text-muted">{r.hint}</span>}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-cloud">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: SERIES[0] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Progress toward a target, with the status shown as text + icon-free label (never color alone). */
export function Meter({ label, value, target, unit, note }: { label: string; value: number | null; target: number; unit: string; note?: string }) {
  const ratio = value == null ? 0 : Math.min(1, value / target);
  const met = value != null && value >= target;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-charcoal">{label}</span>
        <span className="shrink-0 font-semibold text-navy">{value == null ? "Not measured yet" : `${value}${unit === "%" ? "%" : ` ${unit}`}`} <span className="text-xs font-normal text-muted">/ target {target}{unit === "%" ? "%" : ""}</span></span>
      </div>
      <div className="mt-1.5 h-2.5 rounded-full bg-cloud" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={value ?? 0}>
        <div className="h-2.5 rounded-full" style={{ width: `${Math.max(value == null ? 0 : 3, ratio * 100)}%`, background: met ? "#2f63a8" : "#E06010" }} />
      </div>
      <p className="mt-1 text-xs text-muted">{met ? "Target met" : value == null ? note ?? "" : "In progress"}</p>
    </div>
  );
}
