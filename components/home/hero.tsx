import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Phone, ShieldCheck } from "lucide-react";
import { airports, company, contact, markets, ports } from "@/content/site";
import { sitePhotos } from "@/components/ui/site-photos";

/**
 * Home hero: full-bleed brand photo (Express Bags truck on the Miami waterfront at sunrise) with the
 * headline on the darker left side. Image is preloaded (priority) for LCP; text sits over a navy gradient
 * so it stays readable on every screen size. The animated route map lives on /service-areas.
 */
export function HomeHero() {
  const photo = sitePhotos.sunrise;
  return (
    <section className="relative isolate overflow-hidden bg-navy-950 text-white">
      <div aria-hidden className="absolute inset-0 -z-10">
        <Image
          src={photo.src}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[88%_50%] anim-hero-zoom md:object-[75%_50%] lg:object-[70%_50%]"
        />
        {/* Readability: dark navy on the text side, the truck stays bright on the right */}
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950/95 via-navy-950/70 to-transparent lg:via-navy-950/55" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-navy-950/80 to-transparent" />
      </div>

      <div className="container-eb flex min-h-[640px] items-center pb-16 pt-14 md:min-h-[720px] md:pb-24 md:pt-20 lg:min-h-[780px]">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-navy-950/40 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-orange-100 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-orange" /> Miami headquartered · since {company.founded}
          </p>
          <h1 className="mt-6 text-[2.75rem] font-extrabold leading-[0.98] tracking-tight text-white sm:text-6xl xl:text-[5.25rem]">
            Handled with Care.
            <span className="mt-1 block bg-gradient-to-r from-orange to-[#ff9a4d] bg-clip-text text-transparent">Delivered with Confidence.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/85">
            Florida luggage logistics, hospitality transfers, courier, last-mile and box-truck logistics, connecting Miami with
            the state&apos;s key travel markets. {company.promise}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/request-a-quote" className="btn-primary !px-7 !py-3.5 text-base">
              Request a Quote <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a href={contact.phoneHref} className="btn-ghost-light !py-3.5 backdrop-blur">
              <Phone className="h-4 w-4" aria-hidden /> {contact.phoneDisplay}
            </a>
          </div>
          <p className="mt-6 flex items-center gap-2 text-sm text-white/75">
            <ShieldCheck className="h-4 w-4 text-orange" aria-hidden /> Every route, window and vehicle confirmed by dispatch before we commit.
          </p>
          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-3 border-t border-white/15 pt-6">
            {[
              [String(markets.length), "Florida markets"],
              [String(airports.length), "Airports"],
              [String(ports.length), "Cruise ports"],
            ].map(([n, l]) => (
              <div key={l} className="flex flex-col-reverse">
                <dt className="text-xs uppercase tracking-[0.14em] text-white/65">{l}</dt>
                <dd className="font-display text-3xl font-extrabold text-white">{n}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <p className="sr-only">{photo.alt}</p>
      <div className="flight-line opacity-80" aria-hidden />
    </section>
  );
}
