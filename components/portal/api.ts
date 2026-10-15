/**
 * Customer-portal API client. Session lives in the httpOnly "eb_customer" cookie (credentials: "include").
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

export class PortalError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
  /** Field errors from the API ({path, message}[]) as a map. */
  get fields(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) for (const d of this.details as { path?: string; message?: string }[]) if (d.path) out[d.path] = d.message ?? "Check this field";
    return out;
  }
}

export async function portal<T = Record<string, unknown>>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/account${path}`, {
      credentials: "include",
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new PortalError(0, "We could not reach Express Bags right now. Please check your connection or call our office.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PortalError(res.status, data.error || `Request failed (${res.status})`, data.details);
  return data as T;
}

/** Absolute URL for API file downloads (opened in a new tab; the cookie authorizes them). */
export const fileUrl = (path: string) => `${API_URL}/v1/account${path}`;

export const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "—" : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const dateOnly = (iso: string | Date | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : "—";

export const dateTime = (iso: string | Date | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) : "—";

export type Me = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  language: "en" | "es";
  marketingOptIn: boolean;
  accountRole: "INDIVIDUAL" | "COMPANY_ADMIN" | "COMPANY_USER" | "CONCIERGE";
  defaultCostCenter: string | null;
  company: { id: string; name: string; accountType: string | null; accountStatus: string; poRequired: boolean; billingEmail: string | null; paymentTermsDays: number } | null;
};

export type Loc = { type?: string; address?: string; facility?: string; market?: string };
export const placeLabel = (l: unknown) => {
  const x = (l ?? {}) as Loc;
  return x.address || x.facility || "—";
};

export const canUseConcierge = (me: Me) =>
  !!me.company && me.company.accountStatus === "ACTIVE" && ["hotel", "resort", "dmc"].includes(me.company.accountType ?? "") && (me.accountRole === "CONCIERGE" || me.accountRole === "COMPANY_ADMIN");
