import { AdminShell } from "@/components/admin/admin-shell";
import { ContentAdmin } from "@/components/cms/admin/content-admin";

export const metadata = { title: "Website content" };

export default function ContentPage() {
  return (
    <AdminShell>
      <ContentAdmin />
    </AdminShell>
  );
}
