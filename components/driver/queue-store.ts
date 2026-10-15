/**
 * Browser storage for the offline queue: IndexedDB (keeps photo blobs) with a localStorage fallback
 * (JSON actions only) and an in-memory last resort when storage is blocked (private mode).
 */
import { memoryStore, type QueuedAction, type QueueStore } from "./offline-queue";

const DB = "eb-driver";
const STORE = "kv";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Read-modify-write inside ONE readwrite transaction, so concurrent updates serialize. */
async function idbUpdate<T>(key: string, fn: (v: T | undefined) => T): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const r = store.get(key);
    r.onsuccess = () => store.put(fn(r.result as T | undefined), key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function indexedDbStore(): QueueStore {
  return {
    load: async () => (await idbGet<QueuedAction[]>("queue")) ?? [],
    save: (a) => idbSet("queue", a),
    update: (fn) => idbUpdate<QueuedAction[]>("queue", (v) => fn(v ?? [])),
    loadRefs: async () => (await idbGet<Record<string, string>>("refs")) ?? {},
    saveRefs: (r) => idbSet("refs", r),
  };
}

function localStore(): QueueStore {
  const read = <T,>(k: string, d: T): T => {
    try {
      return JSON.parse(localStorage.getItem(k) || "") as T;
    } catch {
      return d;
    }
  };
  const save = async (a: QueuedAction[]) => {
    try {
      localStorage.setItem("eb-driver-queue", JSON.stringify(a.filter((x) => x.kind === "json")));
    } catch {
      /* storage full or blocked */
    }
  };
  return {
    load: async () => read<QueuedAction[]>("eb-driver-queue", []),
    save,
    // localStorage is synchronous, so read + write in one tick is already atomic
    update: async (fn) => save(fn(read<QueuedAction[]>("eb-driver-queue", []))),
    loadRefs: async () => read<Record<string, string>>("eb-driver-refs", {}),
    saveRefs: async (r) => {
      try {
        localStorage.setItem("eb-driver-refs", JSON.stringify(r));
      } catch {
        /* ignore */
      }
    },
  };
}

let chosen: QueueStore | null = null;

/** Picks the best available storage once per page load. */
export async function getQueueStore(): Promise<QueueStore> {
  if (chosen) return chosen;
  try {
    if (typeof indexedDB !== "undefined") {
      const s = indexedDbStore();
      await s.load();
      return (chosen = s);
    }
  } catch {
    /* fall through */
  }
  try {
    localStorage.setItem("eb-driver-probe", "1");
    localStorage.removeItem("eb-driver-probe");
    return (chosen = localStore());
  } catch {
    return (chosen = memoryStore());
  }
}
