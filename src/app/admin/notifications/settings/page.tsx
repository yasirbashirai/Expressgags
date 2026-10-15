import { AdminShell } from "@/components/admin/admin-shell";
import { NotificationSettingsPanel } from "@/components/notifications/notification-settings";

export const metadata = { title: "Notification settings" };

export default function AdminNotificationSettingsPage() {
  return (
    <AdminShell>
      <NotificationSettingsPanel />
    </AdminShell>
  );
}
