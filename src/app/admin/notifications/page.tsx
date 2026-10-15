import { AdminShell } from "@/components/admin/admin-shell";
import { AdminNotifications } from "@/components/notifications/admin-notifications";

export const metadata = { title: "Notifications" };

export default function AdminNotificationsPage() {
  return (
    <AdminShell>
      <AdminNotifications />
    </AdminShell>
  );
}
