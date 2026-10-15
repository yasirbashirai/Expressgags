import { AdminShell } from "@/components/admin/admin-shell";
import { QuoteDetail } from "@/components/admin/quote-detail";

export const metadata = { title: "Quote request" };

export default async function AdminQuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <QuoteDetail id={id} />
    </AdminShell>
  );
}
