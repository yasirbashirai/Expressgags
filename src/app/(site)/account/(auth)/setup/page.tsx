import { Suspense } from "react";
import { AuthFrame } from "@/components/portal/auth-forms";
import { SetupForm } from "@/components/portal/auth-forms";

export const metadata = { title: "Set up your login" };

export default function Page() {
  return (
    <Suspense>
      <AuthFrame title="Welcome to Express Bags" sub="Set up your login for your company account."><SetupForm /></AuthFrame>
    </Suspense>
  );
}
