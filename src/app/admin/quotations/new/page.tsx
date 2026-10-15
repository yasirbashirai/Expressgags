import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { NewQuotation } from "@/components/money/admin/quotation-pages";

export const metadata = { title: "New quotation" };

export default function NewQuotationPage() {
  return (
    <AdminShell>
      <Suspense>
        <NewQuotation />
      </Suspense>
    </AdminShell>
  );
}
