import { AdminShell } from "@/components/admin/admin-shell";
import { SettingsPanel } from "@/components/admin/settings-panel";

export const metadata = { title: "Settings & pricing" };

export default function AdminSettingsPage() {
  return (
    <AdminShell>
      <SettingsPanel />
    </AdminShell>
  );
}
