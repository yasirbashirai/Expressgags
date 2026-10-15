import { AdminShell } from "@/components/admin/admin-shell";
import { FleetList } from "@/components/resources/fleet-list";

export const metadata = { title: "Fleet" };

export default function FleetPage() {
  return (
    <AdminShell>
      <FleetList />
    </AdminShell>
  );
}
