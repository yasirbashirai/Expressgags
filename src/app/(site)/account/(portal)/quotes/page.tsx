import { Suspense } from "react";
import { QuotesPage } from "@/components/portal/money-pages";

export const metadata = { title: "Quotes" };

export default function Page() {
  return (
    <Suspense>
      <QuotesPage />
    </Suspense>
  );
}
