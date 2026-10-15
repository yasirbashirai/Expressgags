import Link from "next/link";
import { ArrowRight, CheckCircle2, Phone, Plane } from "lucide-react";
import { company, contact } from "@/content/site";

/**
 * Home hero: navy stage with the logo's orbit motif, the tagline, primary CTA and an
 * illustrative "job ticket" card that shows how an Express Bags handoff is documented.
 */
export function HomeHero() {
  return (
    <section className="relative isolate overflow-hidden bg-navy text-white">
      {/* Orbit motif */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-[18rem] -top-[10rem] h-[46rem] w-[46rem] rotate-[-28deg] rounded-[50%] border-[3px] border-orange/60 [transform:rotate(-28deg)_scaleY(0.55)]" />
        <div className="absolute -right-[14rem] -top-[6rem] h-[40rem] w-[40rem] rounded-[50%] border-[22px] border-white/[0.05] [transform:rotate(32deg)_scaleY(0.5)]" />
        <div className="absolute bottom-0 left-0 h-64 w-full bg-gradient-to-t from-navy-950/80 to-transparent" />
      </div>

      <div className="container-eb grid items-center gap-12 pb-20 pt-14 md:pb-28 md:pt-20 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="eyebrow !text-orange-100">Miami headquartered · Florida logistics since {company.founded}</p>
          <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.02] text-white sm:text-6xl lg:text-7xl">
            Handled with Care.
            <span className="block text-orange">Delivered with Confidence.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/80">
            Luggage logistics, hospitality transfers, professional courier, last-mile delivery, luggage storage and box-truck
            logistics, connecting Miami with Florida&apos;s key travel markets. {company.promise}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/request-a-quote" className="btn-primary !px-7 !py-3.5 text-base">
              Request a Quote <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a href={contact.phoneHref} className="btn-ghost-light !py-3.5">
              <Phone className="h-4 w-4" aria-hidden /> {contact.phoneDisplay}
            </a>
          </div>
          <p className="mt-5 text-sm text-white/60">
            Every route, time window and vehicle is confirmed by dispatch before we commit.
          </p>
        </div>

        {/* Illustrative job ticket */}
        <div className="relative lg:col-span-5">
          <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-orange/25 via-transparent to-white/5 blur-2xl" />
          <div className="rounded-[1.75rem] border border-white/15 bg-white/[0.07] p-6 shadow-[0_40px_80px_-40px_rgb(0_0_0/0.8)] backdrop-blur-md md:p-7">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-100">Example job ticket</p>
              <span className="rounded-full bg-orange/90 px-3 py-1 text-[11px] font-semibold">Group transfer</span>
            </div>
            <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div>
                <p className="text-xs text-white/60">Pickup</p>
                <p className="font-display text-lg font-bold leading-tight">Hotel, Miami Beach</p>
              </div>
              <div className="flex items-center gap-1 text-orange" aria-hidden>
                <span className="h-px w-6 border-t-2 border-dashed border-orange" />
                <Plane className="h-4 w-4 rotate-45" />
              </div>
              <div className="text-right">
                <p className="text-xs text-white/60">Delivery</p>
                <p className="font-display text-lg font-bold leading-tight">PortMiami terminal</p>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-3 gap-3 rounded-2xl bg-navy-950/40 p-4 text-center">
              <div><dt className="text-[11px] uppercase tracking-wide text-white/55">Pieces</dt><dd className="font-display text-2xl font-bold">48</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-white/55">Vehicle</dt><dd className="font-display text-2xl font-bold">20 ft</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wide text-white/55">Window</dt><dd className="font-display text-2xl font-bold">10:30</dd></div>
            </dl>
            <ol className="mt-6 space-y-3 text-sm">
              {["Manifest and bag count confirmed", "Loaded and secured, condition noted", "Re-counted at handoff, released to authorized contact", "Proof of delivery recorded and confirmed"].map((s) => (
                <li key={s} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange" aria-hidden />
                  <span className="text-white/85">{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-5 text-[11px] text-white/45">Illustration of our handoff process. Details vary by job.</p>
          </div>
        </div>
      </div>
      <div className="flight-line opacity-80" aria-hidden />
    </section>
  );
}
