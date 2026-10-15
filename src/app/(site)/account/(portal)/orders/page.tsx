import { Suspense } from "react";
import { OrdersList } from "@/components/portal/orders";

export const metadata = { title: "Orders & tracking" };

export default function Page() {
  return (
    <Suspense>
      <OrdersList />
    </Suspense>
  );
}
