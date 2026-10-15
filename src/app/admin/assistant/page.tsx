import { AdminShell } from "@/components/admin/admin-shell";
import { AssistantAdmin } from "@/components/assistant/assistant-admin";

export const metadata = { title: "AI assistant" };

export default function AdminAssistantPage() {
  return (
    <AdminShell>
      <AssistantAdmin />
    </AdminShell>
  );
}
