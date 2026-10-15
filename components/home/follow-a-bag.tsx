"use client";

/**
 * "Follow a bag": scrollytelling of the Express Bags chain of custody. On large screens the visual
 * stays pinned while the eight steps scroll past and the active step drives the tag, status pills
 * and timeline. On phones every step is a self-contained card. Illustrative example only.
 * Uses IntersectionObserver (no animation library); transitions are transform/opacity only.
 */
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ClipboardCheck, FileSignature, MapPin, PackageCheck, ScanLine, Truck, UserCheck, Warehouse } from "lucide-react";
import { QrGlyph } from "@/components/ui/illustrations";

const STEPS = [
  { key: "request", Icon: ClipboardCheck, title: "Request", status: "Quote request received", text: "Route, date, time window and bag count arrive through the website, phone or your account. A complete request produces the fastest accurate quote." },
  { key: "quote", Icon: FileSignature, title: "Written quotation", status: "Quotation sent", text: "Dispatch prices the job for route, vehicle, labor, timing and handling, then sends a written quotation you accept online." },
  { key: "book", Icon: CheckCircle2, title: "Booking confirmed", status: "Booking confirmed", text: "Contacts, itinerary and manifest are confirmed. Every bag gets its own ID, printed on a QR tag." },
  { key: "dispatch", Icon: UserCheck, title: "Dispatch", status: "Driver assigned", text: "The right vehicle and team are assigned with one complete job ticket. You see your assigned driver's first name once dispatch confirms." },
  { key: "pickup", Icon: ScanLine, title: "Pickup scan", status: "Picked up · 8 of 8 scanned", text: "Each tag is scanned at pickup, the count is checked against the manifest and condition photos are taken where appropriate." },
  { key: "custody", Icon: Warehouse, title: "Chain of custody", status: "In Express Bags custody", text: "Every move is time-stamped: in the truck, at a processing point, in storage or handed to a carrier for longer routes." },
  { key: "handoff", Icon: Truck, title: "Handoff", status: "Out for delivery", text: "Bags are re-counted at the destination and released only to the authorized receiving party. No delivery promise changes silently." },
  { key: "proof", Icon: PackageCheck, title: "Proof of delivery", status: "Delivered · proof recorded", text: "Recipient name, time, signature or photo are recorded and the completion confirmation reaches you right away." },
] as const;

export function FollowABag() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(Number((visible.target as HTMLElement).dataset.index));
      },
      { rootMargin: "-40% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const scanned = active >= 4 ? 8 : 0;
  return (
    <section className="relative bg-white py-20 md:py-28" aria-labelledby="follow-title">
      <div className="container-eb">
        <header className="max-w-3xl">
          <p className="eyebrow">Follow a bag</p>
          <h2 id="follow-title" className="mt-3 text-3xl font-bold md:text-5xl">From your request to a documented handoff.</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-ink">
            Eight steps, one accountable dispatcher, and a record at every handoff. Scroll to follow an example group of eight bags from a Miami Beach hotel to PortMiami.
          </p>
        </header>

        <div className="mt-14 grid gap-10 lg:grid-cols-12">
          {/* Steps */}
          <ol className="space-y-4 lg:col-span-6 lg:space-y-0">
            {STEPS.map((s, i) => {
              const on = i === active;
              return (
                <li
                  key={s.key}
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  data-index={i}
                  className="lg:flex lg:min-h-[44vh] lg:items-center"
                >
                  <article
                    className={`relative w-full rounded-[1.5rem] border p-6 transition-[background-color,border-color,box-shadow,transform] duration-500 md:p-8 ${
                      on ? "border-orange/40 bg-white shadow-[var(--shadow-lift)] lg:translate-x-2" : "border-line bg-cloud/70"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-colors duration-500 ${on ? "bg-orange-600 text-white" : "bg-white text-navy"}`}>
                        <s.Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">Step {i + 1} of 8</p>
                        <h3 className="text-xl font-bold md:text-2xl">{s.title}</h3>
                      </div>
                    </div>
                    <p className="mt-4 leading-relaxed text-slate-ink">{s.text}</p>
                    {/* Phone: inline status pill instead of the pinned visual */}
                    <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-navy-50 px-3 py-1.5 text-xs font-semibold text-navy lg:hidden">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange" /> {s.status}
                    </p>
                  </article>
                </li>
              );
            })}
          </ol>

          {/* Pinned visual (desktop) */}
          <div className="hidden lg:col-span-6 lg:block">
            <div className="sticky top-28">
              <div className="relative overflow-hidden rounded-[2rem] bg-navy-950 p-8 text-white shadow-[var(--shadow-lift)]">
                <div aria-hidden className="stage-grid absolute inset-0 opacity-50" />
                <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[3px] border-orange/50" />
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">Example · group of 8 bags</p>
                      <p className="mt-2 flex items-center gap-2 font-display text-lg font-bold"><MapPin className="h-4 w-4 text-orange" aria-hidden /> Miami Beach hotel → PortMiami</p>
                    </div>
                    <span aria-live="polite" className="rounded-full bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white">{STEPS[active].status}</span>
                  </div>

                  {/* Tag + scan beam */}
                  <div className="mt-8 grid grid-cols-[auto_1fr] items-center gap-8">
                    <div className="relative">
                      <div className="w-36 rounded-2xl bg-white p-3 text-navy shadow-xl transition-transform duration-700" style={{ transform: `rotate(${active >= 4 ? -2 : 4}deg)` }}>
                        <div className="mx-auto mb-2 h-2 w-2 rounded-full bg-orange" />
                        <svg viewBox="0 0 36 36" className="mx-auto h-24 w-24" aria-hidden><QrGlyph size={36} /></svg>
                        <p className="mt-2 text-center font-mono text-[10px] font-bold">EB-261121-7K3P-01</p>
                        <p className="text-center text-[10px] text-muted">Piece 1 of 8</p>
                      </div>
                      <div
                        aria-hidden
                        className="absolute inset-x-[-10px] top-6 h-0.5 bg-orange shadow-[0_0_16px_4px_rgb(224_96_16/0.6)] transition-opacity duration-500"
                        style={{ opacity: active === 4 ? 1 : 0, animation: active === 4 ? "eb-float 1.2s ease-in-out infinite" : "none" }}
                      />
                    </div>
                    <dl className="grid gap-3 text-sm">
                      <div className="flex justify-between rounded-xl bg-white/5 px-4 py-3"><dt className="text-white/60">Pieces scanned</dt><dd className="font-semibold">{scanned} of 8</dd></div>
                      <div className="flex justify-between rounded-xl bg-white/5 px-4 py-3"><dt className="text-white/60">Custody</dt><dd className="font-semibold">{active < 4 ? "Not yet collected" : active < 6 ? "Express Bags" : active < 7 ? "Released" : "Delivered"}</dd></div>
                      <div className="flex justify-between rounded-xl bg-white/5 px-4 py-3"><dt className="text-white/60">Assigned driver</dt><dd className="font-semibold">{active >= 3 ? "Shown to you" : "Pending"}</dd></div>
                    </dl>
                  </div>

                  {/* Progress pills */}
                  <ol className="mt-8 grid grid-cols-8 gap-1.5" aria-label="Progress">
                    {STEPS.map((s, i) => (
                      <li key={s.key} className="h-1.5 overflow-hidden rounded-full bg-white/15">
                        <span className="block h-full origin-left rounded-full bg-orange transition-transform duration-500" style={{ transform: `scaleX(${i <= active ? 1 : 0})` }} />
                        <span className="sr-only">{s.title}{i <= active ? " complete" : ""}</span>
                      </li>
                    ))}
                  </ol>

                  {/* Timeline */}
                  <ul className="mt-6 space-y-2.5 text-sm">
                    {STEPS.slice(0, active + 1).slice(-4).map((s, i, arr) => (
                      <li key={s.key} className="flex items-center gap-3 anim-fade-up">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${i === arr.length - 1 ? "bg-orange" : "bg-white/40"}`} />
                        <span className={i === arr.length - 1 ? "font-semibold text-white" : "text-white/60"}>{s.status}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-6 text-[11px] text-white/40">Illustrative example. Details, timing and proof methods vary by job and are confirmed by dispatch.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
