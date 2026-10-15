"use client";

/**
 * Signed-in portal chrome: loads the customer (/v1/account/me), redirects to login when signed out,
 * and renders the account navigation (sidebar on desktop, scrollable tabs on phones).
 * Company and concierge sections appear only for the roles allowed to use them.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Building2, ConciergeBell, FileText, FolderOpen, LayoutDashboard, LogOut, MapPin, Package, Plus, Receipt, UserRound } from "lucide-react";
import { canUseConcierge, portal, PortalError, type Me } from "./api";
import { Alert, Loading } from "./ui";

type Ctx = { me: Me; refresh: () => Promise<void> };
const MeContext = createContext<Ctx | null>(null);
export const useMe = () => {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error("useMe must be used inside PortalShell");
  return ctx;
};

export function PortalShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await portal<{ customer: Me }>("/me");
      setMe(r.customer);
    } catch (e) {
      if (e instanceof PortalError && e.status === 401) router.replace(`/account/login?next=${encodeURIComponent(pathname)}`);
      else setError((e as Error).message);
    }
  }, [router, pathname]);

  useEffect(() => {
    load();
  }, [load]);

  const logout = async () => {
    await portal("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/account/login");
  };

  if (error) {
    return (
      <div className="container-eb py-16">
        <Alert>{error}</Alert>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="container-eb py-16">
        <Loading label="Opening your account…" />
      </div>
    );
  }

  const nav = [
    { href: "/account", label: "Overview", Icon: LayoutDashboard },
    { href: "/account/orders", label: "Orders & tracking", Icon: Package },
    { href: "/account/quotes", label: "Quotes", Icon: FileText },
    { href: "/account/invoices", label: "Invoices & receipts", Icon: Receipt },
    ...(canUseConcierge(me) ? [{ href: "/account/concierge", label: "Concierge desk", Icon: ConciergeBell }] : []),
    { href: "/account/addresses", label: "Saved locations", Icon: MapPin },
    { href: "/account/documents", label: "Documents", Icon: FolderOpen },
    ...(me.company && me.accountRole === "COMPANY_ADMIN" ? [{ href: "/account/company", label: "Company account", Icon: Building2 }] : []),
    { href: "/account/profile", label: "Profile & security", Icon: UserRound },
  ];
  const active = (href: string) => (href === "/account" ? pathname === "/account" : pathname.startsWith(href));

  return (
    <MeContext.Provider value={{ me, refresh: load }}>
      <div className="bg-cloud">
        {/* Account header band */}
        <div className="relative overflow-hidden bg-navy text-white print:hidden">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full border-[3px] border-orange/60" />
          <div className="container-eb relative flex flex-wrap items-center justify-between gap-4 py-6 md:py-8">
            <div className="min-w-0">
              <p className="eyebrow !text-orange-100">{me.company ? me.company.name : "Your Express Bags account"}</p>
              <p className="mt-2 truncate font-display text-2xl font-bold md:text-3xl">Welcome, {me.name.split(" ")[0]}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/request-a-quote" className="btn-primary"><Plus className="h-4 w-4" aria-hidden /> Request a Quote</Link>
              <button type="button" onClick={logout} className="btn-ghost-light"><LogOut className="h-4 w-4" aria-hidden /> Sign out</button>
            </div>
          </div>
          <div className="flight-line opacity-70" aria-hidden />
        </div>

        <div className="container-eb grid grid-cols-1 gap-6 py-6 md:py-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label="Account" className="min-w-0 print:hidden">
            <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
              {nav.map(({ href, label, Icon }) => (
                <li key={href} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={active(href) ? "page" : undefined}
                    className={`flex items-center gap-2.5 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition lg:rounded-xl ${
                      active(href) ? "bg-navy text-white shadow-[var(--shadow-card)]" : "bg-white text-slate-ink ring-1 ring-line hover:text-navy lg:bg-transparent lg:ring-0 lg:hover:bg-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden /> {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </MeContext.Provider>
  );
}
