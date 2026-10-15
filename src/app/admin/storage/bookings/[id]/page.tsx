import { AdminShell } from "@/components/admin/admin-shell";
import { StorageBookingDetail } from "@/components/storage/booking-detail";

export const metadata = { title: "Storage booking" };

export default async function StorageBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <StorageBookingDetail id={id} />
    </AdminShell>
  );
}
