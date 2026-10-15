import type { Metadata } from "next";
import { Truck, Ruler, ClipboardList, Users } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { PhotoSlot } from "@/components/ui/photo-slot";
import { fleet } from "@/content/site";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Fleet & Capabilities | Cargo Vans to 26-Foot Box Trucks",
  description:
    "Express Bags matches capacity to each job with cargo vans and approximately 15-, 20- and 26-foot box trucks, plus trained drivers, helpers and dispatch.",
  path: "/fleet",
});

const SIZES = [56, 72, 88, 100]; // relative widths for the size comparison graphic

export default function FleetPage() {
  return (
    <>
      <PageHero
        eyebrow="Fleet & capabilities"
        title="Capacity matched to the actual job."
        lead="From a single cargo van for a time-sensitive delivery to multiple box trucks for a group program, every vehicle is assigned to the size, timing and access requirements of an approved job."
        crumbs={[{ name: "Home", path: "/" }, { name: "Fleet & Capabilities", path: "/fleet" }]}
      />

      <Section eyebrow="Vehicle categories" title="Four vehicle classes">
        <ul className="grid gap-5 md:grid-cols-2">
          {fleet.map((v, i) => (
            <li key={v.name} className="card p-7">
              <div className="flex items-center gap-4">
                <Truck className="h-8 w-8 text-orange-700" strokeWidth={1.6} aria-hidden />
                <h3 className="text-xl font-bold">{v.name}</h3>
              </div>
              <div className="mt-6 h-3 rounded-full bg-cloud" aria-hidden>
                <div className="h-3 rounded-full bg-gradient-to-r from-navy to-orange" style={{ width: `${SIZES[i]}%` }} />
              </div>
              <p className="mt-5 text-slate-ink">{v.use}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted">Vehicle sizes are approximate. Availability is confirmed by dispatch for each job.</p>
      </Section>

      <Section tone="cloud" eyebrow="Beyond the vehicle" title="What comes with the truck">
        <ul className="grid gap-5 md:grid-cols-3">
          {[
            { Icon: Users, t: "Trained service teams", d: "Drivers and helpers matched to volume, loading requirements and venue or terminal rules." },
            { Icon: ClipboardList, t: "One complete job ticket", d: "Contacts, addresses, time windows, bag count, access notes and escalation instructions for every job." },
            { Icon: Ruler, t: "Planned for the load", d: "Piece counts, sizes, weights, pallets and oversized items reviewed before a vehicle is assigned." },
          ].map(({ Icon, t, d }) => (
            <li key={t} className="card p-7">
              <Icon className="h-7 w-7 text-navy" aria-hidden />
              <h3 className="mt-4 text-lg font-bold">{t}</h3>
              <p className="mt-2 text-sm text-slate-ink">{d}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="On the road" title="Fleet photography">
        <div className="grid gap-5 md:grid-cols-3">
          <PhotoSlot label="Cargo van" Icon={Truck} />
          <PhotoSlot label="Box truck at a hotel" Icon={Truck} tone="orange" />
          <PhotoSlot label="Loading at a cruise terminal" Icon={Truck} tone="cloud" />
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
