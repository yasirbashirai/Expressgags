import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { ReferenceAdmin } from "@/components/reference/reference-admin";

export const metadata = { title: "Markets & zones" };

export default function ReferencePage() {
  return (
    <AdminShell>
      <Suspense>
        <ReferenceAdmin />
      </Suspense>
    </AdminShell>
  );
}
