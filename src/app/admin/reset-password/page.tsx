import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/resources/reset-password-form";

export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
