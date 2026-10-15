import { AdminShell } from "@/components/admin/admin-shell";
import { EditQuotation } from "@/components/money/admin/quotation-pages";

export const metadata = { title: "Quotation" };

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <EditQuotation id={id} />
    </AdminShell>
  );
}
