"use client";

/**
 * Driver sync context: every action goes through the offline queue (enqueue → flush). When online the
 * result comes back immediately; when offline the action is kept on the phone and replayed later.
 * Exposes the pending count for the "N actions waiting to sync" banner.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { API_URL } from "./api";
import { flushQueue, shouldRetry, type JsonAction, type QueuedAction, type SendResult, type UploadAction } from "./offline-queue";
import { getQueueStore } from "./queue-store";
import { uuid } from "./media";

export type RunOutcome =
  | { state: "sent"; status: number; body: Record<string, unknown> }
  | { state: "queued" }
  | { state: "failed"; status: number; error: string; body: Record<string, unknown> };

type NewJson = Omit<JsonAction, "id" | "key" | "createdAt" | "kind">;
type NewUpload = Omit<UploadAction, "id" | "key" | "createdAt" | "kind" | "ref"> & { ref?: string };

type Ctx = {
  online: boolean;
  pending: number;
  needsLogin: boolean;
  lastFailure: string | null;
  runJson: (a: NewJson) => Promise<RunOutcome>;
  runUpload: (a: NewUpload) => Promise<RunOutcome & { ref: string }>;
  flush: () => Promise<void>;
  clearFailure: () => void;
};

const SyncContext = createContext<Ctx | null>(null);
export const useDriverSync = () => {
  const c = useContext(SyncContext);
  if (!c) throw new Error("useDriverSync must be used inside <DriverSyncProvider>");
  return c;
};

async function send(action: QueuedAction, resolvedBody?: unknown): Promise<SendResult> {
  let res: Response;
  try {
    if (action.kind === "json") {
      res = await fetch(`${API_URL}${action.path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": action.key },
        body: JSON.stringify(resolvedBody ?? action.body),
      });
    } else {
      const form = new FormData();
      for (const [k, v] of Object.entries(action.fields)) form.append(k, v);
      form.append("file", action.file, action.filename);
      res = await fetch(`${API_URL}${action.path}`, { method: "POST", credentials: "include", headers: { "Idempotency-Key": action.key }, body: form });
    }
  } catch {
    return { ok: false, retry: true, status: 0, body: {}, error: "No connection" };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, status: res.status, body };
  return { ok: false, retry: shouldRetry(res.status), status: res.status, body, error: String(body.error || `Request failed (${res.status})`) };
}

export function DriverSyncProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [lastFailure, setLastFailure] = useState<string | null>(null);
  const mounted = useRef(true);

  const refreshCount = useCallback(async () => {
    const store = await getQueueStore();
    const n = (await store.load()).length;
    if (mounted.current) setPending(n);
  }, []);

  const doFlush = useCallback(async () => {
    const store = await getQueueStore();
    const report = await flushQueue(store, send);
    const results = Object.values(report.results);
    setNeedsLogin(results.some((r) => !r.ok && r.status === 401));
    const finalFailure = results.find((r) => !r.ok && !r.retry);
    if (finalFailure && !finalFailure.ok) setLastFailure(finalFailure.error);
    if (mounted.current) setPending(report.remaining);
    return report;
  }, []);

  useEffect(() => {
    mounted.current = true;
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    void refreshCount();
    const goOnline = () => {
      setOnline(true);
      void doFlush();
    };
    const goOffline = () => setOnline(false);
    const onVisible = () => document.visibilityState === "visible" && void doFlush();
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => void doFlush(), 20_000);
    void doFlush();
    return () => {
      mounted.current = false;
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [doFlush, refreshCount]);

  const enqueueAndFlush = useCallback(
    async (action: QueuedAction): Promise<RunOutcome> => {
      const store = await getQueueStore();
      await store.update((q) => [...q, action]);
      setPending((p) => p + 1);
      const report = await doFlush();
      const r = report.results[action.id];
      if (!r) return { state: "queued" }; // blocked behind an earlier action still waiting
      if (r.ok) return { state: "sent", status: r.status, body: r.body };
      if (r.retry) return { state: "queued" };
      return { state: "failed", status: r.status, error: r.error, body: r.body };
    },
    [doFlush],
  );

  const runJson = useCallback((a: NewJson) => enqueueAndFlush({ ...a, kind: "json", id: uuid(), key: uuid(), createdAt: Date.now() }), [enqueueAndFlush]);
  const runUpload = useCallback(
    async (a: NewUpload) => {
      const ref = a.ref ?? uuid();
      const outcome = await enqueueAndFlush({ ...a, ref, kind: "upload", id: uuid(), key: uuid(), createdAt: Date.now() });
      return { ...outcome, ref };
    },
    [enqueueAndFlush],
  );

  const value: Ctx = {
    online,
    pending,
    needsLogin,
    lastFailure,
    runJson,
    runUpload,
    flush: async () => void (await doFlush()),
    clearFailure: () => setLastFailure(null),
  };
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
