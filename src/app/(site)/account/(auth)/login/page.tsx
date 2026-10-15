import { Suspense } from "react";
import { AuthFrame } from "@/components/portal/auth-forms";
import { LoginForm } from "@/components/portal/auth-forms";

export const metadata = { title: "Sign in" };

export default function Page() {
  return (
    <Suspense>
      <AuthFrame title="Sign in" sub="Quotes, bookings, live status, proof of delivery and invoices in one secure place."><LoginForm /></AuthFrame>
    </Suspense>
  );
}
