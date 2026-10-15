/**
 * SEO helpers: page metadata + JSON-LD schema built only from approved public facts.
 * LocalBusiness uses the P.O. Box (never the private street address).
 */
import type { Metadata } from "next";
import { company, contact, markets } from "@/content/site";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || company.url;

export function pageMeta({ title, description, path, noindex = false }: { title: string; description: string; path: string; noindex?: boolean }): Metadata {
  const url = new URL(path, SITE_URL).toString();
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: noindex ? { index: false, follow: true } : undefined,
    openGraph: { title, description, url, siteName: company.name, type: "website", images: [{ url: "/brand/og-default.png", width: 1200, height: 630, alt: company.name }] },
    twitter: { card: "summary_large_image", title, description },
  };
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness", // never MovingCompany: Express Bags does not offer moving
    "@id": `${SITE_URL}/#organization`,
    name: company.name,
    url: SITE_URL,
    logo: `${SITE_URL}/brand/express-bags-logo.png`,
    image: `${SITE_URL}/brand/express-bags-logo.png`,
    slogan: company.tagline,
    foundingDate: String(company.founded),
    telephone: contact.phoneE164,
    address: {
      "@type": "PostalAddress",
      postOfficeBoxNumber: contact.poBox.replace("P.O. Box ", ""),
      addressLocality: contact.city,
      addressRegion: contact.state,
      postalCode: contact.zip,
      addressCountry: "US",
    },
    areaServed: markets.map((m) => ({ "@type": "Place", name: `${m.name}, Florida` })),
    openingHoursSpecification: contact.hours.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.schema.days,
      opens: h.schema.opens,
      closes: h.schema.closes,
    })),
    ...(contact.emailLive ? { email: contact.email } : {}),
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: new URL(it.path, SITE_URL).toString() })),
  };
}

export function serviceSchema({ name, description, path, areas }: { name: string; description: string; path: string; areas?: string[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    url: new URL(path, SITE_URL).toString(),
    provider: { "@id": `${SITE_URL}/#organization` },
    areaServed: (areas && areas.length ? areas : markets.map((m) => m.name)).map((a) => ({ "@type": "Place", name: a })),
  };
}

export function faqSchema(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
