"use client";

/**
 * Driver app chrome: session check (→ /driver/login), compact header, connectivity + sync banner,
 * service-worker registration (scope /driver only). Phone-first, high contrast for outdoor use.
 */
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CloudOff, LogOut, RefreshCw, TriangleAlert } from "lucide-react";
import { DriverApiError, driverFetch, offlineCache } from "./api";
import { pendingLabel } from "./offline-queue";
import { DriverSyncProvider, useDriverSync } from "./sync-provider";

export type DriverMe = { user: { id: string; email: string; role: string }; employee: { firstName: string; lastName: string; homeMarket: string | null } | null; displayName: string };
const MeContext = createContext<DriverMe | null>(null);
export const useDriverMe = () => useContext(MeContext);

/** Registers the /driver-only service worker (app shell caching for flaky connections). */
function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/driver-sw.js", { scope: "/driver" }).catch(() => undefined);
  }, []);
}

function SyncBanner() {
  const { online, pending, needsLogin, lastFailure, flush, clearFailure } = useDriverSync();
  const router = useRouter();
  if (needsLogin) {
    return (
      <div role="status" className="flex items-center justify-between gap-3 bg-orange px-4 py-2.5 text-sm font-semibold text-white">
        <span>Session expired. {pendingLabel(pending)}.</span>
        <button onClick={() => router.push("/driver/login?resume=1")} className="min-h-10 rounded-full bg-white px-4 text-orange-700">Sign in</button>
      </div>
    );
  }
  if (lastFailure) {
    return (
      <div role="alert" className="flex items-start justify-between gap-3 bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white">
        <span className="flex gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {lastFailure}</span>
        <button onClick={clearFailure} className="min-h-10 shrink-0 rounded-full border border-white/50 px-3">OK</button>
      </div>
    );
  }
  if (!online || pending > 0) {
    return (
      <div role="status" data-testid="sync-banner" className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold ${online ? "bg-navy-700 text-white" : "bg-charcoal text-white"}`}>
        <span className="flex items-center gap-2">
          {!online && <CloudOff className="h-4 w-4" aria-hidden />}
          {online ? pendingLabel(pending) : `Offline. ${pending ? pendingLabel(pending) : "Work is saved on this phone."}`}
        </span>
        {online && pending > 0 && (
          <button onClick={() => void flush()} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white/15 px-3">
            <RefreshCw className="h-4 w-4" aria-hidden /> Sync now
          </button>
        )}
      </div>
    );
  }
  return null;
}

function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<DriverMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  useServiceWorker();

  useEffect(() => {
    driverFetch<DriverMe>("/v1/driver/me")
      .then(setMe)
      .catch((e: DriverApiError) => {
        if (e.status === 401) router.replace(`/driver/login?next=${encodeURIComponent(pathname)}`);
        else if (e.status === 0) {
          // Offline on launch: keep working from cached screens
          setMe({ user: { id: "", email: "", role: "DRIVER" }, employee: null, displayName: "Driver (offline)" });
        } else setError(e.message);
      });
  }, [router, pathname]);

  const signOut = async () => {
    await driverFetch("/v1/admin/auth/logout", { method: "POST" }).catch(() => undefined);
    offlineCache.clear(); // personal job data never outlives the session on a shared phone
    router.replace("/driver/login");
  };

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center bg-navy p-6 text-center text-white">
        <div>
          <p className="font-display text-xl font-bold">Driver app unavailable</p>
          <p className="mt-2 text-white/80">{error}</p>
          <button onClick={signOut} className="mt-6 min-h-12 rounded-full bg-orange px-6 font-bold">Sign in with another account</button>
        </div>
      </div>
    );
  }
  if (!me) return <div className="grid min-h-dvh place-items-center bg-cloud text-base text-slate-ink">Loading your jobs…</div>;

  return (
    <MeContext.Provider value={me}>
      <div className="flex min-h-dvh flex-col bg-cloud">
        <header className="sticky top-0 z-30 bg-navy text-white shadow-md">
          <div className="mx-auto flex h-16 max-w-xl items-center justify-between gap-3 px-4">
            <Link href="/driver" className="flex items-center gap-3" aria-label="Express Bags driver home">
              <Image src="/brand/express-bags-logo-reversed.png" alt="" width={600} height={244} className="h-9 w-auto" priority />
              <span className="sr-only">Express Bags Driver</span>
            </Link>
            <div className="flex items-center gap-2">
              <span className="max-w-[9rem] truncate text-sm font-semibold text-white/90">{me.employee?.firstName ?? me.displayName}</span>
              <button onClick={signOut} aria-label="Sign out" className="grid h-11 w-11 place-items-center rounded-full bg-white/10 active:bg-white/20">
                <LogOut className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>
          <SyncBanner />
        </header>
        <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 pb-28 pt-4">{children}</main>
      </div>
    </MeContext.Provider>
  );
}

export function DriverAppShell({ children }: { children: ReactNode }) {
  return (
    <DriverSyncProvider>
      <Shell>{children}</Shell>
    </DriverSyncProvider>
  );
}
