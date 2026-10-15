import { Suspense } from "react";
import { InvoicesPage } from "@/components/portal/money-pages";

export const metadata = { title: "Invoices & receipts" };

export default function Page() {
  return (
    <Suspense>
      <InvoicesPage />
    </Suspense>
  );
}
