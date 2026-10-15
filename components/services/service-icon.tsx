import { Crown, Hotel, PackageCheck, Plane, Ship, Trophy, Truck, Warehouse, type LucideIcon } from "lucide-react";

/** Maps the lucide icon name stored in site.ts services to its component. */
const ICONS: Record<string, LucideIcon> = { Crown, Hotel, PackageCheck, Plane, Ship, Trophy, Truck, Warehouse };

export function serviceIcon(name: string): LucideIcon {
  return ICONS[name] ?? PackageCheck;
}
