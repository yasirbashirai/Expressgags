import { AdminShell } from "@/components/admin/admin-shell";
import { OrderForm } from "@/components/ops/order-form";

export const metadata = { title: "New order" };

export default function AdminNewOrderPage() {
  return (
    <AdminShell>
      <OrderForm />
    </AdminShell>
  );
}
