import {
  Crown,
  Hotel,
  Plane,
  Ship,
  Warehouse,
  Trophy,
  PackageCheck,
  Truck,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

/** Maps the icon names stored in src/content/site.ts to lucide components. */
const ICONS: Record<string, LucideIcon> = { Crown, Hotel, Plane, Ship, Warehouse, Trophy, PackageCheck, Truck };

export function serviceIcon(name: string): LucideIcon {
  return ICONS[name] ?? Briefcase;
}
