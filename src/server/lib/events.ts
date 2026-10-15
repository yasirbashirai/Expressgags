/**
 * In-process domain event bus. Modules publish facts; other modules subscribe (e.g. notifications,
 * reminders, HubSpot/QuickBooks sync) without importing each other. Handlers must never throw into
 * the publisher: errors are logged.
 */
import type { OrderStatus } from "../generated/prisma/client";

export type DomainEvents = {
  "quote.created": { quoteId: string; reference: string };
  "quotation.sent": { quotationId: string };
  "quotation.accepted": { quotationId: string; orderId?: string };
  "order.created": { orderId: string };
  "order.status_changed": { orderId: string; from: OrderStatus; to: OrderStatus; actorName?: string };
  "order.assigned": { orderId: string; employeeId: string; role: string };
  "order.exception": { orderId: string; exceptionId: string; type: string; severity: string };
  "order.delivered": { orderId: string };
  "payment.succeeded": { paymentId: string; orderId?: string; invoiceId?: string; quotationId?: string };
  "invoice.issued": { invoiceId: string };
  "customer.registered": { customerId: string };
  "claim.submitted": { claimId: string };
};

type Handler<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => void | Promise<void>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: Record<string, Handler<any>[]> = {};

export function on<K extends keyof DomainEvents>(event: K, handler: Handler<K>) {
  (handlers[event] ??= []).push(handler);
}

/** Fire-and-forget; resolves after all handlers settle (await it in tests). */
export async function emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]) {
  const list = (handlers[event] ?? []) as Handler<K>[];
  await Promise.allSettled(
    list.map(async (h) => {
      try {
        await h(payload);
      } catch (e) {
        console.error(`[events] handler for ${event} failed:`, e);
      }
    }),
  );
}
