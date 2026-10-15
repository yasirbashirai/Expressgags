import type { Metadata } from "next";
import { PageHero } from "@/components/ui/page-hero";
import { LegalDoc } from "@/components/company/blocks";
import { company, contact, exclusions } from "@/content/site";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Terms of Service | Express Bags, Inc.",
  description: "Terms for using express-bags.com and requesting Express Bags quotations and services.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <>
      <PageHero title="Terms of Service" crumbs={[{ name: "Home", path: "/" }, { name: "Terms of Service", path: "/terms" }]} primaryCta={null} />
      <LegalDoc
        updated="October 15, 2026"
        sections={[
          { id: "scope", title: "About these terms", body: <p>These terms apply to your use of this website and to quote requests submitted through it. Each job we perform is governed by the written quotation, booking confirmation or account agreement for that job. If those documents conflict with these terms, the job-specific documents control.</p> },
          { id: "quotes", title: "Quotations and pricing", body: (<>
            <p>Pricing is quote-based. Route, distance, timing, volume, labor, vehicle, access, waiting time, urgency, storage and special handling all affect the price.</p>
            <ul>
              <li>A website request is not a booking. A job is booked only when we issue a written quotation and you approve it, and we confirm the booking.</li>
              <li>Quotations state the included scope, assumptions, change policy and expiration date.</li>
              <li>Changes after booking (for example added items, stops, waiting time or a new schedule) may change the price and are confirmed with you before they are applied.</li>
            </ul>
          </>) },
          { id: "availability", title: "Availability and timing", body: <p>Same-day, urgent and intercity Florida service may be available subject to capacity, distance, access and dispatch confirmation. Airport, cruise-port and venue work is subject to terminal and facility rules and to confirmed access. We do not promise a pickup time until dispatch has approved the job. Requests outside our priority Florida markets are handled as special quotations.</p> },
          { id: "items", title: "Accepted and prohibited items", body: (<>
            <p>You are responsible for describing items accurately, packaging them appropriately and having an authorized person available at pickup and delivery. We do not accept:</p>
            <ul>{exclusions.map((x) => (<li key={x}>{x}</li>))}</ul>
            <p>Restricted, fragile, high-value, oversized, perishable or unusual items require advance review and written acceptance. We may refuse or stop a job that puts people, property or compliance at risk.</p>
          </>) },
          { id: "custody", title: "Handoffs and proof of delivery", body: <p>We confirm counts at pickup, protect the chain of custody and release items only to the authorized receiving party. Completion is documented with an approved proof-of-delivery method such as recipient name, time, signature or photo.</p> },
          { id: "cancel", title: "Cancellations and changes", body: <p>Cancellation and refund terms depend on the stage of the job (for example before dispatch, after a driver is dispatched, after pickup, or once storage or a carrier shipment has started) and are stated in your written quotation or account agreement.</p> },
          { id: "liability", title: "Claims and liability", body: <p>Any loss or damage must be reported promptly with supporting details. Claims are handled under the signed quotation, contract and our claims procedure, and liability limits are those stated in those documents. Nothing on this website creates coverage, insurance or a promise beyond those documents. Business clients may request current certificates where appropriate.</p> },
          { id: "website", title: "Use of this website", body: <p>You agree not to misuse the website, submit false information, attempt unauthorized access or interfere with its operation. Website content is provided for general information and may change. The {company.name} name, logo and content are our property and may not be used without permission.</p> },
          { id: "law", title: "Governing law", body: <p>These terms are governed by the laws of the State of Florida. Questions: call {contact.phoneDisplay} or write to {contact.addressLine}.</p> },
        ]}
      />
    </>
  );
}
