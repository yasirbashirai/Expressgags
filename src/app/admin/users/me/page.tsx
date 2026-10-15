import { AdminShell } from "@/components/admin/admin-shell";
import { MySecurity } from "@/components/resources/my-security";

export const metadata = { title: "My security" };

export default function MySecurityPage() {
  return (
    <AdminShell>
      <MySecurity />
    </AdminShell>
  );
}
