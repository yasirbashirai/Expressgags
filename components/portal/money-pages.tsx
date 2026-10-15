"use client";

/** Quotes (requests + priced quotations) and invoices & receipts. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { dateOnly, fileUrl, money, portal } from "./api";
import { serviceName } from "./dashboard";
import { Alert, Card, Empty, Loading, PageTitle, StatusPill } from "./ui";

type QuotesData = {
  requests: { id: string; reference: string; serviceType: string; status: string; route: string; serviceDate: string; totalPieces: number; createdAt: string }[];
  quotations: { id: string; reference: string; title: string; status: string; totalCents: number; depositCents: number; validUntil: string | null; sentAt: string | null; acceptedAt: string | null; acceptUrl: string | null; viewUrl: string; order: { id: string; reference: string } | null }[];
};

export function QuotesPage() {
  const [d, setD] = useState<QuotesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    portal<QuotesData>("/quotes").then(setD).catch((e) => setError(e.message));
  }, []);
  return (
    <div className="space-y-6">
      <PageTitle title="Quotes" sub="Your requests and the written quotations our team prepared for you." actions={<Link href="/request-a-quote" className="btn-primary">Request a Quote</Link>} />
      {error && <Alert>{error}</Alert>}
      {!d && !error && <Loading />}
      {d && (
        <>
          <Card title="Quotations">
            {d.quotations.length === 0 ? (
              <p className="text-sm text-slate-ink">When our team prices a request, the written quotation appears here for review and online approval.</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.quotations.map((q) => (
                  <li key={q.id} className="grid grid-cols-1 gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-navy">{q.title}</p>
                        <StatusPill status={q.status} />
                      </div>
                      <p className="mt-1 text-sm text-slate-ink">
                        {q.reference} · {money(q.totalCents)}{q.depositCents ? ` · deposit ${money(q.depositCents)}` : ""}{q.validUntil ? ` · valid until ${dateOnly(q.validUntil)}` : ""}
                      </p>
                      {q.order && <p className="text-xs text-muted">Booked as <Link className="font-semibold text-orange-700 hover:underline" href={`/account/orders/${q.order.id}`}>{q.order.reference}</Link></p>}
                    </div>
                    {q.acceptUrl ? <Link href={q.acceptUrl} className="btn-primary !py-2">Review & approve</Link> : <Link href={q.viewUrl} className="btn-ghost !py-2">View</Link>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Quote requests">
            {d.requests.length === 0 ? (
              <Empty title="No requests yet" text="Requests you send with this email appear here, including ones made before you created your account." href="/request-a-quote" cta="Request a Quote" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted">
                    <tr><th scope="col" className="py-2 pr-3">Reference</th><th scope="col" className="py-2 pr-3">Service</th><th scope="col" className="py-2 pr-3">Date</th><th scope="col" className="py-2 pr-3">Pieces</th><th scope="col" className="py-2">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {d.requests.map((r) => (
                      <tr key={r.id}>
                        <td className="py-3 pr-3 font-mono font-semibold text-navy">{r.reference}</td>
                        <td className="py-3 pr-3">{serviceName(r.serviceType)}</td>
                        <td className="py-3 pr-3">{r.serviceDate}</td>
                        <td className="py-3 pr-3">{r.totalPieces}</td>
                        <td className="py-3"><StatusPill status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

type InvoicesData = {
  invoices: { id: string; number: string; status: string; issuedAt: string | null; dueAt: string | null; totalCents: number; paidCents: number; balanceCents: number; poNumber: string | null; viewUrl: string }[];
  receipts: { id: string; kind: string; method: string; amountCents: number; createdAt: string; receiptUploadId: string | null; invoice: { number: string } | null; order: { reference: string } | null }[];
};

export function InvoicesPage() {
  const [d, setD] = useState<InvoicesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    portal<InvoicesData>("/invoices").then(setD).catch((e) => setError(e.message));
  }, []);
  return (
    <div className="space-y-6">
      <PageTitle title="Invoices & receipts" sub="Download invoices for your records or pay online." />
      {error && <Alert>{error}</Alert>}
      {!d && !error && <Loading />}
      {d && (
        <>
          <Card title="Invoices">
            {d.invoices.length === 0 ? <p className="text-sm text-slate-ink">No invoices yet.</p> : (
              <ul className="divide-y divide-line">
                {d.invoices.map((i) => (
                  <li key={i.id} className="grid grid-cols-1 gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-navy">{i.number}</span><StatusPill status={i.status} /></div>
                      <p className="mt-1 text-sm text-slate-ink">Issued {dateOnly(i.issuedAt)} · due {dateOnly(i.dueAt)} · total {money(i.totalCents)}{i.balanceCents > 0 ? ` · balance ${money(i.balanceCents)}` : ""}{i.poNumber ? ` · PO ${i.poNumber}` : ""}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a href={fileUrl(`/invoices/${i.id}/pdf`)} className="btn-ghost !py-2"><Download className="h-4 w-4" aria-hidden /> PDF</a>
                      <Link href={i.viewUrl} className={i.balanceCents > 0 && i.status !== "VOID" ? "btn-primary !py-2" : "btn-ghost !py-2"}>
                        {i.balanceCents > 0 && i.status !== "VOID" ? "View & pay" : "View"} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Payment receipts">
            {d.receipts.length === 0 ? <p className="text-sm text-slate-ink">Receipts for deposits and payments appear here.</p> : (
              <ul className="divide-y divide-line text-sm">
                {d.receipts.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span>
                      <span className="font-semibold text-navy">{money(r.amountCents)}</span> {r.kind === "DEPOSIT" ? "deposit" : "payment"} · {dateOnly(r.createdAt)}
                      <span className="block text-xs text-muted">{r.invoice ? `Invoice ${r.invoice.number}` : r.order ? `Order ${r.order.reference}` : ""} · {r.method}</span>
                    </span>
                    {r.receiptUploadId && <a href={fileUrl(`/receipts/${r.id}/file`)} className="inline-flex items-center gap-1 font-semibold text-orange-700 hover:underline"><Download className="h-4 w-4" aria-hidden /> Receipt</a>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
