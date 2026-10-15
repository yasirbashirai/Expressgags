import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentResult } from "@/components/money/payment-result";

export const metadata: Metadata = { title: "Payment status", description: "Check the status of your Express Bags payment.", robots: { index: false, follow: false } };

export default function PaymentStatusPage() {
  return (
    <Suspense>
      <PaymentResult />
    </Suspense>
  );
}
