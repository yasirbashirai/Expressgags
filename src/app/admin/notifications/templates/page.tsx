import { AdminShell } from "@/components/admin/admin-shell";
import { TemplatePreview } from "@/components/notifications/template-preview";

export const metadata = { title: "Message templates" };

export default function AdminTemplatesPage() {
  return (
    <AdminShell>
      <TemplatePreview />
    </AdminShell>
  );
}
