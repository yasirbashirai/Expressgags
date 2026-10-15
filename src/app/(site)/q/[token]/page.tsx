import type { Metadata } from "next";
import { QuotationView } from "@/components/money/quotation-view";

/** Customer quotation link. Private: never indexed. */
export const metadata: Metadata = { title: "Your quotation", description: "Review, accept and pay the deposit for your Express Bags quotation.", robots: { index: false, follow: false } };

export default async function QuotationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <QuotationView token={token} />;
}
