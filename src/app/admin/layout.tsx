import type { Metadata } from "next";
import { RootDocument, baseMetadata, baseViewport } from "@/components/layout/root-document";

/** Admin area: never indexed by search engines. */
export const viewport = baseViewport;

export const metadata: Metadata = {
  metadataBase: baseMetadata.metadataBase,
  title: { default: "Admin", template: "%s | Express Bags Admin" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootDocument lang="en" organization={false}>
      {children}
    </RootDocument>
  );
}
