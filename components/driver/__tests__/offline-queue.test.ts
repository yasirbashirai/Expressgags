/** Unit tests for the driver offline queue (ordering, retry vs drop, photo reference resolution). */
import { describe, expect, it } from "vitest";
import { flushQueue, memoryStore, pendingLabel, resolveRefs, shouldRetry, type QueuedAction, type SendResult } from "../offline-queue";

const json = (id: string, body: unknown = {}): QueuedAction => ({ id, kind: "json", orderId: "o1", label: id, path: `/x/${id}`, body, key: `key-${id}`, createdAt: 0 });
const upload = (id: string, ref: string): QueuedAction => ({ id, kind: "upload", orderId: "o1", label: id, path: "/upload", file: new Blob(["x"]), filename: "a.jpg", fields: {}, key: `key-${id}`, ref, createdAt: 0 });
const ok = (body: Record<string, unknown> = {}): SendResult => ({ ok: true, status: 200, body });
const fail = (status: number): SendResult => ({ ok: false, retry: shouldRetry(status), status, body: {}, error: `HTTP ${status}` });

describe("offline queue", () => {
  it("sends actions in order and empties the queue", async () => {
    const store = memoryStore([json("a"), json("b"), json("c")]);
    const seen: string[] = [];
    const r = await flushQueue(store, async (a) => (seen.push(a.id), ok()));
    expect(seen).toEqual(["a", "b", "c"]);
    expect(r).toMatchObject({ sent: 3, dropped: 0, remaining: 0 });
    expect(store.actions).toHaveLength(0);
  });

  it("stops at a retryable failure and keeps order for the next flush", async () => {
    const store = memoryStore([json("a"), json("b"), json("c")]);
    let offline = true;
    const r1 = await flushQueue(store, async (a) => (a.id === "b" && offline ? fail(0) : ok()));
    expect(r1).toMatchObject({ sent: 1, remaining: 2 });
    expect(store.actions.map((a) => a.id)).toEqual(["b", "c"]);
    offline = false;
    const r2 = await flushQueue(store, async () => ok());
    expect(r2).toMatchObject({ sent: 2, remaining: 0 });
  });

  it("drops final 4xx failures but continues with later actions", async () => {
    const store = memoryStore([json("a"), json("b")]);
    const r = await flushQueue(store, async (a) => (a.id === "a" ? fail(409) : ok()));
    expect(r).toMatchObject({ sent: 1, dropped: 1, remaining: 0 });
    expect(r.results.a.ok).toBe(false);
  });

  it("treats a thrown send as offline (retry)", async () => {
    const store = memoryStore([json("a")]);
    const r = await flushQueue(store, async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(r.remaining).toBe(1);
  });

  it("resolves photo references from earlier uploads", async () => {
    const store = memoryStore([upload("u1", "p1"), upload("u2", "p2"), json("proof", { kind: "PICKUP", photoUploadIds: ["ref:p1", "ref:p2"] })]);
    let proofBody: unknown;
    await flushQueue(store, async (a, body) => {
      if (a.kind === "upload") return ok({ id: `srv-${a.ref}` });
      proofBody = body;
      return ok();
    });
    expect(proofBody).toEqual({ kind: "PICKUP", photoUploadIds: ["srv-p1", "srv-p2"] });
    expect(store.refs).toEqual({ p1: "srv-p1", p2: "srv-p2" });
  });

  it("waits for a pending upload before sending a dependent action", async () => {
    const store = memoryStore([upload("u1", "p1"), json("proof", { photoUploadIds: ["ref:p1"] })]);
    let online = false;
    const r1 = await flushQueue(store, async () => (online ? ok({ id: "srv-1" }) : fail(0)));
    expect(r1.remaining).toBe(2);
    online = true;
    const sent: string[] = [];
    await flushQueue(store, async (a) => (sent.push(a.id), ok({ id: "srv-1" })));
    expect(sent).toEqual(["u1", "proof"]);
  });

  it("an action enqueued during a running flush is sent by the next flush call", async () => {
    const store = memoryStore([json("a")]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const sent: string[] = [];
    const send = async (a: QueuedAction) => {
      if (a.id === "a") await gate;
      sent.push(a.id);
      return ok();
    };
    const first = flushQueue(store, send);
    await store.save([...(await store.load()), json("b")]);
    const second = flushQueue(store, send);
    release();
    await first;
    const report = await second;
    expect(sent).toEqual(["a", "b"]);
    expect(report.results.b?.ok).toBe(true);
  });

  it("resolveRefs reports unknown references", () => {
    expect(resolveRefs({ a: ["ref:x", "plain"] }, {})).toEqual({ value: { a: ["ref:x", "plain"] }, missing: ["ref:x"] });
  });

  it("classifies statuses and labels the banner", () => {
    expect([0, 401, 408, 429, 500, 503].every(shouldRetry)).toBe(true);
    expect([400, 403, 404, 409, 413, 415, 422].some(shouldRetry)).toBe(false);
    expect(pendingLabel(0)).toBe("All changes synced");
    expect(pendingLabel(1)).toBe("1 action waiting to sync");
    expect(pendingLabel(3)).toBe("3 actions waiting to sync");
  });
});
