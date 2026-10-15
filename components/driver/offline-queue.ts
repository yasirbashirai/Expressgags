/**
 * Driver offline action queue (pure logic, no browser APIs; storage is injected).
 *
 * Every driver action (scan, status, photo, proof, exception) is enqueued with an idempotency key and
 * flushed in order. When the phone is offline (or the API is unreachable) actions stay queued and are
 * replayed later; the server's idempotency log guarantees a replay never duplicates.
 *
 * Photos are uploaded first and referenced by later actions as "ref:<localRef>" until the server id is
 * known (e.g. a proof that lists photoUploadIds: ["ref:p1"]).
 */

export type JsonAction = {
  id: string;
  kind: "json";
  orderId: string;
  label: string;
  path: string;
  body: unknown;
  key: string;
  createdAt: number;
};

export type UploadAction = {
  id: string;
  kind: "upload";
  orderId: string;
  label: string;
  path: string;
  file: Blob;
  filename: string;
  fields: Record<string, string>;
  key: string;
  /** Local reference later actions use ("ref:<ref>") until the server upload id is known */
  ref: string;
  createdAt: number;
};

export type QueuedAction = JsonAction | UploadAction;

export interface QueueStore {
  load(): Promise<QueuedAction[]>;
  save(actions: QueuedAction[]): Promise<void>;
  /** Atomic read-modify-write (enqueue and remove must never overwrite each other). */
  update(fn: (actions: QueuedAction[]) => QueuedAction[]): Promise<void>;
  loadRefs(): Promise<Record<string, string>>;
  saveRefs(refs: Record<string, string>): Promise<void>;
}

/** Outcome of sending one action. `retry` = keep it queued (offline, timeout, 5xx). */
export type SendResult = { ok: true; status: number; body: Record<string, unknown> } | { ok: false; retry: boolean; status: number; body: Record<string, unknown>; error: string };

export type FlushReport = {
  results: Record<string, SendResult>;
  sent: number;
  dropped: number;
  remaining: number;
};

export const REF_PREFIX = "ref:";

/** Replace "ref:<x>" strings (anywhere in the body) with the server ids collected so far. */
export function resolveRefs<T>(value: T, refs: Record<string, string>): { value: T; missing: string[] } {
  const missing: string[] = [];
  const walk = (v: unknown): unknown => {
    if (typeof v === "string" && v.startsWith(REF_PREFIX)) {
      const id = refs[v.slice(REF_PREFIX.length)];
      if (!id) missing.push(v);
      return id ?? v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object" && !(v instanceof Blob)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { value: walk(value) as T, missing };
}

/**
 * Classify an HTTP outcome: network errors, 5xx/408/429 retry later, and 401 waits for the driver to sign
 * in again (an expired session must never discard queued proof). Other 4xx are final.
 */
export function shouldRetry(status: number): boolean {
  return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
}

let flushing: Promise<FlushReport> | null = null;

/**
 * Send queued actions in order. Stops at the first retryable failure (to preserve order);
 * final failures are dropped and reported so the UI can tell the driver.
 * A call made while a flush is running waits for it and then runs a fresh flush, so an action enqueued
 * mid-flush is always attempted (and its result reported) by the caller that enqueued it.
 */
export function flushQueue(store: QueueStore, send: (a: QueuedAction, resolvedBody?: unknown) => Promise<SendResult>): Promise<FlushReport> {
  if (flushing) {
    // The running flush may already have sent the caller's action: merge its results into ours
    return flushing.then((prev) => flushQueue(store, send).then((next) => ({ ...next, results: { ...prev.results, ...next.results } })));
  }
  flushing = (async () => {
    const results: Record<string, SendResult> = {};
    let sent = 0;
    let dropped = 0;
    const refs = await store.loadRefs();
    // Re-read the stored queue on every step: actions may be enqueued while we are sending,
    // and saving a stale snapshot would silently drop them.
    for (;;) {
      const queue = await store.load();
      if (!queue.length) break;
      const action = queue[0];
      let resolved: unknown;
      if (action.kind === "json") {
        const r = resolveRefs(action.body, refs);
        const waitingOnUpload = r.missing.length > 0 && queue.some((q) => q.kind === "upload" && r.missing.includes(REF_PREFIX + q.ref));
        // A dependency (photo) still queued ahead → wait; if it is gone it failed permanently: send anyway
        // and let the server reject the unknown id with a clear message
        if (waitingOnUpload) break;
        resolved = r.value;
      }
      let result: SendResult;
      try {
        result = await send(action, resolved);
      } catch (e) {
        result = { ok: false, retry: true, status: 0, body: {}, error: e instanceof Error ? e.message : "Network error" };
      }
      results[action.id] = result;
      if (!result.ok && result.retry) break;
      if (result.ok) {
        sent++;
        if (action.kind === "upload" && typeof result.body.id === "string") {
          refs[action.ref] = result.body.id;
          await store.saveRefs(refs);
        }
      } else {
        dropped++;
      }
      await store.update((q) => q.filter((x) => x.id !== action.id));
    }
    return { results, sent, dropped, remaining: (await store.load()).length };
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** In-memory store (tests, and the fallback when the browser blocks storage). */
export function memoryStore(initial: QueuedAction[] = []): QueueStore & { actions: QueuedAction[]; refs: Record<string, string> } {
  const s = {
    actions: [...initial],
    refs: {} as Record<string, string>,
    async load() { return [...s.actions]; },
    async save(a: QueuedAction[]) { s.actions = [...a]; },
    async update(fn: (a: QueuedAction[]) => QueuedAction[]) { s.actions = fn([...s.actions]); },
    async loadRefs() { return { ...s.refs }; },
    async saveRefs(r: Record<string, string>) { s.refs = { ...r }; },
  };
  return s;
}

/** Human summary for the sync banner. */
export function pendingLabel(n: number): string {
  if (n === 0) return "All changes synced";
  return n === 1 ? "1 action waiting to sync" : `${n} actions waiting to sync`;
}
