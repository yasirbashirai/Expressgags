import { Suspense } from "react";
import { AuthFrame } from "@/components/portal/auth-forms";
import { VerifyForm } from "@/components/portal/auth-forms";

export const metadata = { title: "Confirm your email" };

export default function Page() {
  return (
    <Suspense>
      <AuthFrame title="Confirm your email"><VerifyForm /></AuthFrame>
    </Suspense>
  );
}
