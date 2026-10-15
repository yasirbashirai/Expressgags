/**
 * Browser client for the assistant API: session id, SSE streaming chat with JSON fallback, handoff, search.
 */
export const ASSISTANT_API = `${(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "")}/v1/assistant`;

export type Lang = "en" | "es";
export type ChatReply = { reply: string; lang: Lang; mode: "ai" | "scripted" | "guardrail"; links: string[] };

const SESSION_KEY = "eb-assistant-session-v1";
let memorySession: string | null = null;

function randomId() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62]).join("");
}

/** Per-browser chat session id (localStorage when available, memory otherwise). */
export function sessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return (memorySession ??= randomId());
  }
}

export function resetSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
  memorySession = null;
}

/** Server answered with an error status: shown as-is, never retried. */
class ChatHttpError extends Error {}

/** Sends a message; streams text through onDelta when the browser supports streaming responses. */
export async function sendChat(message: string, lang: Lang | "auto", onDelta: (t: string) => void, signal?: AbortSignal): Promise<ChatReply> {
  const body = JSON.stringify({ sessionId: sessionId(), message, lang });
  try {
    const res = await fetch(`${ASSISTANT_API}/chat`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body, signal });
    if (!res.ok) throw new ChatHttpError((await res.json().catch(() => null))?.error || "The assistant is unavailable right now.");
    if (!res.body || !(res.headers.get("content-type") ?? "").includes("text/event-stream")) return (await res.json()) as ChatReply;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done: ChatReply | null = null;
    for (;;) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = raw.match(/^event: (.+)$/m)?.[1];
        const data = raw.match(/^data: (.+)$/m)?.[1];
        if (!event || !data) continue;
        const parsed = JSON.parse(data);
        if (event === "delta") onDelta(parsed.text);
        else if (event === "done") done = parsed;
        else if (event === "error") throw new ChatHttpError(parsed.error);
      }
    }
    if (!done) throw new Error("The connection was interrupted. Please try again.");
    return done;
  } catch (e) {
    if ((e as Error).name === "AbortError" || e instanceof ChatHttpError) throw e;
    // Fallback: plain JSON request (proxies that buffer SSE, older browsers)
    const res = await fetch(`${ASSISTANT_API}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw new Error(json?.error || (e as Error).message || "The assistant is unavailable right now.");
    return json as ChatReply;
  }
}

export async function sendHandoff(input: { name: string; email?: string; phone?: string; message: string; website?: string }) {
  const res = await fetch(`${ASSISTANT_API}/handoff`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: sessionId(), ...input }) });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.details?.[0]?.message || json?.error || "We couldn't send that. Please call (305) 783-2860.");
}

export type SearchResult = { title: string; url: string; snippet: string; kind: string };
export async function searchSite(q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const res = await fetch(`${ASSISTANT_API}/search?q=${encodeURIComponent(q)}`, { signal });
  const json = await res.json().catch(() => null);
  return json?.ok ? json.results : [];
}
