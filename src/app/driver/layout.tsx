import type { Metadata, Viewport } from "next";

/** Driver app layout: standalone phone app (no public site header/footer), never indexed. */
export const metadata: Metadata = {
  title: { default: "Driver", template: "%s | Express Bags Driver" },
  robots: { index: false, follow: false },
  manifest: "/driver/manifest.webmanifest",
  appleWebApp: { capable: true, title: "EB Driver", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#002858", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-cloud text-charcoal">{children}</div>;
}
