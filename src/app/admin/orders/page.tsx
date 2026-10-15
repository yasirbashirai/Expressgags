import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { OrdersList } from "@/components/ops/orders-list";

export const metadata = { title: "Orders" };

export default function AdminOrdersPage() {
  return (
    <AdminShell>
      <Suspense>
        <OrdersList />
      </Suspense>
    </AdminShell>
  );
}
