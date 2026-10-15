import type { Metadata } from "next";
import { QuotePage } from "@/components/quote/quote-page";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMeta({
    title: "Request a Quote",
    description:
      "Request a quote for luggage transfers, airport and cruise-port luggage, storage, group and event logistics, courier, last-mile and box-truck service across Florida. Written quotation, no payment needed.",
    path: "/request-a-quote",
  }),
  alternates: { canonical: "/request-a-quote", languages: { "en-US": "/request-a-quote", "es-US": "/es/solicitar-cotizacion" } },
};

export default function RequestAQuotePage() {
  return <QuotePage lang="en" />;
}
