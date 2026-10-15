import type { Metadata } from "next";
import { esCommon } from "@/content/es";
import { EsClosing, EsHero, EsServicesGrid } from "@/components/es/es-blocks";
import { Section } from "@/components/ui/section";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMeta({
    title: "Servicios de equipaje, mensajería y logística en Florida",
    description: "Traslados de equipaje VIP y para grupos, logística hotelera, aeropuertos, puertos de cruceros, almacenamiento de maletas, eventos, mensajería y camiones de caja en Florida.",
    path: "/es/servicios",
  }),
  alternates: { canonical: "/es/servicios", languages: { "en-US": "/services", "es-US": "/es/servicios" } },
  openGraph: { locale: "es_US" },
};

const NO = ["Mudanzas residenciales o locales", "Entrega de comida o catering", "Artículos ilegales, peligrosos, prohibidos o mal embalados", "Artículos prohibidos por aerolíneas, TSA, aeropuertos, puertos o la ley"];

/** Spanish services overview; each card links to its Spanish detail page (/es/servicios/[slug]). */
export default function EsServicesPage() {
  return (
    <>
      <EsHero
        eyebrow="Servicios"
        title="Ocho servicios. Un solo equipo de despacho."
        lead="Desde una maleta VIP hasta un camión de 26 pies con equipo para un evento, cada trabajo se planifica, se cuenta y se documenta con un solo equipo de despacho en los principales mercados de Florida."
        crumbs={[{ name: "Inicio", path: "/es" }, { name: "Servicios", path: "/es/servicios" }]}
      />
      <Section eyebrow="Lo que hacemos" title="Elija el servicio que necesita" intro={esCommon.pricing}>
        <EsServicesGrid />
      </Section>
      <Section tone="sand" eyebrow="Lo que no hacemos" title="Para que todos sepamos qué esperar">
        <ul className="grid gap-3 sm:grid-cols-2">
          {NO.map((x) => (<li key={x} className="flex gap-3 rounded-2xl bg-white p-4"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />{x}</li>))}
        </ul>
        <p className="mt-6 text-sm text-muted">{esCommon.sameDay}</p>
      </Section>
      <EsClosing />
    </>
  );
}
