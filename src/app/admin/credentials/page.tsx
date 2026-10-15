import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { CredentialsRegister } from "@/components/resources/credentials-register";

export const metadata = { title: "Credentials" };

export default function CredentialsPage() {
  return (
    <AdminShell>
      <Suspense>
        <CredentialsRegister />
      </Suspense>
    </AdminShell>
  );
}
