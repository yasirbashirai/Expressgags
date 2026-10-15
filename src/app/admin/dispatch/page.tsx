import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { DispatchBoard } from "@/components/ops/dispatch-board";

export const metadata = { title: "Dispatch board" };

export default function AdminDispatchPage() {
  return (
    <AdminShell>
      <Suspense>
        <DispatchBoard />
      </Suspense>
    </AdminShell>
  );
}
