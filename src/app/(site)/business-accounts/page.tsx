import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, CalendarClock, ClipboardCheck, FileText, Headset, Receipt, Repeat, Route } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { sitePhotos } from "@/components/ui/site-photos";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Business Accounts | Hotels, DMCs, Event Teams & Commercial Clients",
  description:
    "Account-based luggage, courier and box-truck logistics for Florida hotels, DMCs, tour operators, event organizers and businesses: approved terms, centralized invoicing, PO support, recurring routes and proof of delivery.",
  path: "/business-accounts",
});

const FEATURES = [
  { Icon: BadgeCheck, t: "Account onboarding", d: "Approved terms, vendor forms, W-9 and billing details set up once." },
  { Icon: Receipt, t: "Centralized invoicing", d: "Consolidated billing with purchase-order and cost-center references." },
  { Icon: FileText, t: "Certificates on request", d: "Current insurance certificates and credential verification for approved clients when applicable." },
  { Icon: Headset, t: "A dedicated dispatch contact", d: "One accountable dispatcher who knows your properties, routes and people." },
  { Icon: Repeat, t: "Recurring schedules", d: "Standing routes and repeat-booking workflows for regular movements." },
  { Icon: Route, t: "Multi-stop, multi-vehicle", d: "Manifests, multiple pickup points and coordinated vehicles for group programs." },
  { Icon: ClipboardCheck, t: "Proof of delivery", d: "Counts, timestamps, recipient names and approved photos or signatures on every job." },
  { Icon: CalendarClock, t: "Status and exceptions", d: "Status notifications and immediate escalation when something threatens the plan." },
];

export default function BusinessAccountsPage() {
  return (
    <>
      <PageHero
        photo={sitePhotos.sunrise}
        eyebrow="Business accounts"
        title="A dependable Florida operating partner for your guests, groups and routes."
        lead="Hotels, resorts, DMCs, tour operators, event organizers and commercial businesses get account-based service with clear terms, one dispatch contact and documented completion."
        crumbs={[{ name: "Home", path: "/" }, { name: "Business Accounts", path: "/business-accounts" }]}
        primaryCta={{ label: "Start an account inquiry", href: "/request-a-quote?type=business" }}
        secondaryCta={{ label: "Request a Quote", href: "/request-a-quote" }}
      />

      <Section eyebrow="What accounts include" title="Built around how B2B logistics actually works">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ Icon, t, d }) => (
            <li key={t} className="card p-6">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-700"><Icon className="h-5 w-5" aria-hidden /></span>
              <h3 className="mt-5 text-lg font-bold">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-ink">{d}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="navy" eyebrow="Ideal partners" title="Who business accounts are for">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { t: "Hospitality & travel programs", d: "Recurring hotel, resort, DMC or travel-program clients booking airport, hotel, cruise-port and group luggage transfers across one or more Florida markets." },
            { t: "Sports, entertainment & events", d: "Touring, convention and event organizations moving luggage, gear or equipment on exact timelines with flexible labor and vehicle capacity." },
            { t: "Commercial routes", d: "Businesses that need repeat local or intercity courier, last-mile, pallet, cargo-van or box-truck service with consistent routes and centralized billing." },
          ].map((p) => (
            <div key={p.t} className="rounded-[1.5rem] border border-white/15 bg-white/5 p-7">
              <h3 className="text-xl font-bold text-white">{p.t}</h3>
              <p className="mt-3 text-white/75">{p.d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Getting started" title="Three steps to an account">
        <ol className="grid gap-5 md:grid-cols-3">
          {[
            { t: "Tell us about your program", d: "Properties or locations, typical volumes, routes and seasons." },
            { t: "Agree terms", d: "We confirm scope, service windows, billing, documents and contacts in writing." },
            { t: "Book with one contact", d: "Your dispatch contact plans each job and confirms completion with proof of delivery." },
          ].map((s, i) => (
            <li key={s.t} className="rounded-[1.5rem] bg-sand p-7">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-navy font-display font-bold text-white">{i + 1}</span>
              <h3 className="mt-5 text-lg font-bold">{s.t}</h3>
              <p className="mt-2 text-sm text-slate-ink">{s.d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-sm text-slate-ink">
          Existing clients: a secure client portal for quotes, bookings, invoices and proof of delivery is on the way. <Link href="/client-login" className="font-semibold text-orange-700 underline">Learn more</Link>.
        </p>
      </Section>
      <CtaBand title="Let's plan your program." />
    </>
  );
}
