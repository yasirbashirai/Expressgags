import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
import "./globals.css";
import { JsonLd } from "@/components/ui/json-ld";
import { company } from "@/content/site";
import { SITE_URL, organizationSchema } from "@/lib/seo";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
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

export const viewport: Viewport = { themeColor: "#002858", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${inter.variable}`}>
      <body className="flex min-h-screen flex-col">
        {children}
        <JsonLd data={organizationSchema()} />
      </body>
    </html>
  );
}
