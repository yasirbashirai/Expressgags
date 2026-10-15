import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { ClaimsAdmin } from "@/components/protection/claims-admin";

export const metadata = { title: "Protection claims" };

export default function ClaimsPage() {
  return (
    <AdminShell>
      <Suspense>
        <ClaimsAdmin />
      </Suspense>
    </AdminShell>
  );
}
