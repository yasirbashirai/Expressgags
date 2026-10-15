import { AdminShell } from "@/components/admin/admin-shell";
import { QuotationsList } from "@/components/money/admin/quotations-list";

export const metadata = { title: "Quotations" };

export default function AdminQuotationsPage() {
  return (
    <AdminShell>
      <QuotationsList />
    </AdminShell>
  );
}
