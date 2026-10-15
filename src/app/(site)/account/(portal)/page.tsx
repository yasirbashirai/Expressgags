import { Suspense } from "react";
import { AccountDashboard } from "@/components/portal/dashboard";

export const metadata = { title: "Overview" };

export default function Page() {
  return (
    <Suspense>
      <AccountDashboard />
    </Suspense>
  );
}
