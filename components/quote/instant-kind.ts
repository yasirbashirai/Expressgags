/** Which instant flow (if any) the quote wizard offers for a service (pure, unit-tested). */
import type { QuoteDraft } from "./flow";

export type InstantFlags = { instantBookingEnabled: boolean; carrierShippingEnabled: boolean };

/** Group/event programs are always planned manually; shipping needs carrier shipping approved too. */
export function instantKind(service: QuoteDraft["serviceType"], flags: InstantFlags | null): "local" | "shipping" | null {
  if (!flags || !service || service === "group-event") return null;
  if (service === "nationwide-shipping") return flags.carrierShippingEnabled ? "shipping" : null;
  return flags.instantBookingEnabled ? "local" : null;
}
