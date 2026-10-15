/** Colored order-status chip, readable in bright sunlight (solid fills, bold text). */
const TONE: Record<string, string> = {
  CONFIRMED: "bg-cloud text-navy ring-1 ring-line",
  DRIVER_ASSIGNED: "bg-navy-100 text-navy",
  EN_ROUTE: "bg-orange text-white",
  PICKED_UP: "bg-navy text-white",
  AT_FACILITY: "bg-navy-700 text-white",
  TRANSFERRED_TO_CARRIER: "bg-navy-700 text-white",
  IN_TRANSIT: "bg-navy text-white",
  OUT_FOR_DELIVERY: "bg-orange text-white",
  DELIVERED: "bg-emerald-700 text-white",
  CANCELLED: "bg-rose-700 text-white",
};

export function StatusChip({ status, label }: { status: string; label: string }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-bold ${TONE[status] ?? "bg-cloud text-navy"}`}>{label}</span>;
}
