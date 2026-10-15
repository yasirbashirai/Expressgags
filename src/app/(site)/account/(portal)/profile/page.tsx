import { Suspense } from "react";
import { ProfilePage } from "@/components/portal/account-pages";

export const metadata = { title: "Profile & security" };

export default function Page() {
  return (
    <Suspense>
      <ProfilePage />
    </Suspense>
  );
}
