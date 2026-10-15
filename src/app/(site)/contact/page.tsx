import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { ContactForm } from "@/components/company/forms";
import { ContactCard } from "@/components/company/blocks";
import { contact } from "@/content/site";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Contact Express Bags | Miami Office (305) 783-2860",
  description: "Contact Express Bags, Inc. Office (305) 783-2860, P.O. Box 667538, Miami, FL 33166. Visits by appointment only. Request a quote online.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Talk to our Miami office."
        lead="For pricing, the quote form gathers everything dispatch needs and gets you the fastest accurate answer. For anything else, call or send a message."
        crumbs={[{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }]}
        secondaryCta={{ label: `Call ${contact.phoneDisplay}`, href: contact.phoneHref }}
      />
      <Section>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-5">
            <ContactCard />
            <div className="flex gap-4 rounded-[var(--radius-card)] bg-sand p-6">
              <CalendarCheck className="h-6 w-6 shrink-0 text-orange-700" aria-hidden />
              <div>
                <h2 className="text-base font-bold">{contact.visits}</h2>
                <p className="mt-1 text-sm text-slate-ink">We do not offer walk-in service. If a visit is needed, location details are shared privately once an appointment is confirmed.</p>
              </div>
            </div>
            <Link href="/request-a-quote" className="group flex items-center justify-between rounded-[var(--radius-card)] bg-orange p-6 text-white">
              <span>
                <span className="block font-display text-xl font-bold">Request a Quote</span>
                <span className="text-sm text-white/85">Route, date, items and timing in one form</span>
              </span>
              <ArrowRight className="h-6 w-6 transition group-hover:translate-x-1" aria-hidden />
            </Link>
          </div>
          <div className="card p-6 md:p-9 lg:col-span-7">
            <h2 className="text-2xl font-bold">Send a message</h2>
            <p className="mt-2 text-sm text-slate-ink">We reply during office hours.</p>
            <div className="mt-8"><ContactForm /></div>
          </div>
        </div>
      </Section>
    </>
  );
}
