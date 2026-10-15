/**
 * Third-party provider adapters. Every provider has a real implementation (used when its env keys are set)
 * and a safe MOCK implementation (used in dev/tests and until Express Bags' own accounts are connected).
 * All accounts belong to Express Bags, Inc. (requirement: no developer-owned accounts).
 *
 * Owners: billing agent → payments/accounting · carriers agent → carriers · notifications agent → sms ·
 * ops agent → maps · assistant agent → ai. Keep these interfaces stable; extend, don't break.
 */

// ---------------- Payments (Stripe) ----------------
export type CheckoutRequest = {
  amountCents: number;
  currency?: "usd";
  description: string;
  customerEmail: string;
  /** Our references, echoed back on the webhook */
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
};
export type CheckoutSession = { id: string; url: string; provider: "stripe" | "mock" };
export interface PaymentsProvider {
  name: "stripe" | "mock";
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  refund(providerRef: string, amountCents?: number): Promise<{ ok: boolean; id?: string }>;
}

// ---------------- SMS / WhatsApp (Twilio) ----------------
export interface SmsProvider {
  name: "twilio" | "log";
  send(to: string, body: string, channel?: "sms" | "whatsapp"): Promise<{ status: "SENT" | "LOGGED" | "FAILED"; ref?: string; error?: string }>;
}

// ---------------- Carriers (EasyPost multi-carrier) ----------------
export type Parcel = { weightLbs: number; lengthIn: number; widthIn: number; heightIn: number };
export type Address = { name?: string; street1: string; city: string; state: string; zip: string; country?: string; phone?: string };
export type CarrierRate = {
  carrier: "UPS" | "FedEx" | "DHL" | "USPS";
  service: string;
  /** Carrier-returned billable cost (accounts for dimensional weight) */
  costCents: number;
  transitDays: number | null;
  billableWeightLbs?: number;
  providerRateId: string;
};
export interface CarrierProvider {
  name: "easypost" | "mock";
  rates(from: Address, to: Address, parcels: Parcel[]): Promise<{ rates: CarrierRate[]; errors: string[]; shipmentRef?: string }>;
  buyLabel(providerRateId: string, shipmentRef?: string): Promise<{ trackingNumber: string; labelUrl: string; providerShipmentId: string }>;
  track(trackingNumber: string, carrier: string): Promise<{ status: string; events: { at: string; status: string; location?: string }[] }>;
}

// ---------------- Maps / distance (Google) ----------------
export interface MapsProvider {
  name: "google" | "estimate";
  /** Driving distance & time between two free-text addresses */
  distance(from: string, to: string): Promise<{ miles: number; minutes: number; source: "google" | "estimate" }>;
}

// ---------------- AI (provider-agnostic; Claude default) ----------------
export type AiMessage = { role: "user" | "assistant"; content: string };
export interface AiProvider {
  name: "anthropic" | "openai" | "scripted";
  model: string;
  chat(system: string, messages: AiMessage[], opts?: { maxTokens?: number }): Promise<{ text: string; usage?: { input: number; output: number } }>;
}

// ---------------- Accounting (QuickBooks Online) ----------------
export interface AccountingProvider {
  name: "quickbooks" | "mock";
  upsertCustomer(c: { id: string; name: string; email: string; companyName?: string }): Promise<{ qboId: string }>;
  pushInvoice(inv: { number: string; qboCustomerId: string; lines: { description: string; amountCents: number }[]; dueAt?: string }): Promise<{ qboId: string }>;
  pushPayment(p: { qboInvoiceId: string; qboCustomerId: string; amountCents: number; date: string }): Promise<{ qboId: string }>;
}
