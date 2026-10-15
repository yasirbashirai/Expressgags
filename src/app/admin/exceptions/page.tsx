import { AdminShell } from "@/components/admin/admin-shell";
import { ExceptionsInbox } from "@/components/ops/exceptions-inbox";

export const metadata = { title: "Exceptions" };

export default function AdminExceptionsPage() {
  return (
    <AdminShell>
      <ExceptionsInbox />
    </AdminShell>
  );
}
