import type { Metadata } from "next";

/** Customer portal: private, never indexed. */
export const metadata: Metadata = {
  title: { default: "Your account", template: "%s | Express Bags account" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
