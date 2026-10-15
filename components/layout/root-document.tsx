/**
 * Shared <html>/<body> shell for every root layout. The app uses one root layout per area
 * ((site) English, (es) Spanish, admin, driver) so each page ships the correct <html lang>
 * while staying statically rendered (no request headers needed).
 */
import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
import "@/app/globals.css";
import { JsonLd } from "@/components/ui/json-ld";
import { company } from "@/content/site";
import { SITE_URL, organizationSchema } from "@/lib/seo";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const baseMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Express Bags, Inc. | Florida Luggage Logistics, Courier & Truck Logistics Since 2010",
    template: "%s | Express Bags, Inc.",
  },
  description:
    "Miami-headquartered luggage logistics, hospitality transfers, courier, last-mile delivery, luggage storage and box-truck logistics across Florida's key travel markets since 2010. Request a quote.",
  applicationName: company.name,
  openGraph: { siteName: company.name, locale: "en_US", type: "website" },
};

export const baseViewport: Viewport = { themeColor: "#002858", width: "device-width", initialScale: 1 };

export function RootDocument({
  lang,
  children,
  organization = true,
}: {
  lang: "en" | "es-US";
  children: React.ReactNode;
  /** Public pages carry the LocalBusiness schema; private apps (admin, driver) do not need it. */
  organization?: boolean;
}) {
  return (
    <html lang={lang} className={`${archivo.variable} ${inter.variable}`}>
      <body className="flex min-h-screen flex-col">
        {children}
        {organization && <JsonLd data={organizationSchema()} />}
      </body>
    </html>
  );
}
