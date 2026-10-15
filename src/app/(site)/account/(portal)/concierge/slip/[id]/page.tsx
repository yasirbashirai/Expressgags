import { ConciergeSlip } from "@/components/portal/concierge";

export const metadata = { title: "Guest request slip" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConciergeSlip id={id} />;
}
