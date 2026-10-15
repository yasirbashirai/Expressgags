import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { HotelArt } from "@/components/ui/illustrations";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { industries, services } from "@/content/site";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Industries We Serve | Hotels, DMCs, Cruise, Sports, Events & Business",
  description:
    "Luggage and time-sensitive logistics for hotels and resorts, destination management companies, cruise and shore operations, airlines, corporate groups, sports, entertainment, events, universities and commercial businesses in Florida.",
  path: "/industries",
});

/** Which services each industry typically uses (links to service pages). */
const USES: Record<string, string[]> = {
  "Hotels & Resorts": ["hotel-hospitality-logistics", "luggage-storage", "airport-luggage"],
  "Destination Management (DMCs)": ["vip-group-luggage", "hotel-hospitality-logistics", "cruise-port-luggage"],
  "Cruise & Shore Operations": ["cruise-port-luggage", "luggage-storage", "cargo-van-box-truck"],
  "Airlines & Airports": ["airport-luggage", "courier-last-mile"],
  "Corporate & Incentive Groups": ["vip-group-luggage", "airport-luggage", "hotel-hospitality-logistics"],
  "Sports Organizations": ["sports-entertainment-events", "cargo-van-box-truck"],
  "Entertainment & Touring": ["sports-entertainment-events", "vip-group-luggage"],
  "Conventions & Events": ["sports-entertainment-events", "cargo-van-box-truck", "courier-last-mile"],
  Universities: ["sports-entertainment-events", "vip-group-luggage"],
  "Commercial Businesses": ["courier-last-mile", "cargo-van-box-truck"],
};

export default function IndustriesPage() {
  const bySlug = Object.fromEntries(services.map((s) => [s.slug, s]));
  return (
    <>
      <PageHero
        art={<HotelArt className="mx-auto h-64 w-auto" />}
        eyebrow="Industries we serve"
        title="The logistics partner behind hospitality, travel and events."
        lead="Our strongest base is tourism and hospitality. Our fastest-growing work is recurring business accounts that need careful handoffs, schedule discipline and proof of completion."
        crumbs={[{ name: "Home", path: "/" }, { name: "Industries", path: "/industries" }]}
        secondaryCta={{ label: "Business accounts", href: "/business-accounts" }}
      />
      <Section>
        <ul className="grid gap-5 md:grid-cols-2">
          {industries.map((ind, i) => (
            <li key={ind.name} className="card flex flex-col p-7 md:p-8">
              <span className="font-display text-sm font-bold text-orange-700">{String(i + 1).padStart(2, "0")}</span>
              <h2 className="mt-3 text-2xl font-bold">{ind.name}</h2>
              <p className="mt-2 flex-1 text-slate-ink">{ind.text}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {(USES[ind.name] || []).map((slug) => bySlug[slug] && (
                  <Link key={slug} href={`/services/${slug}`} className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-navy-100">
                    {bySlug[slug].name} <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Section>
      <CtaBand />
    </>
  );
}
