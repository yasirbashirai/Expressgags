import { Suspense } from "react";
import { ConciergeDesk } from "@/components/portal/concierge";

export const metadata = { title: "Concierge desk" };

export default function Page() {
  return (
    <Suspense>
      <ConciergeDesk />
    </Suspense>
  );
}
