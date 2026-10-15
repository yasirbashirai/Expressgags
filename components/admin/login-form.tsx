"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";
import { api, ApiError } from "./api";
import { AdminLayer } from "./admin-shell";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", json: { email, password } });
      const next = params.get("next");
      router.replace(next && next.startsWith("/admin") ? next : "/admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed.");
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

            <label className="mt-6 block text-sm font-medium text-navy" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/15" />

            <label className="mt-4 block text-sm font-medium text-navy" htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/15" />

            {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

            <button type="submit" disabled={busy || !email || !password} className="btn-primary mt-6 w-full">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </AdminLayer>
  );
}
