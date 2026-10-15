/**
 * Public (customer-facing) API client for quotation, invoice and payment pages.
 * No credentials are sent; access is by unguessable link token.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

export class PublicApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function publicApi<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1${path}`, {
      method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
      headers: init.json !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new PublicApiError(0, "We could not reach Express Bags right now. Please try again or call our office.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PublicApiError(res.status, data.error || "Something went wrong. Please try again.");
  return data as T;
}

export const usd = (cents: number | null | undefined) =>
  cents == null ? "-" : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const longDate = (iso: string | Date | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "-";

export const qty = (q: number) => (Number.isInteger(q) ? String(q) : q.toFixed(2));
