import { Suspense } from "react";
import { AuthFrame } from "@/components/portal/auth-forms";
import { ResetForm } from "@/components/portal/auth-forms";

export const metadata = { title: "Choose a new password" };

export default function Page() {
  return (
    <Suspense>
      <AuthFrame title="Choose a new password"><ResetForm /></AuthFrame>
    </Suspense>
  );
}
