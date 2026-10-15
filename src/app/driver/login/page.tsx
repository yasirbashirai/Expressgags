import type { Metadata } from "next";
import { Suspense } from "react";
import { DriverLoginForm } from "@/components/driver/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function DriverLoginPage() {
  return (
    <Suspense>
      <DriverLoginForm />
    </Suspense>
  );
}
