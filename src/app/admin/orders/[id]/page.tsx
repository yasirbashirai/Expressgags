import { AdminShell } from "@/components/admin/admin-shell";
import { OrderDetail } from "@/components/ops/order-detail";

export const metadata = { title: "Order" };

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <OrderDetail id={id} />
    </AdminShell>
  );
}
