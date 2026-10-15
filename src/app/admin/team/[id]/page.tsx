import { AdminShell } from "@/components/admin/admin-shell";
import { TeamDetail } from "@/components/resources/team-detail";

export const metadata = { title: "Team member" };

export default async function TeamMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <TeamDetail id={id} />
    </AdminShell>
  );
}
