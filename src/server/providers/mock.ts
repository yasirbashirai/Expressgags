/**
 * Mock providers: deterministic, offline, safe for dev/tests and for running the platform before
 * Express Bags connects its own Stripe / Twilio / EasyPost / Google / QuickBooks / AI accounts.
 */
import { randomUUID } from "node:crypto";
import type { AccountingProvider, AiProvider, CarrierProvider, MapsProvider, PaymentsProvider, SmsProvider } from "./index";

export const mockPayments: PaymentsProvider = {
  name: "mock",
  async createCheckout(req) {
    const id = `mock_cs_${randomUUID().slice(0, 12)}`;
    // The mock checkout page (owned by billing module) marks the payment succeeded when "paid".
    const url = `${req.successUrl.split("?")[0].replace(/\/[^/]*$/, "")}/mock-checkout?session=${id}`;
    return { id, url, provider: "mock" };
  },
  async refund() {
    return { ok: true, id: `mock_re_${randomUUID().slice(0, 8)}` };
  },
};

export const logSms: SmsProvider = {
  name: "log",
  async send(to, body, channel = "sms") {
    // Never log message bodies in production (they can contain tracking/survey links)
    if (process.env.NODE_ENV === "production") console.log(`[sms:${channel}] logged (no provider configured) → ${to.slice(0, -4).replace(/\d/g, "•")}${to.slice(-4)}, ${body.length} chars`);
    else console.log(`[sms:${channel}] → ${to}: ${body}`);
    return { status: "LOGGED" };
  },
};

/** Mock carrier rates follow the client's example spread (UPS ~$82, FedEx ~$76, DHL ~$105 for a standard bag). */
export const mockCarriers: CarrierProvider = {
  name: "mock",
  async rates(_from, to, parcels) {
    const billable = parcels.reduce((sum, p) => sum + Math.max(p.weightLbs, (p.lengthIn * p.widthIn * p.heightIn) / 139), 0);
    const factor = Math.max(1, billable / 40);
    const intl = (to.country ?? "US") !== "US";
    const r = (carrier: "UPS" | "FedEx" | "DHL" | "USPS", service: string, base: number, days: number) => ({
      carrier, service, costCents: Math.round(base * factor), transitDays: days, billableWeightLbs: Math.round(billable * 10) / 10, providerRateId: `mock_rate_${carrier}_${service}`,
    });
    const rates = [
      r("UPS", "Ground", 8200, 4), r("UPS", "2nd Day Air", 14600, 2), r("UPS", "Next Day Air", 23800, 1),
      r("FedEx", "Ground", 7600, 5), r("FedEx", "Express Saver", 11900, 3), r("FedEx", "Priority Overnight", 24900, 1),
    ];
    // DHL Express does not carry US-domestic shipments; offer it only internationally.
    if (intl) rates.push(r("DHL", "Express Worldwide", 10500, 3));
    if (billable <= 70) rates.push(r("USPS", "Ground Advantage", 6900, 5));
    return { rates, errors: [], shipmentRef: `mock_shp_${randomUUID().slice(0, 10)}` };
  },
  async buyLabel(providerRateId) {
    const n = `1Z${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
    return { trackingNumber: n, labelUrl: `about:blank#mock-label-${providerRateId}`, providerShipmentId: `mock_${n}` };
  },
  async track() {
    return { status: "IN_TRANSIT", events: [{ at: new Date().toISOString(), status: "IN_TRANSIT", location: "Carrier facility" }] };
  },
};

/** Distance estimate without Google: straight-line between known Florida market centroids × 1.25 road factor. */
export const estimateMaps: MapsProvider = {
  name: "estimate",
  async distance(from, to) {
    const c = (s: string) => {
      const k = s.toLowerCase();
      const known: [RegExp, number, number][] = [
        [/key west|eyw/, 24.56, -81.78], [/marathon/, 24.71, -81.09], [/islamorada/, 24.92, -80.63], [/key largo/, 25.09, -80.45],
        [/fort lauderdale|fll|everglades|hollywood|broward/, 26.12, -80.14], [/west palm|pbi|palm beach|boca/, 26.71, -80.05],
        [/orlando|mco|kissimmee/, 28.54, -81.38], [/tampa|tpa|st\.? pete|clearwater/, 27.95, -82.46], [/fort myers|rsw|naples|cape coral/, 26.64, -81.87],
        [/canaveral|cocoa/, 28.4, -80.6], [/miami|mia|brickell|doral|portmiami|aventura|coral gables/, 25.77, -80.19],
      ];
      for (const [re, lat, lng] of known) if (re.test(k)) return [lat, lng] as const;
      return [25.77, -80.19] as const; // default: Miami HQ
    };
    const [a, b] = [c(from), c(to)];
    const R = 3958.8, toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    const straight = 2 * R * Math.asin(Math.sqrt(h));
    const miles = Math.max(3, Math.round(straight * 1.25 * 10) / 10);
    return { miles, minutes: Math.round(miles * 1.6 + 10), source: "estimate" };
  },
};

export const scriptedAi: AiProvider = {
  name: "scripted",
  model: "scripted-fallback",
  async chat() {
    return {
      text: "I can help you start a quote, explain our services and service areas, or check a delivery by reference. For anything urgent, please call our office at (305) 783-2860.",
    };
  },
};

export const mockAccounting: AccountingProvider = {
  name: "mock",
  async upsertCustomer(c) { return { qboId: `mock_qbo_c_${c.id.slice(-6)}` }; },
  async pushInvoice(inv) { return { qboId: `mock_qbo_i_${inv.number}` }; },
  async pushPayment() { return { qboId: `mock_qbo_p_${Date.now()}` }; },
};
