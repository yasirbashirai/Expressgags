import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { sitePhotos, type SitePhoto } from "@/components/ui/site-photos";

/**
 * "Express Bags in action": bento photo grid on the home page using the brand photos.
 * Each tile links to the matching service. Illustrative brand images (see site-photos.ts).
 */
type Tile = { photo: SitePhoto; label: string; title: string; href: string; className: string; sizes: string };

const TILES: Tile[] = [
  { photo: sitePhotos.valet, label: "Hotels & resorts", title: "White-glove handoffs at the front door", href: "/services/hotel-hospitality-logistics", className: "md:col-span-2 aspect-[16/9] md:aspect-auto md:h-[380px]", sizes: "(min-width: 768px) 66vw, 100vw" },
  { photo: sitePhotos.cruise, label: "Cruise ports", title: "Timed to the ship schedule", href: "/services/cruise-port-luggage", className: "md:row-span-2 aspect-[3/4] md:aspect-auto md:h-full", sizes: "(min-width: 768px) 33vw, 100vw" },
  { photo: sitePhotos.qrScan, label: "Chain of custody", title: "Every bag scanned, counted, documented", href: "/services/luggage-storage", className: "aspect-[4/3] md:aspect-auto md:h-[380px]", sizes: "(min-width: 768px) 33vw, 100vw" },
  { photo: sitePhotos.keysBridge, label: "Across Florida", title: "From Miami to the Keys and beyond", href: "/service-areas", className: "aspect-[4/3] md:aspect-auto md:h-[380px]", sizes: "(min-width: 768px) 33vw, 100vw" },
];

export function InAction() {
  return (
    <section aria-labelledby="in-action-title" className="bg-navy-950 py-20 text-white md:py-28">
      <div className="container-eb">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="eyebrow !text-orange-100">Express Bags in action</p>
            <h2 id="in-action-title" className="mt-3 text-3xl font-bold text-white md:text-5xl">Hotels, cruise ports, airports and the open road.</h2>
            <p className="mt-4 text-lg text-white/75">One accountable Florida logistics partner, from a single suitcase to a full program.</p>
          </div>
          <Link href="/request-a-quote" className="btn-primary shrink-0">Request a Quote</Link>
        </div>

        <ul className="mt-12 grid gap-5 md:grid-cols-3 md:grid-rows-[380px_380px]">
          {TILES.map((t) => (
            <li key={t.href} className={`group relative overflow-hidden rounded-[1.75rem] ${t.className}`}>
              <Link href={t.href} className="absolute inset-0 block">
                <Image
                  src={t.photo.src}
                  alt={t.photo.alt}
                  fill
                  sizes={t.sizes}
                  className="object-cover transition duration-700 group-hover:scale-105"
                  style={{ objectPosition: t.photo.position }}
                />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy-950/90 via-navy-950/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-100">{t.label}</p>
                    <p className="mt-1 font-display text-xl font-bold text-white md:text-2xl">{t.title}</p>
                  </div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 backdrop-blur transition group-hover:bg-orange">
                    <ArrowUpRight className="h-5 w-5" aria-hidden />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
