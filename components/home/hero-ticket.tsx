"use client";

/**
 * Floating "example job ticket" over the hero map. A gentle pointer parallax (transform only)
 * on devices with fine pointers; disabled for reduced motion and touch. Purely illustrative.
 */
import { useEffect, useRef } from "react";
import { CheckCircle2, Plane } from "lucide-react";
import { QrGlyph } from "@/components/ui/illustrations";

const STEPS = ["Manifest and bag count confirmed", "Scanned at pickup, condition noted", "Re-counted at handoff", "Proof of delivery recorded"];

export function HeroTicket() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        el.style.transform = `translate3d(${x * -10}px, ${y * -8}px, 0) rotate(${x * -1.2}deg)`;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="pointer-events-none relative mx-auto -mt-6 w-[min(92%,330px)] lg:absolute lg:left-0 lg:top-0 lg:mx-0 lg:mt-0 lg:w-[268px]">
      <div ref={ref} className="transition-transform duration-300 ease-out will-change-transform">
        <div className="anim-float">
          <div className="glass-navy pointer-events-auto rounded-[1.5rem] p-5 text-white">
            <div className="flex items-center justify-between gap-3">
              <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-100">Example ticket</p>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> In progress
              </span>
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-white/55">Pickup</p>
                <p className="font-display text-sm font-bold leading-tight">Hotel, Miami Beach</p>
              </div>
              <Plane className="h-4 w-4 rotate-45 text-orange" aria-hidden />
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-white/55">Delivery</p>
                <p className="font-display text-sm font-bold leading-tight">PortMiami terminal</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4 rounded-2xl bg-navy-950/50 p-3">
              <div className="rounded-lg bg-white p-1.5">
                <svg viewBox="0 0 36 36" className="h-11 w-11" aria-hidden>
                  <QrGlyph size={36} />
                </svg>
              </div>
              <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <dt className="text-white/55">Pieces</dt><dd className="text-right font-semibold">48 of 48</dd>
                <dt className="text-white/55">Vehicle</dt><dd className="text-right font-semibold">20 ft box</dd>
                <dt className="text-white/55">Window</dt><dd className="text-right font-semibold">10:30 AM</dd>
              </dl>
            </div>
            <ol className="mt-4 space-y-2 text-xs">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-2 anim-fade-up" style={{ animationDelay: `${1200 + i * 250}ms` }}>
                  <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${i < 3 ? "text-orange" : "text-white/35"}`} aria-hidden />
                  <span className={i < 3 ? "text-white/90" : "text-white/50"}>{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[10px] text-white/40">Illustration of our handoff process. Details vary by job.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
