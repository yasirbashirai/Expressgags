import { AdminShell } from "@/components/admin/admin-shell";
import { ShipmentsList } from "@/components/carriers/shipments-list";

export const metadata = { title: "Carrier shipments", robots: { index: false, follow: false } };

export default function ShipmentsPage() {
  return (
    <AdminShell>
      <ShipmentsList />
    </AdminShell>
  );
}
