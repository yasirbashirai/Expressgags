import type { Metadata } from "next";
import { DriverAppShell } from "@/components/driver/app-shell";
import { JobList } from "@/components/driver/job-list";

export const metadata: Metadata = { title: "My jobs" };

export default function DriverHomePage() {
  return (
    <DriverAppShell>
      <JobList />
    </DriverAppShell>
  );
}
