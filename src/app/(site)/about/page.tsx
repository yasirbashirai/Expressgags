import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass, Layers, ShieldCheck, Users } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { sitePhotos } from "@/components/ui/site-photos";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { careStandard, company, exclusions, operatingEnvironments, winReasons } from "@/content/site";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "About Express Bags | Florida Luggage & Logistics Company Since 2010",
  description:
    "Express Bags, Inc. is a Miami-headquartered Florida luggage and commercial logistics company established in 2010, serving hotels, DMCs, cruise ports, airports, events and businesses.",
  path: "/about",
});

const crumbs = [{ name: "Home", path: "/" }, { name: "About", path: "/about" }];

export default function AboutPage() {
  return (
    <>
      <PageHero
        photo={sitePhotos.valet}
        eyebrow="About Express Bags"
        title="A Florida logistics company built in the field since 2010."
        lead={company.description}
        crumbs={crumbs}
        secondaryCta={{ label: "Our history", href: "/our-history" }}
      />

      <Section>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="eyebrow">Who we are</p>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">From luggage assignments to a full Florida logistics operation.</h2>
            <div className="prose-eb mt-6 text-lg">
              <p>
                Express Bags was established in Miami in 2010 and grew from luggage-focused assignments into hospitality logistics,
                professional courier and last-mile delivery, event support, luggage storage, truck-based commercial work and service
                connecting Florida&apos;s priority travel markets.
              </p>
              <p>{company.strength}</p>
              <p>
                We describe ourselves through our services and our standards. Our trained drivers, helpers, dispatchers and support
                personnel work as one team, and every job has one accountable dispatcher from request to handoff.
              </p>
            </div>
          </div>
          <aside className="lg:col-span-5">
            <div className="rounded-[1.75rem] bg-navy p-8 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">Our north star</p>
              <p className="mt-4 font-display text-2xl font-bold leading-snug text-white">{company.northStar}</p>
              <div className="flight-line mt-8 opacity-80" aria-hidden />
              <p className="mt-6 text-sm text-white/70">{company.sinceLine}</p>
            </div>
          </aside>
        </div>
      </Section>

      <Section tone="cloud" eyebrow="What guides us" title="Four principles behind every job">
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            { Icon: ShieldCheck, ...winReasons[1] },
            { Icon: Compass, ...winReasons[0] },
            { Icon: Layers, ...winReasons[3] },
            { Icon: Users, title: "One team, described collectively", text: "Drivers, helpers, dispatch and support work to one standard. Individual team members are never featured publicly." },
          ].map(({ Icon, title, text }) => (
            <li key={title} className="card p-7">
              <Icon className="h-7 w-7 text-orange-700" aria-hidden />
              <h3 className="mt-5 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-ink">{text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="Our standard" title={careStandard.title} intro={careStandard.lead}>
        <ol className="grid gap-3 md:grid-cols-2">
          {careStandard.points.map((p, i) => (
            <li key={p} className="flex gap-4 rounded-2xl border border-line p-5">
              <span className="font-display font-bold text-orange-700">{String(i + 1).padStart(2, "0")}</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-slate-ink">{careStandard.closing}</p>
      </Section>

      <Section tone="navy" eyebrow="Where we have worked" title="Operating environments across our history">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {operatingEnvironments.map((o) => (
            <li key={o} className="rounded-2xl border border-white/15 bg-white/5 p-5 text-white/85">{o}</li>
          ))}
        </ul>
        <Link href="/notable-projects" className="btn-primary mt-10">See notable projects <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </Section>

      <Section eyebrow="Clear boundaries" title="What we do not offer" intro="Saying no clearly is part of doing the job well. Through this website we do not market or accept:">
        <ul className="grid gap-3 md:grid-cols-2">
          {exclusions.map((x) => (
            <li key={x} className="rounded-2xl bg-sand p-5 text-charcoal">{x}</li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-slate-ink">Restricted, fragile, high-value, oversized, perishable or unusual items require advance review and written acceptance.</p>
      </Section>

      <CtaBand />
    </>
  );
}
