/**
 * Driver app API client (staff session cookie, credentials: "include").
 * Network failures surface as status 0 so the offline queue can retry them.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

export class DriverApiError extends Error {
  constructor(public status: number, message: string, public body: Record<string, unknown> = {}) {
    super(message);
  }
}

export async function driverFetch<T = Record<string, unknown>>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new DriverApiError(0, "No connection. Your work is saved on this phone and will sync automatically.");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new DriverApiError(res.status, String(data.error || `Request failed (${res.status})`), data);
  return data as T;
}

export type Stop = { type?: string; address?: string; facility?: string; market?: string; contact?: string; notes?: string };

export type JobSummary = {
  assignmentId: string;
  role: string;
  sequence: number;
  assignmentStatus: string;
  vehicle: { unitNumber: string; vehicleClassCode: string } | null;
  orderId: string;
  reference: string;
  status: string;
  statusLabel: string;
  serviceType: string;
  serviceDate: string;
  timeWindow: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  priority: string;
  pickup: Stop;
  delivery: Stop;
  pieceCount: number;
  specialHandling: string | null;
  accessNotes: string | null;
  guestName: string | null;
};

export type JobDetail = Omit<JobSummary, "assignmentId" | "role" | "sequence" | "assignmentStatus" | "vehicle" | "pieceCount"> & {
  nextStatuses: string[];
  fulfillment: string;
  extraStops: Stop[];
  customerNotes: string | null;
  guestRoom: string | null;
  customer: { name: string; phone: string | null };
  assignment: { id: string; role: string; status: string };
  crew: { role: string; firstName: string; vehicle: { unitNumber: string; vehicleClassCode: string } | null }[];
  pieces: { id: string; pieceId: string; category: string; description: string | null; status: string; conditionNotes: string | null; storageBay: string | null }[];
  scans: { PICKUP: string[]; FACILITY: string[]; DELIVERY: string[] };
  proofs: { id: string; kind: string; pieceCount: number; recipientName: string | null; capturedAt: string; photoCount: number; signed: boolean }[];
  exceptions: { id: string; type: string; severity: string; status: string; detail: string | null; createdAt: string }[];
  timeline: { id: string; type: string; status: string | null; detail: string | null; actorName: string | null; createdAt: string }[];
};

/** Friendly labels for the window keys used by the quote engine. */
export const WINDOW_LABEL: Record<string, string> = {
  "early-morning": "Early morning",
  morning: "Morning (8 AM – 12 PM)",
  midday: "Midday",
  afternoon: "Afternoon (12 PM – 5 PM)",
  evening: "Evening",
  "after-hours": "After hours",
  flexible: "Flexible",
};

export const CATEGORY_LABEL: Record<string, string> = {
  "carry-on": "Carry-on",
  "standard-checked": "Checked bag",
  large: "Large bag",
  oversized: "Oversized",
  special: "Special item",
  cargo: "Cargo",
};

export const mapsLinks = (address: string) => {
  const q = encodeURIComponent(address);
  return { google: `https://www.google.com/maps/dir/?api=1&destination=${q}`, apple: `https://maps.apple.com/?daddr=${q}` };
};

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Last-known job data kept on the phone so the app still opens in a dead zone (cleared on sign-out). */
export const offlineCache = {
  get<T>(key: string): T | null {
    try {
      return JSON.parse(localStorage.getItem(`eb-driver-cache:${key}`) || "null") as T | null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`eb-driver-cache:${key}`, JSON.stringify(value));
    } catch {
      /* storage full or blocked */
    }
  },
  clear() {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith("eb-driver-cache:")).forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  },
};
