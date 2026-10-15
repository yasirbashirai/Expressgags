import type { Metadata } from "next";
import { InvoiceView } from "@/components/money/invoice-view";

/** Customer invoice link. Private: never indexed. */
export const metadata: Metadata = { title: "Your invoice", description: "View, download and pay your Express Bags invoice.", robots: { index: false, follow: false } };

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InvoiceView token={token} />;
}
