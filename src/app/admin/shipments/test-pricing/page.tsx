import { AdminShell } from "@/components/admin/admin-shell";
import { TestPricing } from "@/components/carriers/test-pricing";

export const metadata = { title: "Test pricing", robots: { index: false, follow: false } };

export default function TestPricingPage() {
  return (
    <AdminShell>
      <TestPricing />
    </AdminShell>
  );
}
