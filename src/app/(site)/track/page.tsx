import type { Metadata } from "next";
import Link from "next/link";
import { Radar } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { ComingSoon, ContactCard } from "@/components/company/blocks";
import { inputCls } from "@/components/company/forms";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Track Your Delivery | Express Bags, Inc.",
  description: "Track an Express Bags job by its Express Bags reference number. Live tracking activates with our dispatch platform.",
  path: "/track",
});

export default function TrackPage() {
  return (
    <>
      <PageHero
        eyebrow="Tracking"
        title="Track your delivery."
        lead="Live status for Express Bags jobs, from driver assigned to delivered, is being connected to our dispatch platform."
        crumbs={[{ name: "Home", path: "/" }, { name: "Track Your Delivery", path: "/track" }]}
        primaryCta={null}
      />
      <Section>
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <ComingSoon Icon={Radar} title="Live tracking activates with dispatch" text="Soon you will enter your Express Bags reference (it starts with EB-) to see each step: order confirmed, driver assigned, en route, picked up, in transit and delivered, with proof of delivery. Until then, your dispatcher keeps you updated directly.">
              <form aria-label="Track a delivery" className="flex flex-col gap-3 sm:flex-row" action="/track">
                <label htmlFor="ref" className="sr-only">Express Bags reference</label>
                <input id="ref" name="ref" placeholder="Express Bags reference, e.g. EB-Q-260415-7K3P" className={inputCls} disabled aria-describedby="ref-note" />
                <button type="button" className="btn-navy shrink-0" disabled>Track</button>
              </form>
              <p id="ref-note" className="mt-3 text-xs text-muted">
                This page tracks Express Bags job references only. Shipments handed to a national carrier will show their own carrier
                tracking, clearly labeled, once nationwide shipping launches.
              </p>
            </ComingSoon>
          </div>
          <div className="lg:col-span-4">
            <ContactCard />
            <p className="mt-4 text-sm text-slate-ink">Have a job in progress? Call dispatch through our office line. New request? <Link href="/request-a-quote" className="font-semibold text-orange-700 underline">Request a Quote</Link>.</p>
          </div>
        </div>
      </Section>
    </>
  );
}
