"use client";

/** Admin: preview every email/SMS template (EN/ES) with sample data and send a test. */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Mail, MessageSquare, Send } from "lucide-react";
import { AdminTitle, Panel } from "@/components/admin/admin-shell";
import { api, ApiError } from "@/components/admin/api";
import { Field, inputCls, Tabs } from "@/components/admin/ui";
import { templateLabel } from "./admin-notifications";

type Preview = { subject: string; html: string; text: string; sms: string; smsLength: number };

export function TemplatePreview() {
  const [templates, setTemplates] = useState<{ key: string; staff: boolean }[]>([]);
  const [key, setKey] = useState("order.confirmed");
  const [lang, setLang] = useState<"en" | "es">("en");
  const [view, setView] = useState<"email" | "text" | "sms">("email");
  const [p, setP] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState({ to: "", channel: "email" });
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    api<{ templates: { key: string; staff: boolean }[] }>("/notifications/templates").then((r) => setTemplates(r.templates)).catch((e: ApiError) => setError(e.message));
  }, []);
  useEffect(() => {
    setP(null);
    api<Preview>(`/notifications/templates/${key}/preview?lang=${lang}`).then(setP).catch((e: ApiError) => setError(e.message));
  }, [key, lang]);

  const groups = useMemo(() => {
    const g: Record<string, { key: string; staff: boolean }[]> = {};
    for (const t of templates) (g[t.staff ? "Staff alerts" : t.key.split(".")[0]] ??= []).push(t);
    return g;
  }, [templates]);

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    setTestMsg(null);
    try {
      const r = await api<{ status: string; error: string | null }>(`/notifications/templates/${key}/test`, { method: "POST", json: { ...test, lang } });
      setTestMsg(r.status === "LOGGED" ? "Test recorded. Connect SMTP or Twilio to deliver for real." : r.error ? `${r.status}: ${r.error}` : `Test ${r.status.toLowerCase()}.`);
    } catch (err) {
      setTestMsg((err as ApiError).message);
    }
  }

  return (
    <>
      <AdminTitle title="Message templates" sub="Branded emails and texts in English and Spanish. Previews use fictional sample data." actions={<Link href="/admin/notifications" className="btn-ghost !py-2"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to log</Link>} />
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Panel title="Templates" className="lg:max-h-[78vh] lg:overflow-y-auto">
          <label htmlFor="tpl-select" className="sr-only">Template</label>
          <select id="tpl-select" className={`${inputCls} lg:hidden`} value={key} onChange={(e) => setKey(e.target.value)}>
            {templates.map((t) => <option key={t.key} value={t.key}>{templateLabel(t.key)}</option>)}
          </select>
          <div className="hidden space-y-4 lg:block">
            {Object.entries(groups).map(([g, list]) => (
              <div key={g}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{g}</p>
                <ul className="space-y-0.5">
                  {list.map((t) => (
                    <li key={t.key}>
                      <button onClick={() => setKey(t.key)} aria-current={key === t.key ? "true" : undefined}
                        className={`w-full rounded-lg px-3 py-1.5 text-left text-sm transition ${key === t.key ? "bg-navy text-white" : "text-slate-ink hover:bg-cloud"}`}>
                        {templateLabel(t.key).replace(/^[^:]+: /, "")}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
        <div className="min-w-0 space-y-4">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-muted">Subject</p>
                <p className="truncate font-display font-bold text-navy" data-testid="tpl-subject">{p?.subject ?? "…"}</p>
              </div>
              <div className="flex gap-2">
                <Tabs value={lang} onChange={setLang} tabs={[{ value: "en", label: "English" }, { value: "es", label: "Español" }]} />
              </div>
            </div>
            <Tabs value={view} onChange={setView} tabs={[{ value: "email", label: "Email" }, { value: "text", label: "Plain text" }, { value: "sms", label: `SMS${p ? ` (${p.smsLength})` : ""}` }]} />
            {!p ? (
              <p className="text-sm text-muted">Rendering…</p>
            ) : view === "email" ? (
              <iframe title="Email preview" srcDoc={p.html} sandbox="" className="h-[640px] w-full rounded-xl border border-line bg-cloud" />
            ) : view === "text" ? (
              <pre className="max-h-[640px] overflow-auto whitespace-pre-wrap rounded-xl bg-cloud p-4 font-sans text-sm text-slate-ink">{p.text}</pre>
            ) : (
              <div className="rounded-xl bg-cloud p-6">
                <div className="max-w-sm rounded-2xl rounded-bl-sm bg-white p-4 text-sm leading-relaxed text-charcoal shadow-[var(--shadow-card)]">{p.sms}</div>
                <p className="mt-3 text-xs text-muted">{p.smsLength} characters {p.smsLength > 160 ? `(${Math.ceil(p.smsLength / 153)} segments)` : "(1 segment)"}</p>
              </div>
            )}
          </Panel>
          <Panel title="Send a test">
            <form onSubmit={sendTest} className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
              <Field label="Channel" htmlFor="t-ch">
                <select id="t-ch" className={inputCls} value={test.channel} onChange={(e) => setTest({ ...test, channel: e.target.value })}>
                  <option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option>
                </select>
              </Field>
              <Field label={test.channel === "email" ? "Email address" : "Phone number"} htmlFor="t-to">
                <input id="t-to" required className={inputCls} value={test.to} onChange={(e) => setTest({ ...test, to: e.target.value })} placeholder={test.channel === "email" ? "you@example.com" : "(305) 555-0100"} />
              </Field>
              <button className="btn-primary !py-2.5">{test.channel === "email" ? <Mail className="h-4 w-4" aria-hidden /> : <MessageSquare className="h-4 w-4" aria-hidden />} <Send className="h-4 w-4" aria-hidden /> Send test</button>
            </form>
            {testMsg && <p role="status" className="mt-3 text-sm text-navy">{testMsg}</p>}
          </Panel>
        </div>
      </div>
    </>
  );
}
