import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareQuote, Quote, ShieldCheck, Star } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { pageMeta } from "@/lib/seo";
import { loadTestimonials } from "@/components/cms/content-api";

export const revalidate = 300; // ISR: 5 minutes (also revalidated on publish)

export const metadata: Metadata = pageMeta({
  title: "Client Testimonials | Express Bags, Inc.",
  description: "Express Bags publishes client testimonials only with written permission. Here is how we handle reviews and references.",
  path: "/testimonials",
});

/** Testimonials appear only after written approval is recorded in the CMS (form B13). Never invented. */
export default async function TestimonialsPage() {
  const testimonials = await loadTestimonials();
  return (
    <>
      <PageHero
        eyebrow="Testimonials"
        title="References you can trust, because they are real."
        lead="Many of our clients are hotels, DMCs, teams and productions that value discretion. We publish a testimonial only after the client approves the exact wording in writing."
        crumbs={[{ name: "Home", path: "/" }, { name: "Testimonials", path: "/testimonials" }]}
        primaryCta={null}
      />
      {testimonials.length > 0 && (
        <Section eyebrow="In their words" title="What clients tell us">
          <ul className="columns-1 gap-6 md:columns-2 lg:columns-3 [&>li]:mb-6">
            {testimonials.map((t, i) => (
              <li key={t.id} className={`break-inside-avoid rounded-[var(--radius-card)] p-7 ${i % 3 === 0 ? "bg-navy text-white" : "card"}`}>
                <figure>
                  <Quote className={`h-8 w-8 ${i % 3 === 0 ? "text-orange" : "text-orange-700"}`} aria-hidden />
                  {t.rating ? (
                    <p className="mt-4 flex gap-0.5" aria-label={`${t.rating} out of 5`}>
                      {Array.from({ length: 5 }, (_, k) => (
                        <Star key={k} aria-hidden className={`h-4 w-4 ${k < (t.rating ?? 0) ? "fill-orange text-orange" : i % 3 === 0 ? "text-white/30" : "text-line"}`} />
                      ))}
                    </p>
                  ) : null}
                  <blockquote className={`mt-4 text-lg leading-relaxed ${i % 3 === 0 ? "text-white" : "text-charcoal"}`}>{t.quote}</blockquote>
                  <figcaption className={`mt-5 text-sm font-semibold ${i % 3 === 0 ? "text-orange-100" : "text-navy"}`}>{t.attribution}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section tone={testimonials.length > 0 ? "cloud" : "white"}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card flex flex-col items-start p-8 lg:col-span-2">
            <MessageSquareQuote className="h-10 w-10 text-orange-700" aria-hidden />
            <h2 className="mt-6 text-2xl font-bold">{testimonials.length > 0 ? "Every testimonial is approved in writing." : "Approved testimonials will appear here."}</h2>
            <p className="mt-3 max-w-xl text-slate-ink">
              We are collecting written approvals from long-standing clients. We never publish invented reviews, and we never name a
              client, venue, team or artist without permission.
            </p>
            <p className="mt-6 text-sm text-slate-ink">
              Business clients can request references during the account process. <Link href="/business-accounts" className="font-semibold text-orange-700 underline">About business accounts</Link>
            </p>
          </div>
          <div className="rounded-[var(--radius-card)] bg-navy p-8 text-white">
            <ShieldCheck className="h-9 w-9 text-orange" aria-hidden />
            <h2 className="mt-6 text-xl font-bold text-white">Worked with us?</h2>
            <p className="mt-3 text-white/75">We would value your feedback. Share it through our contact form and tell us whether we may publish it.</p>
            <Link href="/contact" className="btn-primary mt-6">Share feedback</Link>
          </div>
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
