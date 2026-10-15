import { AdminShell } from "@/components/admin/admin-shell";
import { ReportsView } from "@/components/money/admin/reports-view";

export const metadata = { title: "Reports & insights" };

export default function AdminReportsPage() {
  return (
    <AdminShell>
      <ReportsView />
    </AdminShell>
  );
}
