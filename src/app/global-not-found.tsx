import type { Metadata } from "next";
import { NotFoundContent } from "@/components/layout/not-found-content";
import { PublicChrome } from "@/components/layout/public-chrome";
import { RootDocument, baseMetadata } from "@/components/layout/root-document";

export const metadata: Metadata = { ...baseMetadata, title: "Page not found", robots: { index: false, follow: true } };

/**
 * 404 for URLs that match no route. With one root layout per area (English, Spanish, admin, driver)
 * Next.js renders this full document (experimental.globalNotFound in next.config.ts).
 */
export default function GlobalNotFound() {
  return (
    <RootDocument lang="en">
      <PublicChrome>
        <NotFoundContent lang="en" />
      </PublicChrome>
    </RootDocument>
  );
}
