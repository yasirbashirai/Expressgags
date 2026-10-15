import type { Metadata } from "next";
import { Camera, Hotel, Plane, Ship, Trophy, Truck, Warehouse, PackageCheck } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { PhotoSlot } from "@/components/ui/photo-slot";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Gallery | Express Bags Operations",
  description: "Original photos and videos of Express Bags operations across Florida hotels, airports, cruise ports and events. New original images are being added.",
  path: "/gallery",
});

const SLOTS = [
  { label: "Fleet at a hotel entrance", Icon: Hotel, tone: "navy" as const, wide: true },
  { label: "Cruise terminal handoff", Icon: Ship, tone: "orange" as const },
  { label: "Airport arrivals coordination", Icon: Plane, tone: "cloud" as const },
  { label: "Careful loading and tagging", Icon: PackageCheck, tone: "cloud" as const },
  { label: "Event and team gear", Icon: Trophy, tone: "navy" as const },
  { label: "Box truck on route", Icon: Truck, tone: "orange" as const, wide: true },
  { label: "Short-term storage", Icon: Warehouse, tone: "cloud" as const },
];

export default function GalleryPage() {
  return (
    <>
      <PageHero
        eyebrow="Gallery"
        title="Real operations, real people, real handoffs."
        lead="We only publish original Express Bags photos and videos, never stock images presented as our work. Our gallery is being filled with approved images from the field."
        crumbs={[{ name: "Home", path: "/" }, { name: "Gallery", path: "/gallery" }]}
        primaryCta={null}
      />
      <Section>
        <div className="mb-8 flex items-center gap-3 rounded-2xl bg-navy-50 p-5 text-sm text-navy">
          <Camera className="h-5 w-5 shrink-0" aria-hidden />
          <p>Original photos coming soon. Images of clients, guests, venues or team members are published only with permission.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SLOTS.map((s) => (
            <PhotoSlot key={s.label} label={s.label} Icon={s.Icon} tone={s.tone} className={s.wide ? "lg:col-span-2 lg:aspect-auto lg:h-full" : ""} />
          ))}
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
