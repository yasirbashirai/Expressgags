import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentResult } from "@/components/money/payment-result";

export const metadata: Metadata = { title: "Payment received", description: "Your Express Bags payment confirmation.", robots: { index: false, follow: false } };

export default function PaymentSuccessPage() {
  return (
    <Suspense>
      <PaymentResult />
    </Suspense>
  );
}
