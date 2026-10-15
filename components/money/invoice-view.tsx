"use client";

/** Customer invoice page (/invoice/[token]): view, download PDF, pay the balance online. */
import { useEffect, useState } from "react";
import { CreditCard, Download, Phone, XCircle } from "lucide-react";
import { contact } from "@/content/site";
import { DocLines, DocShell, DocStatus, DocTotals } from "./doc-shell";
import { API_URL, longDate, publicApi, PublicApiError, qty, usd } from "./public-api";

type Invoice = {
  number: string;
  status: string;
  issuedAt: string | null;
  dueAt: string | null;
  billTo: { name: string; company: string | null };
  poNumber: string | null;
  costCenter: string | null;
  lines: { description: string; quantity: number; unitCents: number; totalCents: number }[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  notes: string | null;
};

export function InvoiceView({ token }: { token: string }) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);

  useEffect(() => {
    publicApi<{ invoice: Invoice }>(`/pay/invoice/${token}`).then((r) => setInv(r.invoice)).catch((e: PublicApiError) => setError(e.message));
  }, [token]);

  const pay = async () => {
    setBusy(true);
    setPayErr(null);
    try {
      const r = await publicApi<{ checkoutUrl: string }>(`/pay/invoice/${token}/checkout`, { json: {} });
      window.location.assign(r.checkoutUrl);
    } catch (e) {
      setPayErr((e as Error).message);
      setBusy(false);
    }
  };

  if (error) {
    return (
      <section className="bg-cloud py-24">
        <div className="container-eb max-w-xl text-center">
          <XCircle className="mx-auto h-10 w-10 text-orange" aria-hidden />
          <h1 className="mt-4 text-3xl font-bold">Invoice unavailable</h1>
          <p className="mt-3 text-slate-ink">{error}</p>
          <a href={contact.phoneHref} className="btn-primary mt-6"><Phone className="h-4 w-4" aria-hidden /> Call {contact.phoneDisplay}</a>
        </div>
      </section>
    );
  }
  if (!inv) return <div className="grid min-h-[60vh] place-items-center text-sm text-muted" aria-live="polite">Loading your invoice…</div>;

  const payable = inv.balanceCents > 0 && inv.status !== "VOID";
  return (
    <>
    {/* Page heading for screen readers; the document header shows the visual "Invoice" label */}
    <h1 className="sr-only">Invoice {inv.number}</h1>
    <DocShell
      kind="Invoice"
      number={inv.number}
      status={<DocStatus status={inv.status} />}
      aside={
        <>
          <div className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Balance due</p>
            <p className="mt-1 font-display text-4xl font-extrabold text-navy">{usd(inv.balanceCents)}</p>
            <p className="mt-1 text-sm text-slate-ink">Due {longDate(inv.dueAt)}</p>
            {payable ? (
              <button onClick={pay} disabled={busy} className="btn-primary mt-4 w-full"><CreditCard className="h-4 w-4" aria-hidden /> {busy ? "Opening secure checkout…" : "Pay online"}</button>
            ) : (
              <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{inv.status === "VOID" ? "This invoice was cancelled." : "Paid in full. Thank you."}</p>
            )}
            {payErr && <p role="alert" className="mt-2 text-sm text-rose-700">{payErr}</p>}
            <p className="mt-3 text-xs text-muted">Card payments are processed securely by our payment provider. Card details never touch Express Bags systems. For ACH or check, call {contact.phoneDisplay}.</p>
          </div>
          <a href={`${API_URL}/v1/pay/invoice/${token}/pdf`} className="btn-ghost w-full"><Download className="h-4 w-4" aria-hidden /> Download PDF</a>
        </>
      }
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="eyebrow">Bill to</p>
          <p className="mt-2 font-semibold text-navy">{inv.billTo.company ?? inv.billTo.name}</p>
          {inv.billTo.company && <p className="text-sm text-slate-ink">Attn: {inv.billTo.name}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:text-right">
          <dt className="text-muted">Issued</dt><dd className="font-medium text-navy">{longDate(inv.issuedAt)}</dd>
          <dt className="text-muted">Due</dt><dd className="font-medium text-navy">{longDate(inv.dueAt)}</dd>
          {inv.poNumber && (<><dt className="text-muted">PO</dt><dd className="font-medium text-navy">{inv.poNumber}</dd></>)}
          {inv.costCenter && (<><dt className="text-muted">Cost center</dt><dd className="font-medium text-navy">{inv.costCenter}</dd></>)}
        </dl>
      </div>
      <div className="mt-8">
        <DocLines lines={inv.lines} fmt={usd} qtyFmt={qty} />
        <DocTotals
          rows={[
            { label: "Subtotal", value: usd(inv.subtotalCents) },
            ...(inv.taxCents ? [{ label: "Tax", value: usd(inv.taxCents) }] : []),
            { label: "Total", value: usd(inv.totalCents) },
            { label: "Paid", value: usd(inv.paidCents) },
            { label: "Balance due", value: usd(inv.balanceCents), strong: true },
          ]}
        />
      </div>
      {inv.notes && <p className="mt-8 whitespace-pre-line text-sm text-slate-ink">{inv.notes}</p>}
    </DocShell>
    </>
  );
}
