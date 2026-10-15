import { AdminShell } from "@/components/admin/admin-shell";
import { RateShop } from "@/components/carriers/rate-shop";

export const metadata = { title: "Rate shop", robots: { index: false, follow: false } };

export default async function RateShopPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return (
    <AdminShell>
      <RateShop orderId={orderId} />
    </AdminShell>
  );
}
