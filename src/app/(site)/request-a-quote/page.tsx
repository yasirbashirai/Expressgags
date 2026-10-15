import { Suspense } from "react";
import { Clock, FileText, Phone, ShieldCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { QuoteWizard } from "@/components/quote/quote-wizard";
import { contact } from "@/content/site";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Request a Quote",
  description:
    "Request a quote for luggage transfers, airport and cruise-port luggage, storage, group and event logistics, courier, last-mile and box-truck service across Florida. Written quotation, no payment needed.",
  path: "/request-a-quote",
});

export default function RequestAQuotePage() {
  return (
    <>
      {/* Compact hero: on a phone the wizard should start within the first screen */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-40 hidden h-[26rem] w-[26rem] rounded-full border-[22px] border-orange/25 sm:block" />
        <div className="container-eb relative py-8 md:py-14">
          <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Request a Quote", path: "/request-a-quote" }]} light />
          <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight text-white md:mt-6 md:text-5xl">Request a Quote</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/80 md:text-lg">
            Tell us what is moving. A few quick steps, built for your phone, and our dispatch team sends a written quotation.
          </p>
        </div>
        <div className="flight-line opacity-70" aria-hidden />
      </section>
      <section className="bg-cloud py-6 md:py-14">
        <div className="container-eb grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Suspense fallback={<div className="card h-96 animate-pulse" aria-busy="true" />}>
            <QuoteWizard />
          </Suspense>

          <aside className="grid gap-4 lg:sticky lg:top-28" aria-label="About your quote">
            <div className="card p-6">
              <h2 className="text-lg font-bold">How quoting works</h2>
              <ul className="mt-4 grid gap-4 text-sm text-slate-ink">
                <li className="flex gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-orange" aria-hidden />
                  <span>Every job is priced for its route, vehicle, labor, timing and handling, then confirmed in writing.</span>
                </li>
                <li className="flex gap-3">
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-orange" aria-hidden />
                  <span>Same-day and urgent requests are welcome, subject to capacity and dispatch confirmation.</span>
                </li>
                <li className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange" aria-hidden />
                  <span>Counts, chain of custody and handoffs are documented from pickup to completion.</span>
                </li>
              </ul>
            </div>
            <div className="rounded-[var(--radius-card)] bg-navy p-6 text-white">
              <h2 className="text-lg font-bold text-white">Prefer to talk it through?</h2>
              <p className="mt-2 text-sm text-white/75">Large groups, events and recurring routes are often easiest by phone.</p>
              <a href={contact.phoneHref} className="btn-primary mt-4 w-full">
                <Phone className="h-4 w-4" aria-hidden /> {contact.phoneDisplay}
              </a>
              <ul className="mt-4 space-y-1 text-xs text-white/60">
                {contact.hours.map((h) => (
                  <li key={h.days}>
                    {h.days}: {h.time}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
