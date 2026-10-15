import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { HistoryTimeline } from "@/components/company/history-timeline";
import { company, notableProjects, operatingEnvironments } from "@/content/site";
import { loadHistory, type PublicHistoryEntry } from "@/components/cms/content-api";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Our History 2010–2026 | Express Bags, Inc.",
  description:
    "From a Miami luggage operation in 2010 to a Florida logistics platform: corporate groups, cruise programs, sports, entertainment, the pandemic, rebuilding and digital expansion.",
  path: "/our-history",
});

export const revalidate = 300; // ISR: 5 minutes (also revalidated on publish)

/** Generic, permission-safe fallback when the CMS is unreachable or not yet initialized. */
const FALLBACK: PublicHistoryEntry[] = notableProjects.map((p, i) => ({
  key: `static-${i}`,
  year: p.period,
  title: p.permissionGranted ? p.title : p.genericTitle,
  type: p.type,
  summary: p.summary,
  through: null,
  locations: [],
  named: p.permissionGranted,
}));

export default async function HistoryPage() {
  const records = (await loadHistory()) ?? FALLBACK;
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

      {records.length > 0 && (
        <Section tone="cloud" eyebrow="On the record" title="Assignments from our records" intro="Documented work drawn from invoices, work orders and operating records. Where work was contracted through a partner, organization names are withheld unless permission is recorded.">
          <ol className="grid gap-px overflow-hidden rounded-[1.5rem] border border-line bg-line md:grid-cols-2">
            {records.map((r) => (
              <li key={r.key} className="flex gap-5 bg-white p-6">
                <p className="w-24 shrink-0 font-display text-sm font-bold text-orange-700">{r.year}</p>
                <div className="min-w-0">
                  <h3 className="font-bold text-navy">{r.title}</h3>
                  {r.type && <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-muted">{r.type}</p>}
                  <p className="mt-2 text-sm leading-relaxed text-slate-ink">{r.summary}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link href="/notable-projects" className="btn-ghost mt-8">See notable projects <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </Section>
      )}

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
