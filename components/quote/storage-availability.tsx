"use client";

/** Live storage-space hint for storage requests. Informational only: never blocks submission, never shows counts. */
import { useEffect, useState } from "react";
import { CheckCircle2, Info, Loader2 } from "lucide-react";
import type { QuoteDraft } from "./flow";
import { useQuoteT } from "./i18n";
import { availabilityQuery, availabilityState, type AvailabilityState } from "./wizard-extras";

export function StorageAvailability({ draft, apiUrl }: { draft: QuoteDraft; apiUrl: string }) {
  const { t } = useQuoteT();
  const query = availabilityQuery(draft);
  const [state, setState] = useState<AvailabilityState>("idle");

  useEffect(() => {
    if (!query) {
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("checking");
    // Debounce typing in the date fields
    const timer = setTimeout(() => {
      fetch(`${apiUrl}/v1/storage/availability?${query}`)
        .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => null) }))
        .then(({ ok, body }) => !cancelled && setState(availabilityState(body, ok)))
        .catch(() => !cancelled && setState("idle"));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, apiUrl]);

  if (state === "idle") return null;
  return (
    <p role="status" data-testid="storage-availability" data-state={state} className={`flex items-start gap-2 rounded-xl p-3 text-sm ${state === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-navy-50 text-navy"}`}>
      {state === "checking" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden /> : state === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      {state === "checking" ? t.availabilityChecking : state === "ok" ? t.availabilityOk : t.availabilityLimited}
    </p>
  );
}
