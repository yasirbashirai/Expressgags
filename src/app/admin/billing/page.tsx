import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { BillingConsole } from "@/components/money/admin/billing-console";

export const metadata = { title: "Invoices & payments" };

export default function AdminBillingPage() {
  return (
    <AdminShell>
      <Suspense>
        <BillingConsole />
      </Suspense>
    </AdminShell>
  );
}
