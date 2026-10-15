import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { CustomersAdmin } from "@/components/portal/admin/customers-admin";

export const metadata = { title: "Customers & accounts" };

export default function Page() {
  return (
    <AdminShell>
      <Suspense>
        <CustomersAdmin />
      </Suspense>
    </AdminShell>
  );
}
