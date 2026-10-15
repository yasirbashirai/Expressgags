import type { Metadata } from "next";
import { Suspense } from "react";
import { MockCheckout } from "@/components/money/mock-checkout";

export const metadata: Metadata = { title: "Secure payment", description: "Express Bags test checkout (development only).", robots: { index: false, follow: false } };

export default function MockCheckoutPage() {
  return (
    <Suspense>
      <MockCheckout />
    </Suspense>
  );
}
