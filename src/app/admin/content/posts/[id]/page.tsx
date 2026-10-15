import { AdminShell } from "@/components/admin/admin-shell";
import { PostEditor } from "@/components/cms/admin/post-editor";

export const metadata = { title: "Edit post" };

export default async function PostEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <PostEditor id={id} />
    </AdminShell>
  );
}
