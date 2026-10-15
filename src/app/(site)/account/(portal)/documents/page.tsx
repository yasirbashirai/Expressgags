import { Suspense } from "react";
import { DocumentsPage } from "@/components/portal/locations-docs";

export const metadata = { title: "Documents" };

export default function Page() {
  return (
    <Suspense>
      <DocumentsPage />
    </Suspense>
  );
}
