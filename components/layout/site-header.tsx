"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Phone, X } from "lucide-react";
import { contact, nav } from "@/content/site";

/** Sticky site header: logo, main navigation, office phone and the primary "Request a Quote" CTA. */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile menu whenever the route changes
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      {/* Utility bar */}
      <div className="hidden bg-navy text-white md:block">
        <div className="container-eb flex h-9 items-center justify-between text-xs">
          <p className="text-white/80">Florida luggage logistics, courier, last-mile and truck logistics since 2010</p>
          <div className="flex items-center gap-5">
            <span className="text-white/70">{contact.visits}</span>
            <a href={contact.phoneHref} className="inline-flex items-center gap-1.5 font-semibold hover:text-orange-100">
              <Phone className="h-3.5 w-3.5" aria-hidden /> {contact.phoneDisplay}
            </a>
          </div>
        </div>
      </div>

      <div className="container-eb flex h-16 items-center justify-between gap-4 md:h-20">
        <Link href="/" className="shrink-0" aria-label="Express Bags, Inc. home">
          <Image
            src="/brand/express-bags-logo-transparent.png"
            alt="Express Bags, Inc. Luggage Delivery Company"
            width={600}
            height={244}
            priority
            className="h-11 w-auto md:h-14"
          />
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {nav.main.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full px-3.5 py-2 text-sm font-medium transition hover:bg-navy-50 hover:text-navy ${
                      active ? "text-navy" : "text-slate-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <a href={contact.phoneHref} className="btn-ghost hidden !px-4 sm:inline-flex lg:hidden xl:inline-flex" aria-label={`Call ${contact.phoneDisplay}`}>
            <Phone className="h-4 w-4" aria-hidden />
            <span className="hidden xl:inline">{contact.phoneDisplay}</span>
          </a>
          <Link href="/request-a-quote" className="btn-primary hidden sm:inline-flex">
            Request a Quote
          </Link>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line text-navy lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div id="mobile-menu" className="border-t border-line bg-white lg:hidden">
          <nav aria-label="Mobile" className="container-eb py-4">
            <ul className="grid gap-1">
              {nav.main.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="block rounded-xl px-3 py-3 text-base font-medium text-navy hover:bg-navy-50">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link href="/request-a-quote" className="btn-primary w-full">Request a Quote</Link>
              <a href={contact.phoneHref} className="btn-ghost w-full">
                <Phone className="h-4 w-4" aria-hidden /> {contact.phoneDisplay}
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
