import type { Metadata } from "next";

/** Admin area: never indexed by search engines. */
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Express Bags Admin" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
