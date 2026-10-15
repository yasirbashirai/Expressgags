import type { Metadata } from "next";
import { FileDown } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { pageMeta } from "@/lib/seo";
import { loadResources, mediaUrl } from "@/components/cms/content-api";

export const revalidate = 300; // ISR: 5 minutes (also revalidated on publish)

const fileSize = (b: number | null) => (b == null ? "" : b > 1_000_000 ? `${(b / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1000))} KB`);
const fileType = (m: string | null, n: string | null) => (m === "application/pdf" ? "PDF" : (n?.split(".").pop() ?? "File").toUpperCase());

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

/** Published downloads from the CMS first, then the planned documents that are still being finalized. */
export default async function ResourcesPage() {
  const published = (await loadResources()).filter((r) => r.mediaId);
  const titles = new Set(published.map((r) => r.title.toLowerCase()));
  const upcoming = RESOURCES.filter((r) => !titles.has(r.t.toLowerCase()));
  return (
    <>
      <PageHero
        eyebrow="Resources"
        title="Planning tools and policies."
        lead={published.length ? "Practical documents that make every job smoother. Download what you need, or ask dispatch during your quote." : "Practical documents that make every job smoother. Downloads are being finalized and will be published here once approved."}
        crumbs={[{ name: "Home", path: "/" }, { name: "Resources & Downloads", path: "/resources" }]}
        primaryCta={null}
      />
      <Section>
        {published.length > 0 && (
          <ul className="mb-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {published.map((r) => (
              <li key={r.id} className="card flex flex-col p-7">
                <div className="flex items-center justify-between">
                  <FileDown className="h-7 w-7 text-orange-700" aria-hidden />
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{fileType(r.mimeType, r.fileName)} · {fileSize(r.sizeBytes)}</span>
                </div>
                <h2 className="mt-5 text-lg font-bold">{r.title}</h2>
                {r.description && <p className="mt-2 flex-1 text-sm text-slate-ink">{r.description}</p>}
                <a href={`${mediaUrl(r.mediaId!)}?download=1`} className="btn-navy mt-6 self-start !py-2" download>
                  Download <span className="sr-only">{r.title}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {upcoming.length > 0 && published.length > 0 && <h2 className="mb-5 text-xl font-bold">Coming soon</h2>}
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((r) => (
            <li key={r.t} className="card flex flex-col p-7">
              <div className="flex items-center justify-between">
                <FileDown className="h-7 w-7 text-orange-700" aria-hidden />
                <span className="rounded-full bg-cloud px-3 py-1 text-xs font-semibold text-muted">Coming soon</span>
              </div>
              {published.length > 0 ? <h3 className="mt-5 text-lg font-bold">{r.t}</h3> : <h2 className="mt-5 text-lg font-bold">{r.t}</h2>}
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
