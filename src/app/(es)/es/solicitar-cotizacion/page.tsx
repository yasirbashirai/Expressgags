import type { Metadata } from "next";
import { QuotePage } from "@/components/quote/quote-page";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMeta({
    title: "Solicitar cotización",
    description:
      "Solicite una cotización para traslados de equipaje, aeropuertos, puertos de cruceros, almacenamiento, grupos y eventos, mensajería, última milla y camiones de caja en Florida. Cotización por escrito, sin pago.",
    path: "/es/solicitar-cotizacion",
  }),
  alternates: { canonical: "/es/solicitar-cotizacion", languages: { "en-US": "/request-a-quote", "es-US": "/es/solicitar-cotizacion" } },
  openGraph: { locale: "es_US" },
};

/** Spanish request-a-quote page: same wizard, Spanish by default (the visitor can switch to English). */
export default function EsRequestAQuotePage() {
  return <QuotePage lang="es" />;
}
