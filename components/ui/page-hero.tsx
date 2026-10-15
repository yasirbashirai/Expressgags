import Link from "next/link";
import type { ReactNode } from "react";
import { Breadcrumbs } from "./breadcrumbs";

/** Standard inner-page hero: navy band, breadcrumbs, eyebrow, H1, lead text and CTAs. */
export function PageHero({
  eyebrow,
  title,
  lead,
  crumbs,
  children,
  primaryCta = { label: "Request a Quote", href: "/request-a-quote" },
  secondaryCta,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  crumbs: { name: string; path: string }[];
  children?: ReactNode;
  primaryCta?: { label: string; href: string } | null;
  secondaryCta?: { label: string; href: string };
}) {
  return (
    <section className="relative overflow-hidden bg-navy text-white">
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full border-[3px] border-orange/60" />
      <div aria-hidden className="pointer-events-none absolute -right-10 top-10 h-[22rem] w-[22rem] rounded-full border border-white/10" />
      <div className="container-eb relative py-14 md:py-20">
        <Breadcrumbs items={crumbs} light />
        {eyebrow && <p className="eyebrow mt-8 !text-orange-100">{eyebrow}</p>}
        <h1 className="mt-4 max-w-4xl text-4xl font-extrabold leading-[1.05] text-white md:text-6xl">{title}</h1>
        {lead && <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/80">{lead}</p>}
        {(primaryCta || secondaryCta) && (
          <div className="mt-8 flex flex-wrap gap-3">
            {primaryCta && <Link href={primaryCta.href} className="btn-primary">{primaryCta.label}</Link>}
            {secondaryCta && <Link href={secondaryCta.href} className="btn-ghost-light">{secondaryCta.label}</Link>}
          </div>
        )}
        {children}
      </div>
      <div className="flight-line opacity-70" aria-hidden />
    </section>
  );
}
