import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { QuotesInbox } from "@/components/admin/quotes-inbox";

export const metadata = { title: "Quote requests" };

export default function AdminQuotesPage() {
  return (
    <AdminShell>
      <Suspense>
        <QuotesInbox />
      </Suspense>
    </AdminShell>
  );
}
