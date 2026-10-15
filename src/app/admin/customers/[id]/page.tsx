import { AdminShell } from "@/components/admin/admin-shell";
import { CustomerAdminDetail } from "@/components/portal/admin/customers-admin";

export const metadata = { title: "Customer" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <CustomerAdminDetail id={id} />
    </AdminShell>
  );
}
