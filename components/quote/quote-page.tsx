import { Suspense } from "react";
import { Clock, FileText, Phone, ShieldCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { QuoteWizard } from "@/components/quote/quote-wizard";
import { contact } from "@/content/site";
import type { Lang } from "@/content/i18n/quote";

const COPY = {
  en: {
    crumbs: [{ name: "Home", path: "/" }, { name: "Request a Quote", path: "/request-a-quote" }],
    title: "Request a Quote",
    lead: "Tell us what is moving. A few quick steps, built for your phone, and our dispatch team sends a written quotation.",
    asideLabel: "About your quote",
    how: "How quoting works",
    points: [
      "Every job is priced for its route, vehicle, labor, timing and handling, then confirmed in writing.",
      "Same-day and urgent requests are welcome, subject to capacity and dispatch confirmation.",
      "Counts, chain of custody and handoffs are documented from pickup to completion.",
    ],
    talk: "Prefer to talk it through?",
    talkText: "Large groups, events and recurring routes are often easiest by phone.",
    hours: contact.hours.map((h) => `${h.days}: ${h.time}`),
  },
  es: {
    crumbs: [{ name: "Inicio", path: "/es" }, { name: "Solicitar cotización", path: "/es/solicitar-cotizacion" }],
    title: "Solicitar cotización",
    lead: "Cuéntenos qué se mueve. Unos pocos pasos, pensados para su teléfono, y nuestro equipo de despacho le envía una cotización por escrito.",
    asideLabel: "Sobre su cotización",
    how: "Cómo funciona la cotización",
    points: [
      "Cada trabajo se cotiza según la ruta, el vehículo, el personal, el horario y el manejo, y se confirma por escrito.",
      "Aceptamos solicitudes para el mismo día y urgentes, según capacidad y confirmación de despacho.",
      "El conteo, la cadena de custodia y cada entrega quedan documentados desde la recogida hasta el final.",
    ],
    talk: "¿Prefiere hablarlo por teléfono?",
    talkText: "Los grupos grandes, los eventos y las rutas recurrentes suelen coordinarse mejor por teléfono.",
    hours: ["Lunes a viernes: 9:00 AM – 7:00 PM", "Sábado: 9:30 AM – 7:00 PM", "Domingo: 9:30 AM – 4:00 PM"],
  },
} as const;

/** Request-a-quote page body, shared by /request-a-quote (English) and /es/solicitar-cotizacion (Spanish). */
export function QuotePage({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const icons = [FileText, Clock, ShieldCheck];
  return (
    <>
      {/* Compact hero: on a phone the wizard should start within the first screen */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-40 hidden h-[26rem] w-[26rem] rounded-full border-[22px] border-orange/25 sm:block" />
        <div className="container-eb relative py-8 md:py-14">
          <Breadcrumbs items={[...c.crumbs]} light />
          <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight text-white md:mt-6 md:text-5xl">{c.title}</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/80 md:text-lg">{c.lead}</p>
        </div>
        <div className="flight-line opacity-70" aria-hidden />
      </section>
      <section className="bg-cloud py-6 md:py-14">
        <div className="container-eb grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Suspense fallback={<div className="card h-96 animate-pulse" aria-busy="true" />}>
            <QuoteWizard defaultLang={lang} />
          </Suspense>

          <aside className="grid gap-4 lg:sticky lg:top-28" aria-label={c.asideLabel}>
            <div className="card p-6">
              <h2 className="text-lg font-bold">{c.how}</h2>
              <ul className="mt-4 grid gap-4 text-sm text-slate-ink">
                {c.points.map((p, i) => {
                  const Icon = icons[i];
                  return (
                    <li key={p} className="flex gap-3">
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-orange" aria-hidden />
                      <span>{p}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="rounded-[var(--radius-card)] bg-navy p-6 text-white">
              <h2 className="text-lg font-bold text-white">{c.talk}</h2>
              <p className="mt-2 text-sm text-white/75">{c.talkText}</p>
              <a href={contact.phoneHref} className="btn-primary mt-4 w-full">
                <Phone className="h-4 w-4" aria-hidden /> {contact.phoneDisplay}
              </a>
              <ul className="mt-4 space-y-1 text-xs text-white/60">
                {c.hours.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
