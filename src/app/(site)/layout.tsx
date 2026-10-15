import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteExtras } from "@/components/layout/site-extras";

/** Public website chrome (header + footer). The admin panel lives outside this group with its own layout. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only z-[100] rounded-full bg-orange px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
      <SiteExtras />
    </>
  );
}
