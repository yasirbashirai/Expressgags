import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { StorageAdmin } from "@/components/storage/storage-admin";

export const metadata = { title: "Storage" };

export default function StoragePage() {
  return (
    <AdminShell>
      <Suspense>
        <StorageAdmin />
      </Suspense>
    </AdminShell>
  );
}
