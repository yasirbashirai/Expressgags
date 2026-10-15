import { Suspense } from "react";
import { AuthFrame } from "@/components/portal/auth-forms";
import { ForgotForm } from "@/components/portal/auth-forms";

export const metadata = { title: "Reset your password" };

export default function Page() {
  return (
    <Suspense>
      <AuthFrame title="Forgot your password?" sub="Enter your account email and we will send a reset link valid for one hour."><ForgotForm /></AuthFrame>
    </Suspense>
  );
}
