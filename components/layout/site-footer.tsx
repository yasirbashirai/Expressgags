import Image from "next/image";
import Link from "next/link";
import { Clock, MapPin, Phone } from "lucide-react";
import { company, contact, markets, nav, services, social } from "@/content/site";

/** Site footer: brand, contact (P.O. Box + office phone only), services, markets, company & legal links. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-navy-950 text-white">
      <div className="container-eb grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Image src="/brand/express-bags-logo-reversed.png" alt="Express Bags, Inc." width={600} height={244} className="h-16 w-auto" />
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/70">{company.tagline} {company.sinceLine}.</p>
          <ul className="mt-6 space-y-3 text-sm text-white/80">
            <li className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange" aria-hidden />
              <span>{contact.addressLine}<br /><span className="text-white/60">{contact.visits}</span></span></li>
            <li className="flex gap-3"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-orange" aria-hidden />
              <a href={contact.phoneHref} className="hover:text-white">{contact.phoneDisplay}</a></li>
            <li className="flex gap-3"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-orange" aria-hidden />
              <span>{contact.hours.map((h) => (<span key={h.days} className="block">{h.days}: {h.time}</span>))}</span></li>
            {contact.emailLive && (
              <li><a href={`mailto:${contact.email}`} className="hover:text-white">{contact.email}</a></li>
            )}
          </ul>
        </div>

        <FooterCol title="Services" className="lg:col-span-3"
          links={services.map((s) => ({ label: s.name, href: `/services/${s.slug}` }))} />
        <FooterCol title="Service Areas" className="lg:col-span-2"
          links={[{ label: "All Florida service areas", href: "/service-areas" }, ...markets.map((m) => ({ label: m.name, href: `/service-areas/${m.slug}` }))]} />
        <div className="grid gap-10 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-1">
          <FooterCol title="Company" links={nav.footer.company} />
          <FooterCol title="Help" links={nav.footer.help} />
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-eb flex flex-col gap-4 pb-28 pt-6 text-xs text-white/60 md:flex-row md:items-center md:justify-between lg:pb-6">
          <p>© {year} {company.name} All rights reserved.</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {nav.footer.legal.map((l) => (<li key={l.href}><Link href={l.href} className="hover:text-white">{l.label}</Link></li>))}
            <li><a href="#cookie-settings" className="hover:text-white">Cookie settings</a></li>
            {social.map((s) => (<li key={s.name}><a href={s.href} target="_blank" rel="noopener noreferrer" className="hover:text-white">{s.name}</a></li>))}
          </ul>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links, className = "" }: { title: string; links: { label: string; href: string }[]; className?: string }) {
  return (
    <div className={className}>
      <h3 className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-white">{title}</h3>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map((l) => (
          <li key={l.href}><Link href={l.href} className="text-white/70 transition hover:text-white">{l.label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
