"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Phone } from "lucide-react";
import { api, API_URL, dateTime } from "./api";
import { AdminTitle } from "./admin-shell";
import { Badge, marketLabel, STATUS_STYLE } from "./labels";

type Row = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  createdAt: string;
  // careers
  role?: string;
  market?: string | null;
  experience?: string | null;
  resumeId?: string | null;
  // messages
  topic?: string;
  message?: string | null;
};

/** Career applications or contact messages, newest first, with a simple status workflow. */
export function InboxList({ kind }: { kind: "careers" | "messages" }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ applications?: Row[]; messages?: Row[] }>(`/${kind}`)
      .then((r) => setRows(r.applications ?? r.messages ?? []))
      .catch((e) => setError(e.message));
  }, [kind]);
  useEffect(load, [load]);

  async function setStatus(id: string, status: string) {
    try {
      await api(`/${kind}/${id}/status`, { method: "PATCH", json: { status } });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const title = kind === "careers" ? "Career applications" : "Messages";
  return (
    <>
      <AdminTitle title={title} sub={rows ? `${rows.length} total` : "Loading…"} />
      {error && <p className="mb-4 text-sm text-rose-700">{error}</p>}
      {rows && rows.length === 0 && <p className="card p-6 text-center text-sm text-muted">Nothing here yet.</p>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {rows?.map((r) => (
          <li key={r.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-charcoal">{r.name}</p>
                <p className="text-sm font-medium text-navy">{kind === "careers" ? `${r.role}${r.market ? ` · ${marketLabel(r.market)}` : ""}` : r.topic}</p>
              </div>
              <Badge className={STATUS_STYLE[r.status] ?? STATUS_STYLE.NEW}>{r.status}</Badge>
            </div>
            {(r.message || r.experience) && <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm text-slate-ink">{r.message || r.experience}</p>}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 text-orange-700 hover:underline"><Mail className="h-3.5 w-3.5" />{r.email}</a>
              {r.phone && <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="h-3.5 w-3.5" />{r.phone}</a>}
              <span>{dateTime(r.createdAt)}</span>
              {r.resumeId && <a href={`${API_URL}/v1/admin/uploads/${r.resumeId}`} className="font-semibold text-orange-700 hover:underline">Download résumé</a>}
            </div>
            <div className="mt-4 flex gap-2">
              {["NEW", "REVIEWED", "ARCHIVED"].map((s) => (
                <button key={s} disabled={s === r.status} onClick={() => setStatus(r.id, s)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${s === r.status ? STATUS_STYLE[s] ?? "" : "ring-line hover:ring-navy/40"}`}>{s}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
