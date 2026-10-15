import { FacilityIndex } from "@/components/areas/facility-page";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { PlaneArt } from "@/components/ui/illustrations";
import { Section } from "@/components/ui/section";
import { airports, markets } from "@/content/site";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Florida Airport Luggage Service: MIA, FLL, EYW, PBI, MCO, TPA, RSW",
  description: "Planned luggage pickup and delivery involving Florida's major airports for travelers, groups, hotels, DMCs and teams. Subject to terminal rules and confirmed access.",
  path: "/airports",
});

export default function AirportsPage() {
  return (
    <>
      <PageHero
        art={<PlaneArt className="w-full" />}
        eyebrow="Airports"
        title="Airport luggage logistics across Florida"
        lead="We plan luggage pickups and deliveries around arrival windows, baggage counts and authorized handoff points at seven Florida airports. Airport-specific access is confirmed during quoting."
        crumbs={[{ name: "Home", path: "/" }, { name: "Airports", path: "/airports" }]}
      />
      <Section>
        <FacilityIndex items={airports.map((a) => ({ href: `/airports/${a.slug}`, title: a.officialName ?? a.name, badge: a.code, sub: markets.find((m) => m.slug === a.market)?.name ?? "" }))} />
      </Section>
      <CtaBand />
    </>
  );
}
