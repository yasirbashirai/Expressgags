import { Suspense } from "react";
import { AddressesPage } from "@/components/portal/locations-docs";

export const metadata = { title: "Saved locations" };

export default function Page() {
  return (
    <Suspense>
      <AddressesPage />
    </Suspense>
  );
}
