import type { Metadata } from "next";
import Image from "next/image";
import { Camera, Hotel, Plane, Ship, Trophy, Truck, Warehouse, PackageCheck } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { PhotoSlot } from "@/components/ui/photo-slot";
import { pageMeta } from "@/lib/seo";
import { loadGallery, mediaUrl } from "@/components/cms/content-api";

export const revalidate = 300; // ISR: 5 minutes (also revalidated on publish)

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

/** Published, permission-cleared original photos from the CMS; designed placeholders until the first ones are approved. */
export default async function GalleryPage() {
  const items = await loadGallery();
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
        {items.length === 0 ? (
          <>
            <div className="mb-8 flex items-center gap-3 rounded-2xl bg-navy-50 p-5 text-sm text-navy">
              <Camera className="h-5 w-5 shrink-0" aria-hidden />
              <p>Original photos coming soon. Images of clients, guests, venues or team members are published only with permission.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {SLOTS.map((s) => (
                <PhotoSlot key={s.label} label={s.label} Icon={s.Icon} tone={s.tone} className={s.wide ? "lg:col-span-2 lg:aspect-auto lg:h-full" : ""} />
              ))}
            </div>
          </>
        ) : (
          <ul className="grid grid-flow-dense auto-rows-[16rem] gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it, i) => (
              <li key={it.id} className={`group relative overflow-hidden rounded-[var(--radius-card)] bg-cloud ${i % 5 === 0 ? "sm:col-span-2 sm:row-span-2" : ""}`}>
                <figure className="h-full">
                  <Image
                    src={mediaUrl(it.mediaId)}
                    alt={it.alt}
                    fill
                    sizes={i % 5 === 0 ? "(min-width: 1024px) 66vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"}
                    className="object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                  <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy-950/85 to-transparent p-4 pt-12 text-sm font-medium text-white">{it.caption}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <CtaBand />
    </>
  );
}
