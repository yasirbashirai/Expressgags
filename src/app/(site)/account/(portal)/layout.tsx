import { PortalShell } from "@/components/portal/portal-shell";

/** Signed-in portal pages share the account shell (session check + navigation). */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>;
}
