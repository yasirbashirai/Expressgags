import type { Metadata } from "next";
import { DriverAppShell } from "@/components/driver/app-shell";
import { JobFlow } from "@/components/driver/job-flow";

export const metadata: Metadata = { title: "Job" };

export default async function DriverJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <DriverAppShell>
      <JobFlow orderId={id} />
    </DriverAppShell>
  );
}
