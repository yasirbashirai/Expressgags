/**
 * Provider selection. Real adapters register themselves here when their env keys exist;
 * otherwise the mock is used. Each module agent adds its real adapter file (e.g. providers/stripe.ts)
 * and extends the matching getter — never call a vendor SDK from outside src/server/providers.
 */
import type { AccountingProvider, AiProvider, CarrierProvider, MapsProvider, PaymentsProvider, SmsProvider } from "./index";
import { estimateMaps, logSms, mockAccounting, mockCarriers, mockPayments, scriptedAi } from "./mock";

type Factories = {
  payments?: () => PaymentsProvider;
  sms?: () => SmsProvider;
  carriers?: () => CarrierProvider;
  maps?: () => MapsProvider;
  ai?: () => AiProvider;
  accounting?: () => AccountingProvider;
};
const real: Factories = {};

/** Called by real adapter modules at import time: registerProvider("payments", () => stripeProvider) */
export function registerProvider<K extends keyof Factories>(kind: K, factory: NonNullable<Factories[K]>) {
  real[kind] = factory as Factories[K];
}

const mocksOnly = () => process.env.PROVIDERS_MODE === "mock" || process.env.NODE_ENV === "test";

export const payments = (): PaymentsProvider => (!mocksOnly() && real.payments ? real.payments() : mockPayments);
export const sms = (): SmsProvider => (!mocksOnly() && real.sms ? real.sms() : logSms);
export const carriers = (): CarrierProvider => (!mocksOnly() && real.carriers ? real.carriers() : mockCarriers);
export const maps = (): MapsProvider => (!mocksOnly() && real.maps ? real.maps() : estimateMaps);
export const ai = (): AiProvider => (!mocksOnly() && real.ai ? real.ai() : scriptedAi);
export const accounting = (): AccountingProvider => (!mocksOnly() && real.accounting ? real.accounting() : mockAccounting);
