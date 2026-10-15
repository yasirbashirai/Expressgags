"use client";

/** Loaders for the new / edit quotation screens (prefill from a quote request, or load an existing quotation). */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, dateTime, money } from "@/components/admin/api";
import { Panel } from "@/components/admin/admin-shell";
import { blankDetails, QuotationBuilder, type Details, type Line } from "./quotation-builder";

type Prefill = { customer: { id: string; name: string; email: string }; quoteRequest: { id: string; reference: string; notes?: string; specialHandling?: string; accessNotes?: string; routeReasons?: string[] }; details: Details; title: string };

export function NewQuotation() {
  const quoteRequestId = useSearchParams().get("quoteRequestId");
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (quoteRequestId) api<Prefill>(`/quotations/prefill/${quoteRequestId}`).then(setPrefill).catch((e) => setErr(e.message));
  }, [quoteRequestId]);
  if (err) return <p className="text-sm text-rose-700" role="alert">{err}</p>;
  if (quoteRequestId && !prefill) return <p className="text-sm text-muted">Loading the quote request…</p>;
  return (
    <QuotationBuilder
      initial={{
        customer: prefill?.customer ?? null,
        quoteRequest: prefill?.quoteRequest ?? null,
        title: prefill?.title ?? "",
        depositType: prefill?.quoteRequest.routeReasons?.length ? "percent" : "none",
        depositValue: prefill?.quoteRequest.routeReasons?.length ? 25 : 0,
        lines: [],
        details: prefill?.details ?? blankDetails(),
      }}
    />
  );
}

type Detail = {
  quotation: {
    id: string; reference: string; status: string; title: string; scope: string | null; terms: string | null; validUntil: string | null; depositType: string; depositValue: number; publicToken: string;
    customer: { id: string; name: string; email: string; company: { name: string } | null };
    lines: { kind: Line["kind"]; description: string; quantity: number; unit: string | null; unitCents: number; unitCostCents: number | null }[];
    order: { id: string; reference: string; status: string; paymentStatus: string } | null;
    payments: { id: string; kind: string; status: string; amountCents: number; method: string; createdAt: string }[];
    quoteRequest: { id: string; reference: string } | null;
    acceptedAt: string | null; acceptedName: string | null; acceptedTitle: string | null; acceptedIp: string | null; declineReason: string | null; viewedAt: string | null; sentAt: string | null;
  };
  details: Details | null;
  revisions: { id: string; version: number; reason: string | null; createdBy: string | null; createdAt: string }[];
  guardrails: { minimumProfitCents: number; targetMarginPercent: number };
};

export function EditQuotation({ id }: { id: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<Detail>(`/quotations/${id}`).then(setD).catch((e) => setErr(e.message));
  }, [id]);
  if (err) return <p className="text-sm text-rose-700" role="alert">{err}</p>;
  if (!d) return <p className="text-sm text-muted">Loading quotation…</p>;
  const q = d.quotation;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  return (
    <>
      <QuotationBuilder
        key={`${q.id}-${q.status}-${d.revisions.length}`}
        initial={{
          id: q.id,
          status: q.status,
          reference: q.reference,
          customer: { id: q.customer.id, name: q.customer.name, email: q.customer.email, company: q.customer.company?.name },
          quoteRequest: q.quoteRequest ? { id: q.quoteRequest.id, reference: q.quoteRequest.reference } : null,
          title: q.title,
          scope: q.scope,
          terms: q.terms,
          validUntil: q.validUntil,
          depositType: q.depositType,
          depositValue: q.depositType === "flat" ? q.depositValue / 100 : q.depositValue,
          lines: q.lines.map((l) => ({ ...l, unit: l.unit ?? "" })),
          details: d.details ? { ...d.details, serviceDate: String(d.details.serviceDate).slice(0, 10) } : blankDetails(),
          guardrails: d.guardrails,
          publicLink: `${site}/q/${q.publicToken}`,
        }}
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Acceptance record">
          {q.acceptedAt ? (
            <>
              <dl className="space-y-1 text-sm">
                <div><dt className="inline text-muted">Signed by </dt><dd className="inline font-semibold text-navy">{q.acceptedName}{q.acceptedTitle ? `, ${q.acceptedTitle}` : ""}</dd></div>
                <div><dt className="inline text-muted">When </dt><dd className="inline">{dateTime(q.acceptedAt)}</dd></div>
                <div><dt className="inline text-muted">IP </dt><dd className="inline font-mono text-xs">{q.acceptedIp ?? "-"}</dd></div>
              </dl>
              {q.order && <p className="pt-2 text-sm"><Link className="font-semibold text-orange-700" href={`/admin/orders/${q.order.id}`}>Order {q.order.reference} · {q.order.paymentStatus.replace(/_/g, " ").toLowerCase()}</Link></p>}
            </>
          ) : q.declineReason ? (
            <p className="text-sm text-rose-800">Declined: {q.declineReason}</p>
          ) : (
            <p className="text-sm text-muted">{q.viewedAt ? `Viewed ${dateTime(q.viewedAt)}. Not accepted yet.` : q.sentAt ? `Sent ${dateTime(q.sentAt)}. Not viewed yet.` : "Not sent yet."}</p>
          )}
        </Panel>
        <Panel title="Payments">
          {q.payments.length === 0 ? <p className="text-sm text-muted">No payments yet.</p> : (
            <ul className="space-y-1.5 text-sm">{q.payments.map((p) => <li key={p.id} className="flex justify-between"><span>{p.kind.toLowerCase()} · {p.method} · {p.status.toLowerCase()}</span><span className="font-semibold text-navy">{money(p.amountCents)}</span></li>)}</ul>
          )}
        </Panel>
        <Panel title="Version history">
          {d.revisions.length === 0 ? <p className="text-sm text-muted">Original version.</p> : (
            <ul className="space-y-1.5 text-sm">{d.revisions.map((r) => <li key={r.id}>v{r.version} · {r.reason ?? "Revised"} <span className="text-xs text-muted">· {r.createdBy} · {dateTime(r.createdAt)}</span></li>)}</ul>
          )}
        </Panel>
      </div>
    </>
  );
}
