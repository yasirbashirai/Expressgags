import type { Metadata } from "next";
import { FileDown } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Resources & Downloads | Express Bags, Inc.",
  description: "Policies, templates and planning guides for Express Bags clients: prohibited items, group manifests, service areas and business account onboarding.",
  path: "/resources",
});

const RESOURCES = [
  { t: "Prohibited & restricted items policy", d: "What we cannot carry, and which items need advance review.", audience: "All clients" },
  { t: "Group luggage manifest template", d: "A ready-made manifest for group, team and program movements.", audience: "Groups, DMCs, teams" },
  { t: "Florida service area overview", d: "Our eight priority markets, airports and cruise ports at a glance.", audience: "All clients" },
  { t: "Cruise day planning checklist", d: "Timings, contacts and handoff points for embarkation and debarkation days.", audience: "Cruise groups" },
  { t: "Business account onboarding pack", d: "Vendor forms, billing setup and what we need to open an account.", audience: "Business clients" },
  { t: "Event load-in and load-out planner", d: "Staging, venue access and vehicle planning for events.", audience: "Event organizers" },
];

export default function ResourcesPage() {
  return (
    <>
      <PageHero
        eyebrow="Resources"
        title="Planning tools and policies."
        lead="Practical documents that make every job smoother. Downloads are being finalized and will be published here once approved."
        crumbs={[{ name: "Home", path: "/" }, { name: "Resources & Downloads", path: "/resources" }]}
        primaryCta={null}
      />
      <Section>
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {RESOURCES.map((r) => (
            <li key={r.t} className="card flex flex-col p-7">
              <div className="flex items-center justify-between">
                <FileDown className="h-7 w-7 text-orange-700" aria-hidden />
                <span className="rounded-full bg-cloud px-3 py-1 text-xs font-semibold text-muted">Coming soon</span>
              </div>
              <h2 className="mt-5 text-lg font-bold">{r.t}</h2>
              <p className="mt-2 flex-1 text-sm text-slate-ink">{r.d}</p>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-navy">{r.audience}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-slate-ink">Need one of these now? Ask during your quote and dispatch will send it.</p>
      </Section>
      <CtaBand />
    </>
  );
}
