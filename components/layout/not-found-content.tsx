import Link from "next/link";
import { Compass } from "lucide-react";

const COPY = {
  en: { title: "This page took a different route.", text: "The page you were looking for has moved or never existed. Let us get you back on course.", home: "Back to home", homeHref: "/", services: "Our services", servicesHref: "/services", quote: "Request a Quote", quoteHref: "/request-a-quote" },
  es: { title: "Esta página tomó otra ruta.", text: "La página que busca cambió de lugar o no existe. Le ayudamos a retomar el camino.", home: "Volver al inicio", homeHref: "/es", services: "Nuestros servicios", servicesHref: "/es/servicios", quote: "Solicitar cotización", quoteHref: "/es/solicitar-cotizacion" },
};

/** Branded 404 body (English or Spanish), rendered inside the public chrome. */
export function NotFoundContent({ lang = "en" }: { lang?: "en" | "es" }) {
  const c = COPY[lang];
  return (
    <section className="relative overflow-hidden bg-navy py-28 text-white">
      <div aria-hidden className="absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full border-[3px] border-orange/60" />
      <div className="container-eb relative">
        <Compass className="h-12 w-12 text-orange" aria-hidden />
        <p className="mt-6 font-display text-7xl font-extrabold text-orange">404</p>
        <h1 className="mt-4 text-4xl font-extrabold text-white md:text-5xl">{c.title}</h1>
        <p className="mt-4 max-w-xl text-lg text-white/75">{c.text}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={c.homeHref} className="btn-primary">{c.home}</Link>
          <Link href={c.servicesHref} className="btn-ghost-light">{c.services}</Link>
          <Link href={c.quoteHref} className="btn-ghost-light">{c.quote}</Link>
        </div>
      </div>
    </section>
  );
}
