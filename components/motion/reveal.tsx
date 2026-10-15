"use client";

/**
 * Scroll reveal without layout shift: content is always in the DOM at its final size; only
 * opacity/transform animate (GPU-friendly). Respects prefers-reduced-motion (shows instantly).
 * No animation library needed, so static pages stay light.
 */
import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  className = "",
  from = "up",
}: {
  children: ReactNode;
  as?: ElementType;
  delay?: number;
  className?: string;
  from?: "up" | "left" | "right" | "scale";
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const hidden = { up: "translate-y-6 opacity-0", left: "-translate-x-6 opacity-0", right: "translate-x-6 opacity-0", scale: "scale-[0.97] opacity-0" }[from];
  return (
    <Tag
      ref={ref}
      data-reveal={shown ? "in" : "out"}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={`transition-[opacity,transform] duration-700 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none ${shown ? "translate-x-0 translate-y-0 scale-100 opacity-100" : hidden} ${className}`}
    >
      {children}
    </Tag>
  );
}
