import { Suspense } from "react";
import { CompanyPage } from "@/components/portal/account-pages";

export const metadata = { title: "Company account" };

export default function Page() {
  return (
    <Suspense>
      <CompanyPage />
    </Suspense>
  );
}
