import { AdminShell } from "@/components/admin/admin-shell";
import { CompanyAdminDetail } from "@/components/portal/admin/customers-admin";

export const metadata = { title: "Business account" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <CompanyAdminDetail id={id} />
    </AdminShell>
  );
}
