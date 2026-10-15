import { Suspense } from "react";
import { AuthFrame } from "@/components/portal/auth-forms";
import { RegisterForm } from "@/components/portal/auth-forms";

export const metadata = { title: "Create your account" };

export default function Page() {
  return (
    <Suspense>
      <AuthFrame title="Create your account" sub="Already sent us a request? Use the same email and your history appears once you confirm it."><RegisterForm /></AuthFrame>
    </Suspense>
  );
}
