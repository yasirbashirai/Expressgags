"use client";

/**
 * Driver sign-in. Uses the staff login endpoint; if the account has two-factor authentication the
 * API answers { twoFactorRequired: true } and we ask for the 6-digit code, then re-post with `totp`.
 * Only DRIVER (or OWNER) accounts may continue into the app.
 */
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DriverApiError, driverFetch } from "./api";

export function DriverLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await driverFetch<{ ok: boolean; twoFactorRequired?: boolean }>("/v1/admin/auth/login", {
        method: "POST",
        json: { email, password, ...(needsCode ? { totp } : {}) },
      });
      if (res.twoFactorRequired) {
        setNeedsCode(true);
        setBusy(false);
        return;
      }
      await driverFetch("/v1/driver/me"); // confirms the account is set up for the driver app
      const next = params.get("next");
      router.replace(next && next.startsWith("/driver") ? next : "/driver");
    } catch (err) {
      const e = err as DriverApiError;
      if (e.body?.twoFactorRequired) setNeedsCode(true);
      setError(e.status === 403 ? "This account is not set up for the driver app. Please contact dispatch." : e.message);
      setBusy(false);
    }
  };

  const field = "min-h-14 w-full rounded-2xl border-2 border-white/20 bg-white px-4 text-base text-charcoal focus:border-orange focus:outline-none";
  return (
    <div className="flex min-h-dvh flex-col bg-navy px-5 py-10 text-white">
      <div className="mx-auto w-full max-w-sm flex-1">
        <Image src="/brand/express-bags-logo-reversed.png" alt="Express Bags, Inc." width={600} height={244} className="h-16 w-auto" priority />
        <h1 className="mt-10 font-display text-3xl font-extrabold text-white">Driver sign in</h1>
        <p className="mt-2 text-white/75">Your jobs, scans and proof of delivery in one place.</p>
        {params.get("resume") && <p className="mt-4 rounded-xl bg-white/10 p-3 text-sm">Sign in again to sync the work saved on this phone.</p>}
        <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
          {!needsCode ? (
            <>
              <div>
                <label htmlFor="d-email" className="mb-1.5 block text-sm font-semibold">Email</label>
                <input id="d-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
              </div>
              <div>
                <label htmlFor="d-password" className="mb-1.5 block text-sm font-semibold">Password</label>
                <input id="d-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="d-totp" className="mb-1.5 block text-sm font-semibold">6-digit code from your authenticator app</label>
              <input id="d-totp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))} className={`${field} text-center font-mono text-2xl tracking-[0.4em]`} />
            </div>
          )}
          {error && <p role="alert" className="rounded-xl bg-rose-600/90 p-3 text-sm font-semibold">{error}</p>}
          <button type="submit" disabled={busy} className="min-h-14 w-full rounded-2xl bg-orange-600 text-lg font-bold text-white shadow-lg active:bg-orange-600 disabled:opacity-60">
            {busy ? "Signing in…" : needsCode ? "Verify code" : "Sign in"}
          </button>
        </form>
      </div>
      <p className="mx-auto mt-10 max-w-sm text-center text-xs text-white/50">Trouble signing in? Contact dispatch. Never share your login.</p>
    </div>
  );
}
