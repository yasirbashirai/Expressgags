import type { LucideIcon } from "lucide-react";

/**
 * Branded image placeholder. Carlos's rule: no stock photos presented as real operations.
 * These slots are clearly marked until approved original photos are supplied.
 */
export function PhotoSlot({ label, Icon, className = "", tone = "navy" }: { label: string; Icon?: LucideIcon; className?: string; tone?: "navy" | "orange" | "cloud" }) {
  const styles = {
    navy: "bg-gradient-to-br from-navy via-navy-700 to-navy-950 text-white",
    orange: "bg-gradient-to-br from-orange via-orange-600 to-orange-700 text-white",
    cloud: "bg-gradient-to-br from-navy-50 via-cloud to-navy-100 text-navy",
  }[tone];
  return (
    <div role="img" aria-label={`${label} (photo coming soon)`} className={`relative isolate flex aspect-[4/3] items-end overflow-hidden rounded-[var(--radius-card)] p-5 ${styles} ${className}`}>
      <div aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full border-[14px] border-current opacity-15" />
      <div aria-hidden className="absolute -bottom-24 -left-10 h-64 w-64 rotate-12 rounded-full border border-current opacity-20" />
      {Icon && <Icon aria-hidden className="absolute right-6 top-6 h-10 w-10 opacity-80" strokeWidth={1.4} />}
      <div className="relative">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs opacity-70">Original Express Bags photo coming soon</p>
      </div>
    </div>
  );
}
