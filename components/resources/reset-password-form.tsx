"use client";

/**
 * Staff password reset & invite acceptance (no session). Without a token: request a reset link by email.
 * With ?token=…: verify the link, then set a new password (12+ characters; single-use link).
 */
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { api, ApiError } from "@/components/admin/api";
import { AdminLayer } from "@/components/admin/admin-shell";

const inputCls = "mt-1.5 w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/15";

export function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  return (
    <AdminLayer>
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card w-full max-w-sm p-8">
          <Image src="/brand/express-bags-logo-transparent.png" alt="Express Bags, Inc." width={600} height={244} className="mb-6 h-12 w-auto" />
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-orange-50 text-orange-700"><KeyRound className="h-5 w-5" aria-hidden /></div>
          {token ? <SetPassword token={token} /> : <RequestLink />}
          <Link href="/admin/login" className="mt-6 block text-center text-sm text-muted hover:text-navy">Back to sign in</Link>
        </div>
      </div>
    </AdminLayer>
  );
}

function RequestLink() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api<{ message: string }>("/auth/forgot", { method: "POST", json: { email } });
      setMsg(r.message);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <form onSubmit={submit}>
      <h1 className="text-2xl font-bold text-navy">Reset your password</h1>
      <p className="mt-1 text-sm text-muted">We will email you a link that works once, for one hour.</p>
      {msg ? (
        <p role="status" className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{msg}</p>
      ) : (
        <>
          <label className="mt-6 block text-sm font-medium text-navy" htmlFor="rp-email">Staff email</label>
          <input id="rp-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
          <button className="btn-primary mt-6 w-full" disabled={!email}>Email me a reset link</button>
        </>
      )}
    </form>
  );
}

function SetPassword({ token }: { token: string }) {
  const [info, setInfo] = useState<{ purpose: string; email: string } | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ purpose: string; email: string }>(`/auth/token?token=${encodeURIComponent(token)}`).then(setInfo).catch((e: Error) => setInvalid(e.message));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    try {
      await api("/auth/reset", { method: "POST", json: { token, password: pw } });
      setDone(true);
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  }

  if (invalid) return <><h1 className="text-2xl font-bold text-navy">Link not valid</h1><p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{invalid}</p><Link href="/admin/reset-password" className="btn-navy mt-6 w-full">Request a new link</Link></>;
  if (!info) return <p className="text-sm text-muted">Checking your link…</p>;
  if (done) return <><h1 className="text-2xl font-bold text-navy">Password set</h1><p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">You can now sign in with your new password.</p><Link href="/admin/login" className="btn-primary mt-6 w-full">Sign in</Link></>;
  return (
    <form onSubmit={submit}>
      <h1 className="text-2xl font-bold text-navy">{info.purpose === "invite" ? "Welcome to Express Bags" : "Choose a new password"}</h1>
      <p className="mt-1 break-all text-sm text-muted">{info.email}</p>
      <input type="text" name="username" autoComplete="username" value={info.email} readOnly hidden />
      <label className="mt-6 block text-sm font-medium text-navy" htmlFor="sp-pw">New password</label>
      <input id="sp-pw" type="password" autoComplete="new-password" minLength={12} required value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} aria-describedby="sp-hint" />
      <p id="sp-hint" className="mt-1 text-xs text-muted">At least 12 characters, and not containing your email name. A short sentence works well.</p>
      <label className="mt-4 block text-sm font-medium text-navy" htmlFor="sp-confirm">Confirm password</label>
      <input id="sp-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      <button className="btn-primary mt-6 w-full" disabled={busy || pw.length < 12}>{busy ? "Saving…" : "Set password"}</button>
    </form>
  );
}
