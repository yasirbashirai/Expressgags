import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { HistoryTimeline } from "@/components/company/history-timeline";
import { company, operatingEnvironments } from "@/content/site";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Our History 2010–2026 | Express Bags, Inc.",
  description:
    "From a Miami luggage operation in 2010 to a Florida logistics platform: corporate groups, cruise programs, sports, entertainment, the pandemic, rebuilding and digital expansion.",
  path: "/our-history",
});

export default function HistoryPage() {
  return (
    <>
      <PageHero
        eyebrow={`${company.founded} to today`}
        title="Sixteen years of moving what matters."
        lead="Express Bags is not a new luggage startup. Our history is the proof behind the platform: corporate groups, cruise programs, sports, entertainment and VIP movements across Florida's airports, hotels and ports."
        crumbs={[{ name: "Home", path: "/" }, { name: "About", path: "/about" }, { name: "Our History", path: "/our-history" }]}
        primaryCta={null}
        secondaryCta={{ label: "Notable projects", href: "/notable-projects" }}
      />

      <Section eyebrow="The timeline" title="Explore each chapter">
        <HistoryTimeline />
      </Section>

      <Section tone="sand" eyebrow="An honest chapter" title="What the pandemic changed, and what it didn't">
        <div className="grid gap-10 lg:grid-cols-2">
          <p className="text-lg leading-relaxed text-slate-ink">
            Before 2020, Express Bags operated inside a broad network of travel, cruise, destination-management, transportation,
            hospitality, sports and entertainment partners. COVID-19 disrupted nearly all of those industries at once, and a number of
            historic accounts never returned.
          </p>
          <p className="text-lg leading-relaxed text-slate-ink">
            The business survived, retained and rebuilt core relationships, and kept performing sophisticated group and entertainment
            logistics. A smaller customer list today reflects an industry shock, not a loss of capability. The next chapter broadens
            that capability with courier, last-mile and Florida-wide service.
          </p>
        </div>
      </Section>

      <Section eyebrow="Where the work happened" title="Operating environments">
        <ul className="flex flex-wrap gap-2">
          {operatingEnvironments.map((o) => (
            <li key={o} className="rounded-full border border-line bg-white px-4 py-2 text-sm text-navy">{o}</li>
          ))}
        </ul>
        <Link href="/services" className="btn-ghost mt-10">What we do today <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </Section>

      <CtaBand title="Put sixteen years of experience on your next job." />
    </>
  );
}
