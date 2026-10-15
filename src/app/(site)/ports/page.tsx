import { FacilityIndex } from "@/components/areas/facility-page";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { CruiseShipArt } from "@/components/ui/illustrations";
import { Section } from "@/components/ui/section";
import { markets, ports } from "@/content/site";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Florida Cruise Port Luggage Service: PortMiami, Port Everglades, Port Canaveral & more",
  description: "Timed cruise luggage movements involving PortMiami, Port Everglades, Port of Key West, Port of Palm Beach, Port Canaveral and Port Tampa Bay. Subject to terminal rules and ship schedules.",
  path: "/ports",
});

export default function PortsPage() {
  return (
    <>
      <PageHero
        art={<CruiseShipArt className="w-full" />}
        eyebrow="Cruise ports"
        title="Cruise-port luggage logistics across Florida"
        lead="Hotel-to-port, airport-to-port and port-to-hotel luggage movements at six Florida cruise ports, planned around ship schedules with manifests, buffer time and one accountable dispatcher."
        crumbs={[{ name: "Home", path: "/" }, { name: "Cruise Ports", path: "/ports" }]}
      />
      <Section>
        <FacilityIndex items={ports.map((p) => ({ href: `/ports/${p.slug}`, title: p.name, sub: markets.find((m) => m.slug === p.market)?.name ?? "" }))} />
      </Section>
      <CtaBand />
    </>
  );
}
