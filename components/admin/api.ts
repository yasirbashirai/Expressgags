/**
 * Admin API client. Session lives in an httpOnly cookie set by the API (credentials: "include").
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: { path: string; message: string }[]) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/admin${path}`, {
      credentials: "include",
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the Express Bags API. Is it running?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data.details);
  return data as T;
}

export const money = (cents: number | null | undefined) =>
  cents == null ? "-" : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const dateTime = (iso: string | Date) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export type QuoteSummary = {
  id: string;
  reference: string;
  serviceType: string;
  route: "CUSTOM_QUOTE" | "STANDARD_QUOTE" | "SPECIAL_ROUTE";
  status: "NEW" | "REVIEWING" | "QUOTED" | "WON" | "LOST" | "ARCHIVED";
  pickupMarket: string;
  deliveryMarket: string;
  serviceDate: string;
  totalPieces: number;
  leadSource: string;
  customerName: string;
  customerEmail: string;
  createdAt: string;
};

export type AdminUser = { id: string; email: string; role: "OWNER" | "STAFF" | "DISPATCHER" | "DRIVER" | "ACCOUNTING"; name: string | null };
