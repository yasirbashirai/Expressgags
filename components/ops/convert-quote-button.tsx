"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PackagePlus } from "lucide-react";
import { api, ApiError } from "@/components/admin/api";

/** "Convert to order" action for a website quote request (shown on the quote detail page). */
export function ConvertQuoteButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [existingOrder, setExisting] = useState<{ id: string; reference: string } | null | undefined>(undefined);
  useEffect(() => {
    api<{ order: { id: string; reference: string } | null }>(`/orders/by-quote/${quoteId}`).then((r) => setExisting(r.order)).catch(() => setExisting(null));
  }, [quoteId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  if (existingOrder === undefined) return null;
  if (existingOrder) {
    return <Link href={`/admin/orders/${existingOrder.id}`} className="btn-ghost !py-2"><PackagePlus className="h-4 w-4" aria-hidden /> Order {existingOrder.reference}</Link>;
  }
  async function convert() {
    if (!armed) return setArmed(true);
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ order: { id: string } }>(`/orders/from-quote/${quoteId}`, { method: "POST", json: {} });
      router.push(`/admin/orders/${r.order.id}`);
    } catch (e) {
      const err = e as ApiError & { details?: { orderId?: string } };
      setError(err.message);
      setBusy(false);
      setArmed(false);
    }
  }
  return (
    <span className="inline-flex flex-col items-end">
      <button onClick={convert} disabled={busy} className="btn-primary !py-2"><PackagePlus className="h-4 w-4" aria-hidden /> {busy ? "Creating…" : armed ? "Confirm: create order" : "Convert to order"}</button>
      {error && <span className="mt-1 text-xs text-rose-700" role="alert">{error}</span>}
    </span>
  );
}
