import type { Metadata } from "next";
import { HomeHero } from "@/components/home/hero";
import { AudienceSplit, CareStandard, FaqTeaser, ServicesShowcase, WhyUs } from "@/components/home/sections";
import { FollowABag } from "@/components/home/follow-a-bag";
import { RoutePlanner } from "@/components/home/route-planner";
import { Credibility, MarketsGrid } from "@/components/home/credibility";
import { CtaBand } from "@/components/ui/cta-band";
import { SocialFeeds } from "@/components/home/social-feeds";
import { InAction } from "@/components/home/in-action";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMeta({
    title: "Express Bags, Inc. | Florida Luggage Logistics, Courier & Truck Logistics Since 2010",
    description:
      "Miami-headquartered luggage logistics, hotel and cruise-port transfers, courier, last-mile delivery, luggage storage and box-truck logistics across Florida's key travel markets since 2010. Request a quote.",
    path: "/",
  }),
  title: { absolute: "Express Bags, Inc. | Florida Luggage Logistics, Courier & Truck Logistics Since 2010" },
  alternates: { canonical: "/", languages: { "en-US": "/", "es-US": "/es" } },
};

/**
 * Home: cinematic hero → credibility facts → services → "Follow a bag" chain of custody →
 * route planner → care standard → markets → why us → proven history → audiences → FAQ → CTA.
 */
export default function HomePage() {
  return (
    <>
      <HomeHero />
      <ServicesShowcase />
      <InAction />
      <FollowABag />
      <RoutePlanner />
      <CareStandard />
      <MarketsGrid />
      <WhyUs />
      <Credibility />
      <AudienceSplit />
      <FaqTeaser />
      <SocialFeeds />
      <CtaBand title="Planning a hotel, cruise or group movement?" />
    </>
  );
}
