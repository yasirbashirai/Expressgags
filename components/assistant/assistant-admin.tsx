"use client";

/**
 * Admin → AI assistant: stats, conversations (with transcripts), handoff queue, weekly AI business reports,
 * and settings (on/off, model from an allow-list, Spanish, lead summaries). Owner changes settings.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bot, Headset, MessageSquare, Sparkles, FileText } from "lucide-react";
import { AdminTitle, Panel, useAdminUser } from "@/components/admin/admin-shell";
import { api, dateTime } from "@/components/admin/api";
import { DataTable, EmptyState, Field, inputCls, Modal, StatCard, Tabs } from "@/components/admin/ui";

type Settings = { model: string; spanishEnabled: boolean; leadSummaries: boolean; enabled: boolean };
type Stats = { conversations: number; handoffs: number; openHandoffs: number; drafts: number; draftsOpened: number; summaries: number };
type ConvRow = { id: string; language: string; messages: number; preview: string; handoffRequested: boolean; leadEmail: string | null; provider: string | null; model: string | null; updatedAt: string; usedTools: string[] };
type ConvDetail = { id: string; language: string; handoffRequested: boolean; provider: string | null; model: string | null; createdAt: string; messages: { role: "user" | "assistant"; content: string; at: string; tools?: string[] }[]; drafts: { token: string; createdAt: string; openedAt: string | null }[] };
type Report = { id: string; periodStart: string | null; periodEnd: string | null; content: string; createdAt: string; narrated: boolean };

export function AssistantAdmin() {
  const user = useAdminUser();
  const [tab, setTab] = useState<"conversations" | "handoffs" | "reports" | "settings">("conversations");
  const [stats, setStats] = useState<Stats | null>(null);
  const [provider, setProvider] = useState("scripted");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ stats: Stats; provider: string; settings: Settings; allowedModels: string[] }>("/assistant/stats")
      .then((r) => {
        setStats(r.stats);
        setProvider(r.provider);
        setSettings(r.settings);
        setModels(r.allowedModels);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <div>
      <AdminTitle
        title="AI assistant"
        sub={provider === "scripted" ? "Running in scripted mode (no AI key connected). Answers come from approved website content." : "Bilingual website assistant powered by Claude, with tool access to public content, tracking and quote drafts."}
      />
      {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Conversations · 30 days" value={stats?.conversations ?? "…"} Icon={MessageSquare} />
        <StatCard label="Handoffs to the team" value={stats?.handoffs ?? "…"} hint={stats ? `${stats.openHandoffs} waiting in Messages` : undefined} Icon={Headset} tone={stats?.openHandoffs ? "orange" : "white"} />
        <StatCard label="Quote links from chat" value={stats?.drafts ?? "…"} hint={stats ? `${stats.draftsOpened} opened by customers` : undefined} Icon={FileText} />
        <StatCard label="AI lead summaries" value={stats?.summaries ?? "…"} hint={provider === "scripted" ? "Needs an AI key" : "On new quote requests"} Icon={Sparkles} tone="navy" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "conversations", label: "Conversations" },
          { value: "handoffs", label: "Handoff queue", count: stats?.handoffs },
          { value: "reports", label: "Weekly reports" },
          { value: "settings", label: "Settings" },
        ]}
      />
      {tab === "conversations" && <Conversations handoffOnly={false} />}
      {tab === "handoffs" && <Conversations handoffOnly />}
      {tab === "reports" && <Reports />}
      {tab === "settings" && settings && <SettingsForm settings={settings} models={models} provider={provider} canEdit={user?.role === "OWNER"} onSaved={(s) => (setSettings(s), load())} />}
    </div>
  );
}

function Conversations({ handoffOnly }: { handoffOnly: boolean }) {
  const [rows, setRows] = useState<ConvRow[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    api<{ conversations: ConvRow[]; total: number }>(`/assistant/conversations?page=${page}${handoffOnly ? "&handoff=1" : ""}`)
      .then((r) => {
        setRows(r.conversations);
        setTotal(r.total);
      })
      .catch(() => setRows([]));
  }, [page, handoffOnly]);
  if (!rows) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <>
      {handoffOnly && (
        <p className="mb-3 text-sm text-slate-ink">
          Customers who asked for a person. Their contact details are in <Link href="/admin/messages" className="font-semibold text-orange-700 underline">Messages</Link> (topic “assistant-handoff”).
        </p>
      )}
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => setOpenId(r.id)}
        empty={<EmptyState title={handoffOnly ? "No handoffs yet" : "No conversations yet"} text="Conversations appear here as visitors use the website assistant." />}
        columns={[
          { key: "when", header: "Last message", cell: (r) => <span className="whitespace-nowrap text-slate-ink">{dateTime(r.updatedAt)}</span> },
          { key: "preview", header: "First question", cell: (r) => <span className="line-clamp-2 text-navy">{r.preview || (r.handoffRequested ? "Used “Talk to a person” (no chat)" : "(no message)")}</span> },
          { key: "lang", header: "Lang", cell: (r) => <span className="uppercase">{r.language}</span> },
          { key: "msgs", header: "Messages", cell: (r) => r.messages },
          { key: "tools", header: "Tools", cell: (r) => <span className="text-xs text-muted">{r.usedTools.join(", ") || "none"}</span>, mobile: false },
          { key: "handoff", header: "Handoff", cell: (r) => (r.handoffRequested ? <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">Requested</span> : "") },
        ]}
      />
      {total > 25 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <button className="btn-ghost !px-3 !py-1.5" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="text-muted">Page {page} of {Math.ceil(total / 25)}</span>
          <button className="btn-ghost !px-3 !py-1.5" disabled={page * 25 >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
      <Transcript id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function Transcript({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [c, setC] = useState<ConvDetail | null>(null);
  useEffect(() => {
    setC(null);
    if (id) api<{ conversation: ConvDetail }>(`/assistant/conversations/${id}`).then((r) => setC(r.conversation)).catch(() => undefined);
  }, [id]);
  return (
    <Modal open={!!id} onClose={onClose} title="Conversation transcript" wide>
      {!c ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Started {dateTime(c.createdAt)} · {c.language.toUpperCase()} · {c.provider ?? "scripted"}{c.model ? ` (${c.model})` : ""}
            {c.handoffRequested && " · handoff requested"}
          </p>
          {c.messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-navy text-white" : "bg-cloud text-charcoal"}`}>
                {m.content}
                {m.tools?.length ? <p className="mt-1 text-[11px] opacity-70">Tools: {m.tools.join(", ")}</p> : null}
              </div>
            </div>
          ))}
          {c.drafts.length > 0 && (
            <p className="rounded-xl bg-orange-50 px-3 py-2 text-xs text-orange-900">
              Quote links created: {c.drafts.length} ({c.drafts.filter((d) => d.openedAt).length} opened). Submitted requests appear in Quote requests.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function Reports() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => api<{ reports: Report[] }>("/assistant/reports").then((r) => setReports(r.reports)).catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/assistant/reports", { method: "POST" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-ink">A plain-English summary of the last 7 days. Every number is calculated from platform data; the AI only writes the narrative. Trend-based operational recommendations need 6–12 months of data.</p>
        <button type="button" onClick={generate} disabled={busy} className="btn-primary !px-4 !py-2">{busy ? "Generating…" : "Generate this week's report"}</button>
      </div>
      {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}
      {!reports ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : reports.length === 0 ? (
        <EmptyState title="No reports yet" text="Generate the first weekly report to see a summary of quotes, orders, revenue and exceptions." />
      ) : (
        reports.map((r) => (
          <Panel key={r.id} title={`Week ending ${r.periodEnd ? new Date(r.periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}`} action={<span className="text-xs text-muted">{r.narrated ? "AI narrative" : "Fact summary"} · {dateTime(r.createdAt)}</span>}>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-ink">{r.content}</div>
          </Panel>
        ))
      )}
    </div>
  );
}

function SettingsForm({ settings, models, provider, canEdit, onSaved }: { settings: Settings; models: string[]; provider: string; canEdit: boolean; onSaved: (s: Settings) => void }) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api<{ settings: Settings }>("/assistant/settings", { method: "PUT", json: form });
      onSaved(r.settings);
      setMsg("Saved.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const toggle = (k: "enabled" | "spanishEnabled" | "leadSummaries", label: string, hint: string) => (
    <label className="flex items-start gap-3 rounded-xl border border-line p-4">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[#E06010]" checked={form[k]} disabled={!canEdit} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} />
      <span>
        <span className="block text-sm font-semibold text-navy">{label}</span>
        <span className="block text-xs text-slate-ink">{hint}</span>
      </span>
    </label>
  );
  return (
    <Panel title="Assistant settings">
      <div className="grid gap-3 md:grid-cols-2">
        {toggle("enabled", "Show the assistant on the website", "Turns the chat button on or off for all visitors.")}
        {toggle("spanishEnabled", "Spanish conversations", "Answer in Spanish when visitors write in Spanish or choose ES.")}
        {toggle("leadSummaries", "AI lead summaries", "Summarize each new quote request for the office (needs an AI key).")}
        <div className="rounded-xl border border-line p-4">
          <Field label="AI model" htmlFor="as-model" hint={provider === "scripted" ? "Add ANTHROPIC_API_KEY on the API server to switch from scripted mode." : "Claude Opus 5.5 is the default. Other Claude models are allowed for cost tuning."}>
            <select id="as-model" className={inputCls} value={form.model} disabled={!canEdit} onChange={(e) => setForm({ ...form, model: e.target.value })}>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        {canEdit ? <button type="button" onClick={save} disabled={saving} className="btn-primary !px-4 !py-2">{saving ? "Saving…" : "Save settings"}</button> : <p className="text-xs text-muted">Only the owner can change these settings.</p>}
        {msg && <span className="text-sm text-slate-ink" role="status">{msg}</span>}
      </div>
      <div className="mt-6 rounded-xl bg-cloud p-4 text-xs leading-relaxed text-slate-ink">
        <p className="flex items-center gap-1.5 font-semibold text-navy"><Bot className="h-3.5 w-3.5" aria-hidden /> Guardrails always on</p>
        The assistant never quotes prices, never names staff or clients, never accepts moving or food delivery, and always routes pricing, timing, access and same-day requests to a written quotation or dispatch. A final filter removes any dollar amounts or banned claims before a reply is shown. Provider-agnostic: other AI providers (OpenAI, Gemini, Copilot) can be added without rebuilding.
      </div>
    </Panel>
  );
}
