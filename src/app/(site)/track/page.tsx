import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { TrackLookup } from "@/components/ops/track-lookup";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Track Your Delivery | Express Bags, Inc.",
  description: "Track an Express Bags delivery with your Express Bags reference and a detail from your booking: status, updates and proof of delivery.",
  path: "/track",
});

export default function TrackPage() {
  return (
    <>
      <PageHero
        eyebrow="Tracking"
        title="Track your delivery."
        lead="See where your bags are, from order confirmed to delivered, with proof of delivery when the job is complete."
        crumbs={[{ name: "Home", path: "/" }, { name: "Track Your Delivery", path: "/track" }]}
        primaryCta={null}
      />
      <Section>
        <Suspense>
          <TrackLookup />
        </Suspense>
      </Section>
    </>
  );
}
