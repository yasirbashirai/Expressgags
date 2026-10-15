import Link from "next/link";
import { ArrowRight, Ban } from "lucide-react";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { JsonLd } from "@/components/ui/json-ld";
import { serviceIcon } from "@/components/services/service-icon";
import { serviceCopy } from "@/content/seo-copy";
import { exclusions, howItWorks, services } from "@/content/site";
import { pageMeta, serviceSchema } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Services: Luggage Logistics, Courier & Box-Truck Logistics in Florida",
  description:
    "VIP and group luggage, hotel and DMC logistics, airport and cruise-port luggage, luggage storage, sports and event logistics, courier, last-mile and box-truck logistics across Florida. Request a quote.",
  path: "/services",
});

const GROUPS = [
  { key: "luggage", title: "Luggage & hospitality logistics", intro: "Travel-industry services built on sixteen years of airport, hotel and cruise-port operations." },
  { key: "commercial", title: "Courier & commercial logistics", intro: "Scheduled, time-sensitive and truck-based work for businesses across our Florida markets." },
] as const;

export default function ServicesPage() {
  return (
    <>
      <PageHero
        eyebrow="Services"
        title="Eight services. One accountable logistics partner."
        lead="From a single VIP suitcase to a 26-foot box truck of event equipment, every job is planned, counted and documented by one dispatch team, across Florida's key travel markets."
        crumbs={[{ name: "Home", path: "/" }, { name: "Services", path: "/services" }]}
        secondaryCta={{ label: "See service areas", href: "/service-areas" }}
      />

      {GROUPS.map((g, gi) => (
        <Section key={g.key} tone={gi ? "cloud" : "white"} eyebrow={gi ? "Commercial" : "Travel & hospitality"} title={g.title} intro={g.intro}>
          <div className={`grid gap-5 ${g.key === "luggage" ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2"}`}>
            {services.filter((s) => serviceCopy[s.slug].group === g.key).map((s) => {
              const Icon = serviceIcon(s.icon);
              return (
                <Link key={s.slug} href={`/services/${s.slug}`} className="card group flex flex-col p-6 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-navy text-white transition group-hover:bg-orange"><Icon className="h-6 w-6" aria-hidden /></span>
                  <h3 className="mt-5 text-xl font-bold">{s.name}</h3>
                  <p className="mt-2 flex-1 text-slate-ink">{s.short}</p>
                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {s.audiences.slice(0, 3).map((a) => (<li key={a} className="rounded-full bg-cloud px-2.5 py-1 text-xs text-navy">{a}</li>))}
                  </ul>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-700">Explore the service <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden /></span>
                </Link>
              );
            })}
          </div>
        </Section>
      ))}

      <Section tone="navy" eyebrow="How it works" title="Every job follows the same disciplined path">
        <ol className="grid gap-4 md:grid-cols-5">
          {howItWorks.map((h, i) => (
            <li key={h.step} className="rounded-2xl border border-white/15 bg-white/5 p-5">
              <span className="font-display text-3xl font-extrabold text-orange">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-2 text-lg font-bold text-white">{h.step}</h3>
              <p className="mt-1.5 text-sm text-white/75">{h.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow="Clear boundaries" title="What we don't do" intro="Knowing what we decline helps you plan faster and keeps our teams focused on professional, properly scoped logistics.">
        <ul className="grid gap-3 md:grid-cols-2">
          {exclusions.map((e) => (
            <li key={e} className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4"><Ban className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" aria-hidden /><span>{e}</span></li>
          ))}
        </ul>
        <p className="mt-5 text-sm text-muted">Restricted, fragile, high-value, oversized or unusual items need advance review and written acceptance.</p>
      </Section>

      <CtaBand />
      <JsonLd data={services.map((s) => serviceSchema({ name: s.name, description: s.short, path: `/services/${s.slug}` }))} />
    </>
  );
}
