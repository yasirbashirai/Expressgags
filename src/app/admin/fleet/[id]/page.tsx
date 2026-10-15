import { AdminShell } from "@/components/admin/admin-shell";
import { VehicleDetail } from "@/components/resources/vehicle-detail";

export const metadata = { title: "Vehicle" };

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <VehicleDetail id={id} />
    </AdminShell>
  );
}
