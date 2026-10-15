import { AdminShell } from "@/components/admin/admin-shell";
import { ClaimDetail } from "@/components/protection/claim-detail";

export const metadata = { title: "Claim" };

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <ClaimDetail id={id} />
    </AdminShell>
  );
}
