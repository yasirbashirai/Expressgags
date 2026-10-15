import Link from "next/link";
import { Compass } from "lucide-react";
import SiteLayout from "./(site)/layout";

export default function NotFound() {
  return (
    <SiteLayout>
    <section className="relative overflow-hidden bg-navy py-28 text-white">
      <div aria-hidden className="absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full border-[3px] border-orange/60" />
      <div className="container-eb relative">
        <Compass className="h-12 w-12 text-orange" aria-hidden />
        <p className="mt-6 font-display text-7xl font-extrabold text-orange">404</p>
        <h1 className="mt-4 text-4xl font-extrabold text-white md:text-5xl">This page took a different route.</h1>
        <p className="mt-4 max-w-xl text-lg text-white/75">The page you were looking for has moved or never existed. Let us get you back on course.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="btn-primary">Back to home</Link>
          <Link href="/services" className="btn-ghost-light">Our services</Link>
          <Link href="/request-a-quote" className="btn-ghost-light">Request a Quote</Link>
        </div>
      </div>
    </section>
    </SiteLayout>
  );
}
