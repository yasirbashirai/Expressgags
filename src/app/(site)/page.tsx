import type { Metadata } from "next";
import { HomeHero } from "@/components/home/hero";
import {
  AudienceSplit,
  CareStandard,
  FaqTeaser,
  FleetRibbon,
  HistoryTeaser,
  HowItWorks,
  IndustriesSection,
  MarketsSection,
  ServicesShowcase,
  TrustStrip,
  WhyUs,
} from "@/components/home/sections";
import { CtaBand } from "@/components/ui/cta-band";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMeta({
    title: "Express Bags, Inc. | Florida Luggage Logistics, Courier & Truck Logistics Since 2010",
    description:
      "Miami-headquartered luggage logistics, hotel and cruise-port transfers, courier, last-mile delivery, luggage storage and box-truck logistics across Florida's key travel markets since 2010. Request a quote.",
    path: "/",
  }),
  title: { absolute: "Express Bags, Inc. | Florida Luggage Logistics, Courier & Truck Logistics Since 2010" },
};

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <TrustStrip />
      <ServicesShowcase />
      <HowItWorks />
      <CareStandard />
      <MarketsSection />
      <WhyUs />
      <IndustriesSection />
      <FleetRibbon />
      <HistoryTeaser />
      <AudienceSplit />
      <FaqTeaser />
      <CtaBand title="Planning a hotel, cruise or group movement?" />
    </>
  );
}
