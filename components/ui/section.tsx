import type { ReactNode } from "react";

/** Page section with optional eyebrow, heading and intro. tone controls the background. */
export function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  tone = "white",
  className = "",
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  intro?: string;
  children?: ReactNode;
  tone?: "white" | "cloud" | "sand" | "navy";
  className?: string;
}) {
  const bg = { white: "bg-white", cloud: "bg-cloud", sand: "bg-sand", navy: "bg-navy text-white" }[tone];
  return (
    <section id={id} className={`${bg} py-16 md:py-24 ${className}`}>
      <div className="container-eb">
        {(eyebrow || title || intro) && (
          <header className="mb-10 max-w-3xl md:mb-14">
            {eyebrow && <p className={`eyebrow ${tone === "navy" ? "!text-orange-100" : ""}`}>{eyebrow}</p>}
            {title && <h2 className={`mt-3 text-3xl font-bold md:text-4xl ${tone === "navy" ? "text-white" : ""}`}>{title}</h2>}
            {intro && <p className={`mt-4 text-lg leading-relaxed ${tone === "navy" ? "text-white/75" : "text-slate-ink"}`}>{intro}</p>}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}
