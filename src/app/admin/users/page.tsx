import { AdminShell } from "@/components/admin/admin-shell";
import { UsersAdmin } from "@/components/resources/users-admin";

export const metadata = { title: "Users & security" };

export default function UsersPage() {
  return (
    <AdminShell>
      <UsersAdmin />
    </AdminShell>
  );
}
