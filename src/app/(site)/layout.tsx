import { PublicChrome } from "@/components/layout/public-chrome";
import { RootDocument, baseMetadata, baseViewport } from "@/components/layout/root-document";

export const metadata = baseMetadata;
export const viewport = baseViewport;

/** Root layout for the English public website (header + footer). Spanish pages live in the (es) group. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootDocument lang="en">
      <PublicChrome>{children}</PublicChrome>
    </RootDocument>
  );
}
