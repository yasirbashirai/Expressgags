/**
 * Stripe payments adapter (Checkout Sessions). Active when STRIPE_SECRET_KEY is set and
 * PROVIDERS_MODE is not "mock". The Stripe account belongs to Express Bags, Inc.
 * Webhook signature verification lives in modules/billing (uses STRIPE_WEBHOOK_SECRET).
 */
import Stripe from "stripe";
import type { PaymentsProvider } from "./index";
import { registerProvider } from "./registry";

let client: Stripe | null = null;
export function stripeClient() {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", { maxNetworkRetries: 2 });
  return client;
}

export const stripeProvider: PaymentsProvider = {
  name: "stripe",
  async createCheckout(req) {
    const session = await stripeClient().checkout.sessions.create(
      {
        mode: "payment",
        customer_email: req.customerEmail,
        line_items: [
          {
            quantity: 1,
            price_data: { currency: req.currency ?? "usd", unit_amount: req.amountCents, product_data: { name: req.description } },
          },
        ],
        metadata: req.metadata,
        payment_intent_data: { metadata: req.metadata },
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
      },
      // Idempotency: one checkout per payment record
      { idempotencyKey: req.metadata.paymentId ? `checkout-${req.metadata.paymentId}` : undefined },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { id: session.id, url: session.url, provider: "stripe" };
  },
  async refund(providerRef, amountCents) {
    // providerRef is the Checkout Session id → resolve its PaymentIntent
    const stripe = stripeClient();
    const session = providerRef.startsWith("cs_") ? await stripe.checkout.sessions.retrieve(providerRef) : null;
    const pi = session ? (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id) : providerRef;
    if (!pi) return { ok: false };
    const r = await stripe.refunds.create({ payment_intent: pi, amount: amountCents });
    return { ok: r.status === "succeeded" || r.status === "pending", id: r.id };
  },
};

if (process.env.STRIPE_SECRET_KEY) registerProvider("payments", () => stripeProvider);
