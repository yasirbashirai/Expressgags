"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Lock, Smartphone } from "lucide-react";
import { api, ApiError } from "./api";
import { AdminLayer } from "./admin-shell";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Second step: the password was right and the account has two-factor sign-in */
  const [twoFactor, setTwoFactor] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { email, password, ...(twoFactor ? (useRecovery ? { recoveryCode: code } : { totp: code }) : {}) };
      const r = await api<{ twoFactorRequired?: boolean; user?: { role: string } }>("/auth/login", { method: "POST", json: body });
      if (r.twoFactorRequired) {
        setTwoFactor(true);
        setBusy(false);
        return;
      }
      const next = params.get("next");
      // Drivers belong in the driver app, not the office admin
      router.replace(r.user?.role === "DRIVER" ? "/driver" : next && next.startsWith("/admin") ? next : "/admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed.");
      setCode("");
      setBusy(false);
    }
  }

  return (
    <AdminLayer>
      <div className="grid min-h-screen lg:grid-cols-2">
        <div className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div aria-hidden className="absolute -right-32 -top-32 h-[30rem] w-[30rem] rounded-full border-[26px] border-orange/40" />
          <Image src="/brand/express-bags-logo-reversed.png" alt="Express Bags, Inc." width={600} height={244} className="relative h-16 w-auto self-start" />
          <div className="relative">
            <p className="eyebrow !text-orange-100">Operations admin</p>
            <h1 className="mt-4 max-w-md text-4xl font-extrabold leading-tight text-white">Every request, routed and accounted for.</h1>
            <p className="mt-4 max-w-md text-white/70">Quote requests, settings and pricing rules for the Express Bags platform. Authorized staff only.</p>
          </div>
          <div className="flight-line relative opacity-70" aria-hidden />
        </div>

        <div className="flex items-center justify-center p-6">
          <form onSubmit={submit} className="card w-full max-w-sm p-8" noValidate>
            <Image src="/brand/express-bags-logo-transparent.png" alt="Express Bags, Inc." width={600} height={244} className="mb-6 h-12 w-auto lg:hidden" />
            <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-full bg-orange-50 text-orange-700">
              <Lock className="h-5 w-5" aria-hidden />
            </div>
            <h2 className="text-2xl font-bold text-navy">Sign in</h2>
            <p className="mt-1 text-sm text-muted">Use your Express Bags staff account.</p>

            {!twoFactor ? (
              <>
                <label className="mt-6 block text-sm font-medium text-navy" htmlFor="email">Email</label>
                <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/15" />

                <div className="mt-4 flex items-baseline justify-between">
                  <label className="block text-sm font-medium text-navy" htmlFor="password">Password</label>
                  <Link href="/admin/reset-password" className="text-xs font-medium text-orange-700 hover:underline">Forgot password?</Link>
                </div>
                <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/15" />
              </>
            ) : (
              <>
                <p className="mt-6 flex items-center gap-2 text-sm text-slate-ink"><Smartphone className="h-4 w-4 text-orange" aria-hidden /> {useRecovery ? "Enter one of your recovery codes." : "Enter the 6-digit code from your authenticator app."}</p>
                <label className="mt-4 block text-sm font-medium text-navy" htmlFor="totp">{useRecovery ? "Recovery code" : "Authentication code"}</label>
                <input id="totp" autoFocus inputMode={useRecovery ? "text" : "numeric"} autoComplete="one-time-code" maxLength={useRecovery ? 14 : 6} required value={code}
                  onChange={(e) => setCode(useRecovery ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ""))}
                  className="mt-1.5 w-full rounded-xl border border-line px-4 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-navy focus:ring-2 focus:ring-navy/15" />
                <button type="button" className="mt-2 text-xs font-medium text-orange-700 hover:underline" onClick={() => { setUseRecovery(!useRecovery); setCode(""); }}>
                  {useRecovery ? "Use the authenticator app instead" : "Lost your phone? Use a recovery code"}
                </button>
              </>
            )}

            {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

            <button type="submit" disabled={busy || !email || !password || (twoFactor && code.length < 6)} className="btn-primary mt-6 w-full">
              {busy ? "Signing in…" : twoFactor ? "Verify and sign in" : "Sign in"}
            </button>
            {twoFactor && (
              <button type="button" className="mt-3 w-full text-center text-xs text-muted hover:text-navy" onClick={() => { setTwoFactor(false); setCode(""); setError(null); }}>Start over</button>
            )}
          </form>
        </div>
      </div>
    </AdminLayer>
  );
}
