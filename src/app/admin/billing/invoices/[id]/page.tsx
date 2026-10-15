import { AdminShell } from "@/components/admin/admin-shell";
import { InvoiceDetail } from "@/components/money/admin/invoice-detail";

export const metadata = { title: "Invoice" };

export default async function AdminInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <InvoiceDetail id={id} />
    </AdminShell>
  );
}
