import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteExtras } from "@/components/layout/site-extras";

/** Public website chrome (skip link, header, footer, site-wide extras), shared by the English and Spanish root layouts. */
export function PublicChrome({ children, skipLabel = "Skip to content" }: { children: React.ReactNode; skipLabel?: string }) {
  return (
    <>
      <a href="#main" className="sr-only z-[100] rounded-full bg-orange px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        {skipLabel}
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
      <SiteExtras />
    </>
  );
}
