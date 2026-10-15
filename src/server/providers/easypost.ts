/**
 * EasyPost multi-carrier adapter (UPS · FedEx · DHL Express · USPS) over the REST API.
 * Active when EASYPOST_API_KEY is set and PROVIDERS_MODE is not "mock".
 *
 * Bring your own carrier accounts: Express Bags, Inc. connects ITS OWN UPS / FedEx / DHL / USPS accounts
 * inside its EasyPost account, so rates returned here are Express Bags' negotiated ACCOUNT rates
 * (billable, dimensional weight applied by the carrier). The developer never owns these accounts.
 *
 * Also exposes voidLabel (refund an unused label), used by the carriers module when available.
 */
import type { Address, CarrierProvider, CarrierRate, Parcel } from "./index";
import { registerProvider } from "./registry";

const BASE = process.env.EASYPOST_API_BASE || "https://api.easypost.com/v2";

function authHeader() {
  return `Basic ${Buffer.from(`${process.env.EASYPOST_API_KEY ?? ""}:`).toString("base64")}`;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`EasyPost ${res.status}: ${json?.error?.message ?? "request failed"}`);
  return json;
}

/** EasyPost carrier account names → our carrier codes */
function carrierCode(c: string): CarrierRate["carrier"] | null {
  const v = c.toLowerCase();
  if (v.startsWith("ups")) return "UPS";
  if (v.startsWith("fedex")) return "FedEx";
  if (v.startsWith("dhl")) return "DHL";
  if (v.startsWith("usps")) return "USPS";
  return null;
}

const toEpAddress = (a: Address) => ({
  name: a.name,
  street1: a.street1,
  city: a.city,
  state: a.state,
  zip: a.zip,
  country: a.country ?? "US",
  phone: a.phone,
});

// EasyPost weights are in ounces
const toEpParcel = (p: Parcel) => ({ length: p.lengthIn, width: p.widthIn, height: p.heightIn, weight: Math.round(p.weightLbs * 16 * 10) / 10 });

type EpShipment = {
  id: string;
  rates?: { id: string; carrier: string; service: string; rate: string; delivery_days?: number | null; est_delivery_days?: number | null }[];
  messages?: { carrier?: string; message?: string; type?: string }[];
  tracking_code?: string;
  postage_label?: { label_url?: string; label_pdf_url?: string };
};

export const easypostProvider: CarrierProvider & { voidLabel(providerShipmentId: string): Promise<{ ok: boolean }> } = {
  name: "easypost",
  async rates(from, to, parcels) {
    // One parcel per shipment (each bag gets its own label); callers pass a single parcel.
    const parcel = parcels[0];
    const shp = await call<EpShipment>("/shipments", {
      shipment: { from_address: toEpAddress(from), to_address: toEpAddress(to), parcel: toEpParcel(parcel), options: { label_format: "PDF" } },
    });
    const rates: CarrierRate[] = [];
    for (const r of shp.rates ?? []) {
      const carrier = carrierCode(r.carrier);
      if (!carrier) continue;
      rates.push({
        carrier,
        service: r.service,
        costCents: Math.round(Number(r.rate) * 100),
        transitDays: r.delivery_days ?? r.est_delivery_days ?? null,
        providerRateId: r.id,
      });
    }
    const errors = (shp.messages ?? []).map((m) => `${m.carrier ?? "carrier"}: ${m.message ?? m.type ?? "error"}`);
    return { rates, errors, shipmentRef: shp.id };
  },
  async buyLabel(providerRateId, shipmentRef) {
    if (!shipmentRef) throw new Error("EasyPost needs the shipment id to buy a rate");
    const shp = await call<EpShipment>(`/shipments/${shipmentRef}/buy`, { rate: { id: providerRateId } });
    const labelUrl = shp.postage_label?.label_pdf_url || shp.postage_label?.label_url;
    if (!shp.tracking_code || !labelUrl) throw new Error("EasyPost did not return a label");
    return { trackingNumber: shp.tracking_code, labelUrl, providerShipmentId: shp.id };
  },
  async track(trackingNumber, carrier) {
    const t = await call<{ status: string; tracking_details?: { datetime: string; status: string; message?: string; tracking_location?: { city?: string; state?: string } }[] }>(
      "/trackers",
      { tracker: { tracking_code: trackingNumber, carrier } },
    );
    return {
      status: t.status,
      events: (t.tracking_details ?? []).map((d) => ({
        at: d.datetime,
        status: d.status,
        location: [d.tracking_location?.city, d.tracking_location?.state].filter(Boolean).join(", ") || undefined,
      })),
    };
  },
  async voidLabel(providerShipmentId) {
    const r = await call<{ refund_status?: string }>(`/shipments/${providerShipmentId}/refund`, {});
    return { ok: r.refund_status !== "rejected" };
  },
};

if (process.env.EASYPOST_API_KEY) registerProvider("carriers", () => easypostProvider);
