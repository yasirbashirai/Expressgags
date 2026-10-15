import type { Metadata } from "next";
import { PublicChrome } from "@/components/layout/public-chrome";
import { RootDocument, baseMetadata, baseViewport } from "@/components/layout/root-document";

export const metadata: Metadata = { ...baseMetadata, openGraph: { ...baseMetadata.openGraph, locale: "es_US" } };
export const viewport = baseViewport;

/** Root layout for the Spanish public pages (/es/**): same chrome as English, <html lang="es-US">. */
export default function SpanishRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootDocument lang="es-US">
      <PublicChrome skipLabel="Saltar al contenido">{children}</PublicChrome>
    </RootDocument>
  );
}
