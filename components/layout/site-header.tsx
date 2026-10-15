"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Globe, Menu, Phone, Plane, Ship, X } from "lucide-react";
import { airports, contact, markets, ports, services } from "@/content/site";
import { serviceIcon } from "@/components/services/service-icon";

/**
 * Public site header.
 * - Sticky, shrinks on scroll; utility bar with appointment note + office phone.
 * - Desktop mega menus for Services and Service Areas (click or hover, Esc / outside click closes).
 * - EN / ES language switch mapped to the equivalent /es page when one exists.
 * - Mobile: slide-in drawer with grouped links, plus a persistent bottom action bar
 *   ("Request a Quote" + call) on content pages.
 */

type MenuKey = "services" | "areas" | null;

/** EN ↔ ES path mapping for the language switch. */
export function languagePeer(pathname: string): { lang: "en" | "es"; href: string } {
  if (pathname === "/es" || pathname.startsWith("/es/")) {
    const rest = pathname.slice(3);
    if (rest === "" || rest === "/") return { lang: "es", href: "/" };
    if (rest === "/servicios") return { lang: "es", href: "/services" };
    if (rest === "/solicitar-cotizacion") return { lang: "es", href: "/request-a-quote" };
    const sv = rest.match(/^\/servicios\/([a-z0-9-]+)$/);
    if (sv) return { lang: "es", href: `/services/${sv[1]}` };
    const m = rest.match(/^\/areas\/([a-z0-9-]+)$/);
    if (m) return { lang: "es", href: `/service-areas/${m[1]}` };
    return { lang: "es", href: "/" };
  }
  if (pathname === "/") return { lang: "en", href: "/es" };
  if (pathname === "/services") return { lang: "en", href: "/es/servicios" };
  if (pathname === "/request-a-quote") return { lang: "en", href: "/es/solicitar-cotizacion" };
  const svc = pathname.match(/^\/services\/([a-z0-9-]+)$/);
  if (svc) return { lang: "en", href: `/es/servicios/${svc[1]}` };
  const m = pathname.match(/^\/service-areas\/([a-z0-9-]+)$/);
  if (m) return { lang: "en", href: `/es/areas/${m[1]}` };
  return { lang: "en", href: "/es" };
}

const LABELS = {
  en: { services: "Services", areas: "Service Areas", industries: "Industries", business: "Business Accounts", about: "About", contact: "Contact", quote: "Request a Quote", call: "Call", switch: "Español", switchShort: "ES", menu: "Menu" },
  es: { services: "Servicios", areas: "Áreas", industries: "Industrias", business: "Empresas", about: "Nosotros", contact: "Contacto", quote: "Solicitar cotización", call: "Llamar", switch: "English", switchShort: "EN", menu: "Menú" },
};

/** Pages where the mobile bottom action bar would get in the way. */
const NO_BAR = ["/request-a-quote", "/es/solicitar-cotizacion", "/account", "/driver", "/admin", "/survey", "/q/", "/invoice/", "/pay/", "/track"];

export function SiteHeader() {
  const pathname = usePathname() || "/";
  const peer = languagePeer(pathname);
  const t = LABELS[peer.lang];
  const quoteHref = peer.lang === "es" ? "/es/solicitar-cotizacion" : "/request-a-quote";

  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<MenuKey>(null);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close menus on route change
  useEffect(() => {
    setOpen(false);
    setMenu(null);
  }, [pathname]);

  // Shrink on scroll (passive, rAF-throttled)
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrolled(window.scrollY > 24));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Esc + outside click close the mega menu; Esc closes the drawer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setOpen(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, []);

  // Lock body scroll while the drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const hoverOpen = useCallback((k: MenuKey) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setMenu(k), 90);
  }, []);
  const hoverClose = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setMenu(null), 180);
  }, []);

  const showBar = !NO_BAR.some((p) => pathname.startsWith(p));
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const link = (href: string, label: string) => (
    <Link href={href} aria-current={isActive(href) ? "page" : undefined}
      className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition hover:bg-navy-50 hover:text-navy ${isActive(href) ? "text-navy" : "text-slate-ink"}`}>
      {label}
    </Link>
  );
  const megaButton = (k: Exclude<MenuKey, null>, label: string, href: string) => (
    <div onMouseEnter={() => hoverOpen(k)} onMouseLeave={hoverClose}>
      <button type="button" aria-expanded={menu === k} aria-controls={`mega-${k}`} onClick={() => setMenu(menu === k ? null : k)}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition hover:bg-navy-50 hover:text-navy ${menu === k || isActive(href) ? "text-navy" : "text-slate-ink"}`}>
        {label} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${menu === k ? "rotate-180" : ""}`} aria-hidden />
      </button>
    </div>
  );

  return (
    <>
      {/* Reveal fallback: content visible when JavaScript is off */}
      <noscript>
        <style>{`[data-reveal="out"]{opacity:1!important;transform:none!important}`}</style>
      </noscript>
      <header className="sticky top-0 z-50">
        <div className={`hidden bg-navy text-white transition-[height,opacity] duration-300 md:block ${scrolled ? "h-0 overflow-hidden opacity-0" : "h-9 opacity-100"}`}>
          <div className="container-eb flex h-9 items-center justify-between text-xs">
            <p className="text-white/80">{peer.lang === "es" ? "Logística de equipaje, mensajería, última milla y camiones en Florida desde 2010" : "Florida luggage logistics, courier, last-mile and truck logistics since 2010"}</p>
            <div className="flex items-center gap-5">
              <span className="text-white/70">{peer.lang === "es" ? "Visitas solo con cita previa" : contact.visits}</span>
              <a href={contact.phoneHref} className="inline-flex items-center gap-1.5 font-semibold hover:text-orange-100">
                <Phone className="h-3.5 w-3.5" aria-hidden /> {contact.phoneDisplay}
              </a>
            </div>
          </div>
        </div>

        <div ref={navRef} className={`relative border-b bg-white/90 backdrop-blur-xl transition-[box-shadow,border-color] duration-300 supports-[backdrop-filter]:bg-white/80 ${scrolled ? "border-line shadow-[0_8px_30px_-18px_rgb(0_40_88/0.35)]" : "border-transparent"}`}>
          <div className={`container-eb flex items-center justify-between gap-4 transition-[height] duration-300 ${scrolled ? "h-16" : "h-16 md:h-20"}`}>
            <Link href={peer.lang === "es" ? "/es" : "/"} className="shrink-0" aria-label="Express Bags, Inc. home">
              <Image src="/brand/express-bags-logo-transparent.png" alt="Express Bags, Inc. Luggage Delivery Company" width={600} height={244} priority
                className={`w-auto transition-[height] duration-300 ${scrolled ? "h-10" : "h-11 md:h-14"}`} />
            </Link>

            <nav aria-label="Main" className="hidden lg:block">
              <ul className="flex items-center gap-0.5">
                <li>{megaButton("services", t.services, "/services")}</li>
                <li>{megaButton("areas", t.areas, "/service-areas")}</li>
                <li>{link("/industries", t.industries)}</li>
                <li>{link("/business-accounts", t.business)}</li>
                <li className="hidden xl:block">{link("/about", t.about)}</li>
                <li>{link("/contact", t.contact)}</li>
              </ul>
            </nav>

            <div className="flex items-center gap-2">
              <Link href={peer.href} hrefLang={peer.lang === "es" ? "en" : "es"} lang={peer.lang === "es" ? "en" : "es"}
                className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-navy hover:bg-navy-50 sm:inline-flex" aria-label={peer.lang === "es" ? "View this page in English" : "Ver esta página en español"}>
                <Globe className="h-4 w-4" aria-hidden /> {t.switchShort}
              </Link>
              <a href={contact.phoneHref} className="btn-ghost hidden whitespace-nowrap !px-4 2xl:inline-flex" aria-label={`${t.call} ${contact.phoneDisplay}`}>
                <Phone className="h-4 w-4" aria-hidden /> {contact.phoneDisplay}
              </a>
              <Link href={quoteHref} className="btn-primary hidden whitespace-nowrap sm:inline-flex">{t.quote}</Link>
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line text-navy lg:hidden"
                aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((v) => !v)}>
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Mega menus (desktop) */}
          {menu && (
            <div id={`mega-${menu}`} onMouseEnter={() => hoverOpen(menu)} onMouseLeave={hoverClose}
              className="absolute inset-x-0 top-full hidden border-b border-line bg-white shadow-[0_30px_60px_-30px_rgb(0_40_88/0.35)] lg:block">
              <div className="container-eb anim-fade-up py-8 [animation-duration:.25s]">
                {menu === "services" ? <ServicesMega /> : <AreasMega />}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-[60] lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <button tabIndex={open ? 0 : -1} aria-label="Close menu" onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-navy-950/50 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} />
        <aside id="mobile-menu" aria-label="Mobile menu"
          className={`absolute right-0 top-0 flex h-full w-[min(88vw,380px)] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <p className="font-display text-lg font-bold text-navy">{t.menu}</p>
            <button tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-full p-2 text-navy hover:bg-cloud"><X className="h-5 w-5" /></button>
          </div>
          <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-3 py-4">
            <details className="group rounded-xl">
              <summary tabIndex={open ? 0 : -1} className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-3 text-base font-semibold text-navy hover:bg-navy-50 [&::-webkit-details-marker]:hidden">
                {t.services} <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden />
              </summary>
              <ul className="mb-2 grid gap-0.5 pl-2">
                <li><Link tabIndex={open ? 0 : -1} href="/services" className="block rounded-lg px-3 py-2 text-sm font-semibold text-orange-700">All services</Link></li>
                {services.map((s) => (<li key={s.slug}><Link tabIndex={open ? 0 : -1} href={`/services/${s.slug}`} className="block rounded-lg px-3 py-2 text-sm text-slate-ink hover:bg-cloud">{s.name}</Link></li>))}
              </ul>
            </details>
            <details className="group rounded-xl">
              <summary tabIndex={open ? 0 : -1} className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-3 text-base font-semibold text-navy hover:bg-navy-50 [&::-webkit-details-marker]:hidden">
                {t.areas} <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden />
              </summary>
              <ul className="mb-2 grid gap-0.5 pl-2">
                <li><Link tabIndex={open ? 0 : -1} href="/service-areas" className="block rounded-lg px-3 py-2 text-sm font-semibold text-orange-700">All Florida service areas</Link></li>
                {markets.map((m) => (<li key={m.slug}><Link tabIndex={open ? 0 : -1} href={`/service-areas/${m.slug}`} className="block rounded-lg px-3 py-2 text-sm text-slate-ink hover:bg-cloud">{m.name}</Link></li>))}
              </ul>
            </details>
            {[["/industries", t.industries], ["/business-accounts", t.business], ["/about", t.about], ["/track", "Track Your Delivery"], ["/account/login", "Client Login"], ["/contact", t.contact]].map(([href, label]) => (
              <Link key={href} tabIndex={open ? 0 : -1} href={href} className="block rounded-xl px-3 py-3 text-base font-semibold text-navy hover:bg-navy-50">{label}</Link>
            ))}
            <Link tabIndex={open ? 0 : -1} href={peer.href} hrefLang={peer.lang === "es" ? "en" : "es"} className="mt-2 flex items-center gap-2 rounded-xl px-3 py-3 text-base font-semibold text-navy hover:bg-navy-50">
              <Globe className="h-4 w-4" aria-hidden /> {t.switch}
            </Link>
          </nav>
          <div className="grid gap-2 border-t border-line p-4">
            <Link tabIndex={open ? 0 : -1} href={quoteHref} className="btn-primary w-full">{t.quote}</Link>
            <a tabIndex={open ? 0 : -1} href={contact.phoneHref} className="btn-ghost w-full"><Phone className="h-4 w-4" aria-hidden /> {contact.phoneDisplay}</a>
          </div>
        </aside>
      </div>

      {/* Mobile bottom action bar */}
      {showBar && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),0.6rem)] pt-2.5 backdrop-blur lg:hidden" data-testid="mobile-action-bar">
          <div className="mx-auto grid max-w-lg grid-cols-[1fr_auto] gap-2">
            <Link href={quoteHref} className="btn-primary w-full">{t.quote}</Link>
            <a href={contact.phoneHref} className="btn-ghost !px-4" aria-label={`${t.call} ${contact.phoneDisplay}`}>
              <Phone className="h-4 w-4" aria-hidden /> {t.call}
            </a>
          </div>
        </div>
      )}
    </>
  );
}

function ServicesMega() {
  const luggage = services.slice(0, 6);
  const commercial = services.slice(6);
  return (
    <div className="grid grid-cols-12 gap-8">
      <div className="col-span-8 grid grid-cols-2 gap-x-6 gap-y-1">
        <p className="col-span-2 mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Luggage &amp; hospitality</p>
        {luggage.map((s) => <MegaItem key={s.slug} href={`/services/${s.slug}`} icon={s.icon} title={s.name} text={s.short} />)}
        <p className="col-span-2 mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Courier &amp; commercial</p>
        {commercial.map((s) => <MegaItem key={s.slug} href={`/services/${s.slug}`} icon={s.icon} title={s.name} text={s.short} />)}
      </div>
      <div className="col-span-4">
        <div className="relative h-full overflow-hidden rounded-3xl bg-navy p-7 text-white">
          <div aria-hidden className="absolute -right-16 -top-16 h-52 w-52 rounded-full border-[3px] border-orange/60" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-100">Not sure which fits?</p>
          <p className="mt-3 font-display text-2xl font-bold">Describe the job. Dispatch matches the service.</p>
          <p className="mt-3 text-sm text-white/70">Every route, window and vehicle is confirmed before we commit.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/request-a-quote" className="btn-primary">Request a Quote</Link>
            <Link href="/services" className="btn-ghost-light">All services</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function AreasMega() {
  const tiers = [
    ["Top priority", markets.filter((m) => m.tier === "top")],
    ["Next priority", markets.filter((m) => m.tier === "next")],
    ["Additional focus", markets.filter((m) => m.tier === "additional")],
  ] as const;
  return (
    <div className="grid grid-cols-12 gap-8">
      <div className="col-span-7 grid grid-cols-3 gap-6">
        {tiers.map(([label, list]) => (
          <div key={label}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
            <ul className="space-y-1">
              {list.map((m) => (
                <li key={m.slug}>
                  <Link href={`/service-areas/${m.slug}`} className="group flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-navy hover:bg-navy-50">
                    <span>{m.name}{m.hq && <span className="ml-1.5 rounded-full bg-orange-600 px-1.5 py-0.5 align-middle text-[10px] font-bold text-white">HQ</span>}</span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <Link href="/service-areas" className="col-span-3 inline-flex items-center gap-2 text-sm font-semibold text-orange-700 hover:underline">
          All Florida service areas <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <div className="col-span-5 grid grid-cols-2 gap-4">
        <div className="rounded-3xl bg-cloud p-5">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"><Plane className="h-3.5 w-3.5 text-orange" aria-hidden /> Airports</p>
          <ul className="space-y-1">
            {airports.map((a) => (<li key={a.code}><Link href={`/airports/${a.slug}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-navy hover:bg-white"><span className="w-9 font-mono text-xs font-bold">{a.code}</span><span className="truncate text-slate-ink">{a.name.replace(" International Airport", "")}</span></Link></li>))}
          </ul>
        </div>
        <div className="rounded-3xl bg-cloud p-5">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"><Ship className="h-3.5 w-3.5 text-orange" aria-hidden /> Cruise ports</p>
          <ul className="space-y-1">
            {ports.map((p) => (<li key={p.slug}><Link href={`/ports/${p.slug}`} className="block rounded-lg px-2 py-1.5 text-sm text-navy hover:bg-white">{p.name}</Link></li>))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function MegaItem({ href, icon, title, text }: { href: string; icon: string; title: string; text: string }) {
  const Icon = serviceIcon(icon);
  return (
    <Link href={href} className="group flex gap-3 rounded-2xl p-3 transition hover:bg-navy-50">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700 transition group-hover:bg-orange-600 group-hover:text-white">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span>
        <span className="block text-sm font-semibold text-navy">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-ink">{text}</span>
      </span>
    </Link>
  );
}
