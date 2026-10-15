"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { contact, markets } from "@/content/site";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Status = { state: "idle" } | { state: "sending" } | { state: "done"; reference?: string } | { state: "error"; message: string };

/* ---------------- shared field primitives ---------------- */
export function Field({ label, htmlFor, required, hint, children }: { label: string; htmlFor: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-navy">
        {label} {required && <span className="text-orange-700" aria-hidden>*</span>}
      </label>
      {hint && <p id={`${htmlFor}-hint`} className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export const inputCls =
  "block w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] text-charcoal shadow-sm outline-none transition placeholder:text-muted/70 focus:border-navy focus:ring-4 focus:ring-navy/10";

function Honeypot() {
  return (
    <div aria-hidden className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
      <label htmlFor="website">Website</label>
      <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
    </div>
  );
}

function StatusMessage({ status, successTitle }: { status: Status; successTitle: string }) {
  if (status.state === "done")
    return (
      <div role="status" className="flex gap-3 rounded-2xl border border-green-200 bg-green-50 p-5 text-green-900">
        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">{successTitle}</p>
          <p className="mt-1 text-sm">
            {status.reference ? <>Your reference is <strong>{status.reference}</strong>. </> : null}
            Our team will reply during business hours.
          </p>
        </div>
      </div>
    );
  if (status.state === "error")
    return (
      <div role="alert" className="flex gap-3 rounded-2xl border border-orange-100 bg-orange-50 p-5 text-charcoal">
        <AlertTriangle className="h-5 w-5 shrink-0 text-orange-700" aria-hidden />
        <div>
          <p className="font-semibold">We couldn&apos;t send your message.</p>
          <p className="mt-1 text-sm">
            {status.message} Please try again, or call our office at{" "}
            <a href={contact.phoneHref} className="font-semibold text-orange-700 underline">{contact.phoneDisplay}</a>.
          </p>
        </div>
      </div>
    );
  return null;
}

async function readError(res: Response) {
  try {
    const body = await res.json();
    return body?.error?.message || body?.message || `Request failed (${res.status}).`;
  } catch {
    return `Request failed (${res.status}).`;
  }
}

/* ---------------- Contact form ---------------- */
export const CONTACT_TOPICS = [
  "General question",
  "Existing booking or job",
  "Business account inquiry",
  "Partnership",
  "Media or other",
];

export function ContactForm() {
  const [status, setStatus] = useState<Status>({ state: "idle" });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || ""),
      email: String(fd.get("email") || ""),
      phone: String(fd.get("phone") || ""),
      topic: String(fd.get("topic") || ""),
      message: String(fd.get("message") || ""),
      consent: fd.get("consent") === "on",
      website: String(fd.get("website") || ""),
    };
    setStatus({ state: "sending" });
    try {
      const res = await fetch(`${API}/v1/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) return setStatus({ state: "error", message: await readError(res) });
      const body = await res.json().catch(() => ({}));
      setStatus({ state: "done", reference: body?.reference });
      e.currentTarget?.reset?.();
    } catch {
      setStatus({ state: "error", message: "Our message service is not reachable right now." });
    }
  }

  if (status.state === "done") return <StatusMessage status={status} successTitle="Thank you, your message was sent." />;

  return (
    <form onSubmit={onSubmit} className="relative grid gap-5" noValidate={false}>
      <Honeypot />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="c-name" required><input id="c-name" name="name" required minLength={2} autoComplete="name" className={inputCls} /></Field>
        <Field label="Phone" htmlFor="c-phone" required><input id="c-phone" name="phone" type="tel" required minLength={7} autoComplete="tel" className={inputCls} /></Field>
      </div>
      <Field label="Email" htmlFor="c-email" required><input id="c-email" name="email" type="email" required autoComplete="email" className={inputCls} /></Field>
      <Field label="Topic" htmlFor="c-topic" required>
        <select id="c-topic" name="topic" required className={inputCls} defaultValue="">
          <option value="" disabled>Choose a topic</option>
          {CONTACT_TOPICS.map((t) => (<option key={t}>{t}</option>))}
        </select>
      </Field>
      <Field label="Message" htmlFor="c-message" required hint="For a price, the quote form collects everything dispatch needs.">
        <textarea id="c-message" name="message" required minLength={10} rows={5} aria-describedby="c-message-hint" className={inputCls} />
      </Field>
      <label className="flex items-start gap-3 text-sm text-slate-ink">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 rounded border-line accent-[#E06010]" />
        <span>I agree to be contacted by Express Bags about this message. See our <a href="/privacy-policy" className="text-orange-700 underline">Privacy Policy</a>.</span>
      </label>
      <StatusMessage status={status} successTitle="" />
      <button type="submit" className="btn-primary justify-self-start" disabled={status.state === "sending"}>
        {status.state === "sending" ? (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Sending…</>) : "Send message"}
      </button>
    </form>
  );
}

/* ---------------- Careers application ---------------- */
export const CAREER_ROLES = ["Driver", "Helper", "Dispatch & customer support", "Other"];

export function CareersForm() {
  const [status, setStatus] = useState<Status>({ state: "idle" });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("consent", fd.get("consent") === "on" ? "true" : "false");
    const file = fd.get("resume");
    if (file instanceof File && file.size === 0) fd.delete("resume");
    if (file instanceof File && file.size > 5 * 1024 * 1024) {
      return setStatus({ state: "error", message: "Your resume is larger than 5 MB." });
    }
    setStatus({ state: "sending" });
    try {
      const res = await fetch(`${API}/v1/careers`, { method: "POST", body: fd });
      if (!res.ok) return setStatus({ state: "error", message: await readError(res) });
      const body = await res.json().catch(() => ({}));
      setStatus({ state: "done", reference: body?.reference });
      form.reset();
    } catch {
      setStatus({ state: "error", message: "Our application service is not reachable right now." });
    }
  }

  if (status.state === "done") return <StatusMessage status={status} successTitle="Thank you, your application was received." />;

  return (
    <form onSubmit={onSubmit} className="relative grid gap-5" encType="multipart/form-data">
      <Honeypot />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="a-name" required><input id="a-name" name="name" required minLength={2} autoComplete="name" className={inputCls} /></Field>
        <Field label="Phone" htmlFor="a-phone" required><input id="a-phone" name="phone" type="tel" required minLength={7} autoComplete="tel" className={inputCls} /></Field>
      </div>
      <Field label="Email" htmlFor="a-email" required><input id="a-email" name="email" type="email" required autoComplete="email" className={inputCls} /></Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Role" htmlFor="a-role" required>
          <select id="a-role" name="role" required defaultValue="" className={inputCls}>
            <option value="" disabled>Choose a role</option>
            {CAREER_ROLES.map((r) => (<option key={r}>{r}</option>))}
          </select>
        </Field>
        <Field label="Preferred market" htmlFor="a-market" required>
          <select id="a-market" name="market" required defaultValue="" className={inputCls}>
            <option value="" disabled>Choose a market</option>
            {markets.map((m) => (<option key={m.slug} value={m.slug}>{m.name}</option>))}
          </select>
        </Field>
      </div>
      <Field label="Relevant experience" htmlFor="a-exp" hint="Vehicle types, hospitality or airport experience, years driving commercially.">
        <textarea id="a-exp" name="experience" rows={3} aria-describedby="a-exp-hint" className={inputCls} />
      </Field>
      <Field label="Anything else we should know?" htmlFor="a-msg"><textarea id="a-msg" name="message" rows={3} className={inputCls} /></Field>
      <Field label="Resume (optional)" htmlFor="a-resume" hint="PDF or Word, up to 5 MB.">
        <input id="a-resume" name="resume" type="file" accept=".pdf,.doc,.docx" aria-describedby="a-resume-hint" className="block w-full text-sm text-slate-ink file:mr-4 file:rounded-full file:border-0 file:bg-navy file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" />
      </Field>
      <label className="flex items-start gap-3 text-sm text-slate-ink">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 rounded border-line accent-[#E06010]" />
        <span>I agree that Express Bags may store and review my application for hiring purposes. See our <a href="/privacy-policy" className="text-orange-700 underline">Privacy Policy</a>.</span>
      </label>
      <StatusMessage status={status} successTitle="" />
      <button type="submit" className="btn-primary justify-self-start" disabled={status.state === "sending"}>
        {status.state === "sending" ? (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Sending…</>) : "Submit application"}
      </button>
    </form>
  );
}
