"use client";

/**
 * My security (every staff role): change password, two-factor sign-in with an authenticator app
 * (QR enrollment, recovery codes shown once), regenerate recovery codes, sign out everywhere.
 */
import { useState } from "react";
import { CheckCircle2, Copy, KeyRound, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { AdminTitle, Panel } from "@/components/admin/admin-shell";
import { api, ApiError, dateTime } from "@/components/admin/api";
import { Field, inputCls } from "@/components/admin/ui";
import { ErrorNote, useApi } from "./shared";

type Security = { email: string; totpEnabled: boolean; recoveryCodesLeft: number; passwordChangedAt: string | null; lastLoginAt: string | null; mustChangePassword: boolean };

export function MySecurity() {
  const { data, error, reload } = useApi<{ security: Security }>("/users/me/security");
  const s = data?.security;
  return (
    <>
      <AdminTitle title="My security" sub={s ? s.email : "Loading…"} />
      <ErrorNote message={error} />
      {s && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ChangePassword security={s} onDone={reload} />
          <TwoFactor security={s} onDone={reload} />
          <Sessions security={s} />
        </div>
      )}
    </>
  );
}

function ChangePassword({ security: s, onDone }: { security: Security; onDone: () => void }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setErrors({});
    if (form.newPassword !== form.confirm) return setErrors({ confirm: "Passwords do not match" });
    try {
      await api("/users/me/password", { method: "POST", json: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      setMsg("Password changed. Other devices were signed out.");
      onDone();
    } catch (err) {
      const ae = err as ApiError;
      setError(ae.message);
      setErrors(Object.fromEntries((ae.details ?? []).map((d) => [d.path, d.message])));
    }
  }
  return (
    <Panel title="Password">
      <p className="mb-4 text-sm text-slate-ink">Last changed: {s.passwordChangedAt ? dateTime(s.passwordChangedAt) : "not recorded"}. Use 12 or more characters; a passphrase is best.</p>
      <ErrorNote message={error} />
      {msg && <p role="status" className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</p>}
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Current password" htmlFor="pw-current" error={errors.currentPassword}><input id="pw-current" type="password" autoComplete="current-password" className={inputCls} value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></Field>
        <Field label="New password" htmlFor="pw-new" error={errors.newPassword || errors.password}><input id="pw-new" type="password" autoComplete="new-password" minLength={12} className={inputCls} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></Field>
        <Field label="Confirm new password" htmlFor="pw-confirm" error={errors.confirm}><input id="pw-confirm" type="password" autoComplete="new-password" className={inputCls} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></Field>
        <button className="btn-navy" disabled={!form.currentPassword || form.newPassword.length < 12}><KeyRound className="h-4 w-4" aria-hidden /> Change password</button>
      </form>
    </Panel>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-orange/40 bg-orange-50 p-4">
      <p className="text-sm font-semibold text-orange-700">Save these recovery codes now</p>
      <p className="mt-1 text-xs text-slate-ink">Each code works once if you lose your phone. They will not be shown again.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-navy" data-testid="recovery-codes">{codes.map((c) => <li key={c} className="rounded-lg bg-white px-2 py-1 text-center">{c}</li>)}</ul>
      <button className="btn-ghost mt-3 !py-1.5" onClick={() => navigator.clipboard?.writeText(codes.join("\n")).then(() => setCopied(true))}><Copy className="h-4 w-4" aria-hidden /> {copied ? "Copied" : "Copy codes"}</button>
    </div>
  );
}

function TwoFactor({ security: s, onDone }: { security: Security; onDone: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    try {
      setSetup(await api<{ secret: string; qrDataUrl: string }>("/users/me/2fa/setup", { method: "POST" }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const enable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ recoveryCodes: string[] }>("/users/me/2fa/enable", { method: "POST", json: { code } });
      setCodes(r.recoveryCodes);
      setSetup(null);
      setCode("");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api("/users/me/2fa/disable", { method: "POST", json: { password, code } });
      setPassword("");
      setCode("");
      setCodes(null);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const regenerate = async () => {
    setError(null);
    try {
      const r = await api<{ recoveryCodes: string[] }>("/users/me/2fa/recovery-codes", { method: "POST", json: { code } });
      setCodes(r.recoveryCodes);
      setCode("");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Panel title="Two-factor sign-in">
      <ErrorNote message={error} />
      {codes && <div className="mb-4"><RecoveryCodes codes={codes} /></div>}
      {s.totpEnabled ? (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden /> On. You will be asked for a 6-digit code at sign-in.</p>
          <p className="text-xs text-muted">{s.recoveryCodesLeft} recovery code{s.recoveryCodesLeft === 1 ? "" : "s"} left.</p>
          <form onSubmit={disable} className="grid gap-3 border-t border-line pt-4">
            <Field label="Code from your app" htmlFor="tf-code"><input id="tf-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={inputCls} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></Field>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" disabled={code.length !== 6} onClick={regenerate}>New recovery codes</button>
            </div>
            <Field label="Password (to turn off)" htmlFor="tf-pw"><input id="tf-pw" type="password" autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <button className="btn-ghost" disabled={!password || code.length !== 6}>Turn off two-factor</button>
          </form>
        </div>
      ) : setup ? (
        <form onSubmit={enable} className="grid gap-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-ink">
            <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
            <li>Scan this code, or type the key below.</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- generated QR data URL */}
            <img src={setup.qrDataUrl} alt="QR code for your authenticator app" width={180} height={180} className="rounded-xl border border-line" />
            <div className="min-w-0 text-sm">
              <p className="text-xs uppercase tracking-wider text-muted">Setup key</p>
              <code className="mt-1 block break-all rounded-lg bg-cloud px-2 py-1.5 font-mono text-navy" data-testid="totp-secret">{setup.secret}</code>
            </div>
          </div>
          <Field label="6-digit code" htmlFor="tf-enable-code"><input id="tf-enable-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={inputCls} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></Field>
          <button className="btn-primary" disabled={code.length !== 6}><ShieldCheck className="h-4 w-4" aria-hidden /> Turn on two-factor</button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-ink">Protect your account with a second step: a 6-digit code from an authenticator app on your phone. Strongly recommended for owner and office accounts.</p>
          <button className="btn-primary" onClick={start}><Smartphone className="h-4 w-4" aria-hidden /> Set up two-factor</button>
        </div>
      )}
    </Panel>
  );
}

function Sessions({ security: s }: { security: Security }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Panel title="Sessions">
      <p className="text-sm text-slate-ink">Last sign-in: {s.lastLoginAt ? dateTime(s.lastLoginAt) : "unknown"}. Sessions last up to 10 hours.</p>
      {msg && <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</p>}
      <button className="btn-ghost mt-4" onClick={() => api("/users/me/sign-out-everywhere", { method: "POST" }).then(() => setMsg("Every other device was signed out.")).catch((e: Error) => setMsg(e.message))}>
        <LogOut className="h-4 w-4" aria-hidden /> Sign out all other devices
      </button>
    </Panel>
  );
}
