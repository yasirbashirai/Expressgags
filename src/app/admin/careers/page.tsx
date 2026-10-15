import { AdminShell } from "@/components/admin/admin-shell";
import { InboxList } from "@/components/admin/inbox-list";

export const metadata = { title: "Career applications" };

export default function AdminCareersPage() {
  return (
    <AdminShell>
      <InboxList kind="careers" />
    </AdminShell>
  );
}
