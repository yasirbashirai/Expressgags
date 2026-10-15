import { AdminShell } from "@/components/admin/admin-shell";
import { Dashboard } from "@/components/admin/dashboard";

export const metadata = { title: "Dashboard" };

export default function AdminDashboardPage() {
  return (
    <AdminShell>
      <Dashboard />
    </AdminShell>
  );
}
