import type { Metadata } from "next";
import { Headset, PackageCheck, Truck } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { EventsArt } from "@/components/ui/illustrations";
import { Section } from "@/components/ui/section";
import { CareersForm } from "@/components/company/forms";
import { careStandard } from "@/content/site";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Careers | Drivers, Helpers & Dispatch Jobs in Florida",
  description: "Join Express Bags as a driver, helper or dispatch and customer support team member across our Florida markets. Apply online.",
  path: "/careers",
});

const ROLES = [
  { Icon: Truck, t: "Drivers", d: "Operate cargo vans and box trucks on local and intercity routes between hotels, airports, cruise ports, venues and businesses. Safe driving record and professional conduct required." },
  { Icon: PackageCheck, t: "Helpers", d: "Load, secure, count and hand off luggage, gear and cargo with care. Physical work, careful hands, punctual and guest-facing." },
  { Icon: Headset, t: "Dispatch & customer support", d: "Plan jobs, build job tickets, keep customers informed and handle exceptions calmly. Organized, clear communicators thrive here." },
];

export default function CareersPage() {
  return (
    <>
      <PageHero
        art={<EventsArt className="mx-auto h-64 w-auto" />}
        eyebrow="Careers"
        title="Do careful work for people who notice."
        lead="Our teams move luggage and equipment for hotels, travel programs, sports teams and productions across Florida. We hire people who take pride in punctuality, careful handling and clear communication."
        crumbs={[{ name: "Home", path: "/" }, { name: "Careers", path: "/careers" }]}
        primaryCta={{ label: "Apply now", href: "#apply" }}
      />
      <Section eyebrow="Roles we hire" title="Open to applications">
        <ul className="grid gap-5 md:grid-cols-3">
          {ROLES.map(({ Icon, t, d }) => (
            <li key={t} className="card p-7">
              <Icon className="h-8 w-8 text-orange-700" aria-hidden />
              <h3 className="mt-5 text-xl font-bold">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-ink">{d}</p>
            </li>
          ))}
        </ul>
      </Section>
      <Section tone="cloud" id="apply">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="eyebrow">How we work</p>
            <h2 className="mt-3 text-3xl font-bold">{careStandard.title}</h2>
            <ul className="mt-6 space-y-3">
              {careStandard.points.slice(0, 6).map((p) => (
                <li key={p} className="flex gap-3 text-slate-ink"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />{p}</li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-muted">Team member details stay private. We never publish employee names, photos or schedules.</p>
          </div>
          <div className="card p-6 md:p-9 lg:col-span-7">
            <h2 className="text-2xl font-bold">Apply online</h2>
            <p className="mt-2 text-sm text-slate-ink">It takes about three minutes. We review every application.</p>
            <div className="mt-8"><CareersForm /></div>
          </div>
        </div>
      </Section>
    </>
  );
}
