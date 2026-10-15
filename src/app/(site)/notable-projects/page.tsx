import type { Metadata } from "next";
import { Info } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { notableProjects } from "@/content/site";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Notable Projects | Express Bags, Inc.",
  description:
    "Corporate charter groups, touring-artist operations, professional sports teams, royal-family VIP assignments and themed cruise programs handled by Express Bags across Florida.",
  path: "/notable-projects",
});

export default function NotableProjectsPage() {
  return (
    <>
      <PageHero
        eyebrow="Proof in the field"
        title="Notable projects and assignments."
        lead="Much of our strongest work was performed through destination-management companies, transportation providers and travel operators. Each story below describes the work itself."
        crumbs={[{ name: "Home", path: "/" }, { name: "About", path: "/about" }, { name: "Notable Projects", path: "/notable-projects" }]}
      />

      <Section>
        <div className="mb-10 flex gap-3 rounded-2xl bg-navy-50 p-5 text-sm text-navy">
          <Info className="h-5 w-5 shrink-0" aria-hidden />
          <p>
            We name a client, team, artist or partner only with written permission. Where work was contracted through a partner, we
            say so. Organization names below are withheld until that permission is recorded.
          </p>
        </div>
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {notableProjects.map((p, i) => (
            <li key={p.id} className={`relative flex flex-col overflow-hidden rounded-[1.5rem] p-7 ${i % 4 === 0 ? "bg-navy text-white" : "card"}`}>
              <div aria-hidden className={`absolute -right-12 -top-12 h-40 w-40 rounded-full border-[12px] ${i % 4 === 0 ? "border-orange/60 !border-[3px]" : "border-orange/10"}`} />
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${i % 4 === 0 ? "bg-white/10 text-orange-100" : "bg-orange-50 text-orange-700"}`}>{p.type}</span>
                <span className={`font-display text-sm font-bold ${i % 4 === 0 ? "text-white/70" : "text-muted"}`}>{p.period}</span>
              </div>
              <h2 className={`mt-6 text-xl font-bold ${i % 4 === 0 ? "text-white" : ""}`}>{p.permissionGranted ? p.title : p.genericTitle}</h2>
              <p className={`mt-3 flex-1 text-sm leading-relaxed ${i % 4 === 0 ? "text-white/75" : "text-slate-ink"}`}>{p.summary.replace(/\s*\([^)]*never stated[^)]*\)/i, "")}</p>
              {p.through && (
                <p className={`mt-5 border-t pt-4 text-xs ${i % 4 === 0 ? "border-white/15 text-white/60" : "border-line text-muted"}`}>
                  Supported through {p.permissionGranted ? p.through : "a contracting partner"}.
                </p>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand title="Planning a group, team or production movement?" />
    </>
  );
}
