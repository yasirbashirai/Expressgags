import { AdminShell } from "@/components/admin/admin-shell";
import { ShipmentDetail } from "@/components/carriers/shipment-detail";

export const metadata = { title: "Carrier shipment", robots: { index: false, follow: false } };

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <ShipmentDetail id={id} />
    </AdminShell>
  );
}
