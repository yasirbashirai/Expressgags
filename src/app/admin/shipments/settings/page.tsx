import { AdminShell } from "@/components/admin/admin-shell";
import { CarrierSettingsForm } from "@/components/carriers/carrier-settings";

export const metadata = { title: "Carrier settings", robots: { index: false, follow: false } };

export default function CarrierSettingsPage() {
  return (
    <AdminShell>
      <CarrierSettingsForm />
    </AdminShell>
  );
}
