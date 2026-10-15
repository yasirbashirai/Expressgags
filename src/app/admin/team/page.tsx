import { AdminShell } from "@/components/admin/admin-shell";
import { TeamList } from "@/components/resources/team-list";

export const metadata = { title: "Team" };

export default function TeamPage() {
  return (
    <AdminShell>
      <TeamList />
    </AdminShell>
  );
}
