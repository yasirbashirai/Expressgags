"use client";

/**
 * Admin chrome: full-screen workspace (outside the public site layout), checks the session
 * and provides the signed-in user to pages. Unauthenticated visitors are sent to /admin/login.
 */
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  BadgeCheck, BarChart3, Bell, Briefcase, Building2, FileText, Inbox, KeyRound, LayoutDashboard, LogOut, Mail, MapPinned, Menu, Newspaper,
  Package, Plane, Receipt, Route, Settings, ShieldCheck, Sparkles, TriangleAlert, Truck, Users, Warehouse, X,
} from "lucide-react";
import { api, ApiError, type AdminUser } from "./api";

const UserContext = createContext<AdminUser | null>(null);
export const useAdminUser = () => useContext(UserContext);

type NavItem = { href: string; label: string; Icon: typeof LayoutDashboard; roles: string[] };
const ALL = ["OWNER", "STAFF", "DISPATCHER", "ACCOUNTING"];
const OPS = ["OWNER", "STAFF", "DISPATCHER"];
const MONEY = ["OWNER", "STAFF", "ACCOUNTING"];
/** Admin navigation, grouped. Each module's pages live at these routes (src/app/admin/**). */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Overview", items: [
    { href: "/admin", label: "Dashboard", Icon: LayoutDashboard, roles: ALL },
    { href: "/admin/reports", label: "Reports & insights", Icon: BarChart3, roles: ["OWNER", "STAFF", "ACCOUNTING"] },
  ] },
  { title: "Sales", items: [
    { href: "/admin/quotes", label: "Quote requests", Icon: Inbox, roles: OPS },
    { href: "/admin/quotations", label: "Quotations", Icon: FileText, roles: ["OWNER", "STAFF"] },
    { href: "/admin/customers", label: "Customers & accounts", Icon: Building2, roles: ["OWNER", "STAFF", "ACCOUNTING"] },
  ] },
  { title: "Operations", items: [
    { href: "/admin/orders", label: "Orders", Icon: Package, roles: OPS },
    { href: "/admin/dispatch", label: "Dispatch board", Icon: Route, roles: OPS },
    { href: "/admin/exceptions", label: "Exceptions", Icon: TriangleAlert, roles: OPS },
    { href: "/admin/storage", label: "Storage", Icon: Warehouse, roles: OPS },
    { href: "/admin/shipments", label: "Carrier shipments", Icon: Plane, roles: OPS },
  ] },
  { title: "Resources", items: [
    { href: "/admin/team", label: "Team", Icon: Users, roles: ["OWNER", "STAFF", "DISPATCHER"] },
    { href: "/admin/fleet", label: "Fleet", Icon: Truck, roles: OPS },
    { href: "/admin/credentials", label: "Credentials", Icon: BadgeCheck, roles: ["OWNER", "STAFF"] },
  ] },
  { title: "Money", items: [
    { href: "/admin/billing", label: "Invoices & payments", Icon: Receipt, roles: MONEY },
    { href: "/admin/claims", label: "Protection claims", Icon: ShieldCheck, roles: ["OWNER", "STAFF"] },
  ] },
  { title: "Engagement", items: [
    { href: "/admin/messages", label: "Messages", Icon: Mail, roles: ["OWNER", "STAFF"] },
    { href: "/admin/careers", label: "Career applications", Icon: Briefcase, roles: ["OWNER", "STAFF"] },
    { href: "/admin/notifications", label: "Notifications", Icon: Bell, roles: ["OWNER", "STAFF"] },
    { href: "/admin/assistant", label: "AI assistant", Icon: Sparkles, roles: ["OWNER", "STAFF"] },
    { href: "/admin/content", label: "Website content", Icon: Newspaper, roles: ["OWNER", "STAFF"] },
  ] },
  { title: "System", items: [
    { href: "/admin/settings", label: "Settings & pricing", Icon: Settings, roles: OPS.concat("ACCOUNTING") },
    { href: "/admin/reference", label: "Markets & zones", Icon: MapPinned, roles: ["OWNER", "STAFF"] },
    { href: "/admin/users", label: "Users & security", Icon: KeyRound, roles: ["OWNER"] },
    { href: "/admin/users/me", label: "My security", Icon: ShieldCheck, roles: ALL },
  ] },
];


/**
 * Admin page wrapper. Admin pages sit outside the (site) route group, so the public header/footer never render here; the
 * admin is a clean full-height workspace that scrolls normally.
 */
export function AdminLayer({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{"body { background: var(--color-cloud); }"}</style>
      <div className="min-h-screen bg-cloud text-charcoal">{children}</div>
    </>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api<{ user: AdminUser & { mustChangePassword?: boolean } }>("/auth/me")
      .then((r) => {
        setUser(r.user);
        // Force a password change (e.g. after an admin reset) before using the admin
        if (r.user.mustChangePassword && !pathname.startsWith("/admin/users/me")) router.replace("/admin/users/me?change=1");
      })
      .catch((e: ApiError) => {
        if (e.status === 401) router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
        else setError(e.message);
      });
  }, [router, pathname]);

  useEffect(() => setOpen(false), [pathname]);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/admin/login");
  }, [router]);

  if (error) {
    return (
      <AdminLayer>
        <div className="grid min-h-screen place-items-center p-6">
          <div className="card max-w-md p-8 text-center">
            <p className="font-display text-lg font-bold text-navy">Admin unavailable</p>
            <p className="mt-2 text-sm text-slate-ink">{error}</p>
          </div>
        </div>
      </AdminLayer>
    );
  }
  if (!user) {
    return (
      <AdminLayer>
        <div className="grid min-h-screen place-items-center text-sm text-muted">Loading…</div>
      </AdminLayer>
    );
  }

  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => n.roles.includes(user.role)) })).filter((g) => g.items.length);
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : href === "/admin/users" ? pathname === href || (pathname.startsWith(href + "/") && !pathname.startsWith("/admin/users/me")) : pathname.startsWith(href);

  const sidebar = (
    <nav aria-label="Admin" className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Link href="/admin" className="block">
          <Image src="/brand/express-bags-logo-reversed.png" alt="Express Bags admin" width={600} height={244} className="h-12 w-auto" />
        </Link>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Operations admin</p>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">{g.title}</p>
            <ul className="space-y-0.5">
              {g.items.map(({ href, label, Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive(href) ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                      isActive(href) ? "bg-white text-navy" : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden /> {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-4 text-xs text-white/70">
        <p className="truncate font-semibold text-white">{user.email}</p>
        <p className="mt-0.5 capitalize">{user.role.toLowerCase()}</p>
        <button onClick={logout} className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-white hover:bg-white/10">
          <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <AdminLayer>
      <UserContext.Provider value={user}>
        <div className="min-h-screen lg:pl-64">
          <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 bg-navy lg:block">{sidebar}</aside>

          {/* Mobile top bar */}
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-navy px-4 py-3 lg:hidden">
            <Image src="/brand/express-bags-logo-reversed.png" alt="Express Bags admin" width={600} height={244} className="h-9 w-auto" />
            <button onClick={() => setOpen(true)} aria-label="Open admin menu" className="rounded-full p-2 text-white hover:bg-white/10">
              <Menu className="h-5 w-5" />
            </button>
          </div>
          {open && (
            <div className="fixed inset-0 z-30 lg:hidden">
              <button className="absolute inset-0 bg-navy-950/60" aria-label="Close admin menu" onClick={() => setOpen(false)} />
              <aside className="relative h-full w-72 bg-navy">
                <button onClick={() => setOpen(false)} aria-label="Close admin menu" className="absolute right-3 top-3 rounded-full p-2 text-white hover:bg-white/10">
                  <X className="h-5 w-5" />
                </button>
                {sidebar}
              </aside>
            </div>
          )}

          <main className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
        </div>
      </UserContext.Provider>
    </AdminLayer>
  );
}

/** Page title row used by every admin page. */
export function AdminTitle({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold text-navy md:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, children, className = "", action }: { title?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`card min-w-0 p-5 md:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-display text-base font-bold text-navy">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
