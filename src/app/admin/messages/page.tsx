import { AdminShell } from "@/components/admin/admin-shell";
import { InboxList } from "@/components/admin/inbox-list";

export const metadata = { title: "Messages" };

export default function AdminMessagesPage() {
  return (
    <AdminShell>
      <InboxList kind="messages" />
    </AdminShell>
  );
}
