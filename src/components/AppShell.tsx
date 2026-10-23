"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Wallet, HandCoins, FileBarChart,
  Users, UserCog, Settings, ScrollText, Info, Menu, X, LogOut,
  Moon, Sun, Receipt, Plus, ShoppingCart, Package, Boxes, Truck, Building2, MessageCircle,
  Send, MinusCircle, Wrench, Smartphone, History, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { api } from "@/lib/client";
import { ToastProvider, cn } from "./ui";
import { PwaInstall } from "./PwaInstall";
import { SoundToggle } from "./SoundToggle";
import { LanguageSwitch } from "./LanguageProvider";
import type { FeatureKey, FeatureVisibility, ModuleMode } from "@/lib/modules";
import { NEW_EVENT } from "@/lib/useNewModal";
import { TopBarSlots } from "./PageHeader";

interface Me {
  user: {
    id: string; name: string; username: string; roleName: string;
    permissions: string[]; allBranches: boolean; branchIds: string[];
  };
  business: { name: string; phone: string | null; address: string | null; currency: string; logoUrl: string | null } | null;
  branches: { id: string; name: string; code: string }[];
  modules: {
    mode: ModuleMode;
    miniMartEnabled: boolean;
    walletsEnabled: boolean;
    features: FeatureVisibility;
    /** The business category picked at sign-up (MINI_MART, MOBILE_SHOP, …) or CUSTOM. */
    category: string;
  };
  edition: "FULL" | "PLAY";
}

const AuthCtx = createContext<{
  me: Me | null;
  hasPerm: (p: string) => boolean;
  branches: Me["branches"];
  defaultBranchId: string;
  miniMartEnabled: boolean;
  walletsEnabled: boolean;
  moduleMode: ModuleMode;
  featureEnabled: (feature: FeatureKey) => boolean;
  playEdition: boolean;
  refreshAuth: () => Promise<void>;
}>({
  me: null,
  hasPerm: () => false,
  branches: [],
  defaultBranchId: "",
  miniMartEnabled: false,
  walletsEnabled: true,
  moduleMode: "WALLET_ONLY",
  featureEnabled: () => false,
  playEdition: false,
  refreshAuth: async () => {},
});

export function useAuth() {
  return useContext(AuthCtx);
}

/** What "+" creates, per section. A section is listed only if it has something to create:
 *  on Reports or Audit there is nothing to add, and the button is hidden rather than
 *  sending the user somewhere unrelated. POS is left out because that page is itself the
 *  new-sale screen.
 *
 *  Each entry names the permission to create, which is not always the permission to view
 *  the section — being able to read wallets does not mean being able to open one. */
const CREATE_ACTIONS: { section: string; perm: string; feature?: FeatureKey; label: string }[] = [
  { section: "/purchases", perm: "purchase.create", feature: "purchases", label: "New purchase" },
  { section: "/items", perm: "item.manage", feature: "items", label: "New item" },
  { section: "/repairs", perm: "repair.create", feature: "repair", label: "Take in a device" },
  { section: "/billers", perm: "biller.manage", feature: "biller", label: "New biller" },
  { section: "/wallets", perm: "wallet.create", feature: "wallets", label: "New wallet" },
  { section: "/transfers", perm: "wallet.transfer", feature: "transfers", label: "New transfer" },
  { section: "/withdraw", perm: "wallet.withdraw", feature: "withdraw", label: "New withdrawal" },
  { section: "/credit", perm: "credit.create", feature: "credit", label: "New credit record" },
  { section: "/income-expense", perm: "income_expense.create", feature: "incomeExpense", label: "New income or expense" },
  { section: "/customers", perm: "customer.manage", feature: "customers", label: "New customer" },
  { section: "/suppliers", perm: "customer.manage", feature: "suppliers", label: "New supplier" },
  { section: "/users", perm: "users.manage", feature: "users", label: "New user" },
];

interface NavTab { href: string; label: string; icon: typeof LayoutDashboard; perm: string; feature: FeatureKey }

/** Wallets, Transfer and Withdraw share one sidebar entry; the pages switch between them
 *  with tabs. Each tab keeps its own permission and module switch. */
const WALLET_TABS: NavTab[] = [
  { href: "/wallets", label: "Wallets", icon: Wallet, perm: "wallet.view", feature: "wallets" },
  { href: "/transfers", label: "Transfer", icon: Send, perm: "wallet.transfer", feature: "transfers" },
  { href: "/withdraw", label: "Withdraw", icon: MinusCircle, perm: "wallet.withdraw", feature: "withdraw" },
];

interface NavItem {
  href: string;
  label: string;
  /** Bottom-bar label, when the first word of the full label would be ambiguous. */
  short?: string;
  icon: typeof LayoutDashboard;
  perm: string | null;
  feature?: FeatureKey;
  /** Pages grouped under this entry; it shows when any of them is allowed. */
  tabs?: NavTab[];
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
  { href: "/pos", label: "Sales & POS", icon: ShoppingCart, perm: "sale.create", feature: "pos" },
  { href: "/sales", label: "Sale History", short: "History", icon: History, perm: "sale.view", feature: "pos" },
  { href: "/repairs", label: "Repair Jobs", icon: Wrench, perm: "repair.view", feature: "repair" },
  { href: "/purchases", label: "Purchases", icon: Truck, perm: "purchase.view", feature: "purchases" },
  { href: "/items", label: "Items", icon: Package, perm: "item.view", feature: "items" },
  { href: "/stock", label: "Stock", icon: Boxes, perm: "stock.view", feature: "stock" },
  { href: "/billers", label: "Top-up Billers", icon: Smartphone, perm: "biller.view", feature: "biller" },
  { href: "/wallets", label: "Wallets", icon: Wallet, perm: null, tabs: WALLET_TABS },
  { href: "/credit", label: "Credit & Payable", icon: HandCoins, perm: "credit.view", feature: "credit" },
  { href: "/income-expense", label: "Income & Expense", icon: Receipt, perm: "income_expense.view", feature: "incomeExpense" },
  { href: "/reports", label: "Reports", icon: FileBarChart, perm: "report.view", feature: "reports" },
  { href: "/customers", label: "Customers", icon: Users, perm: "customer.view", feature: "customers" },
  { href: "/suppliers", label: "Suppliers", icon: Building2, perm: "customer.view", feature: "suppliers" },
  { href: "/users", label: "Users & Roles", icon: UserCog, perm: "users.manage", feature: "users" },
  { href: "/settings", label: "Settings", icon: Settings, perm: "settings.manage" },
  { href: "/audit", label: "Audit Logs", icon: ScrollText, perm: "audit.view", feature: "audit" },
  { href: "/telegram", label: "Telegram", icon: MessageCircle, perm: null, feature: "telegram" },
  { href: "/about", label: "About Us", icon: Info, perm: null, feature: "about" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  // The desktop sidebar folds away on the till, where every column of product tiles counts,
  // and stays open elsewhere. The header button overrides that for the page you are on.
  const [sidebarPref, setSidebarPref] = useState<{ path: string; hidden: boolean } | null>(null);
  const [dark, setDark] = useState(false);
  // Where a page's <PageHeader> puts its name and buttons (callback refs, set once mounted).
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const pathname = usePathname();
  const sidebarHidden = sidebarPref?.path === pathname ? sidebarPref.hidden : pathname.startsWith("/pos");
  const router = useRouter();

  const refreshAuth = useCallback(async () => {
    const next = await api<Me>("/api/v1/auth/me");
    setMe(next);
  }, []);

  useEffect(() => {
    api<Me>("/api/v1/auth/me")
      .then(setMe)
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("wn-theme", next ? "dark" : "light");
  }

  async function logout() {
    await api("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const miniMartEnabled = me?.modules.miniMartEnabled ?? false;
  const walletsEnabled = me?.modules.walletsEnabled ?? true;
  const playEdition = me?.edition === "PLAY";
  const featureEnabled = (feature: FeatureKey) => me?.modules.features[feature] ?? false;
  const blockedModulePath = [...NAV, ...WALLET_TABS].some(
    (item) =>
      item.feature &&
      pathname.startsWith(item.href) &&
      !featureEnabled(item.feature)
  );

  useEffect(() => {
    if (me && blockedModulePath) router.replace("/");
  }, [blockedModulePath, me, router]);

  if (loading || !me) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  const hasPerm = (p: string) => me.user.permissions.includes(p);
  const tabAllowed = (t: NavTab) => hasPerm(t.perm) && featureEnabled(t.feature);
  const visibleNav = NAV.flatMap((n): NavItem[] => {
    if (n.tabs) {
      // A group lands on its first page this user may open, and is hidden if there is none.
      const open = n.tabs.filter(tabAllowed);
      return open.length ? [{ ...n, href: open[0].href, tabs: open }] : [];
    }
    return (!n.perm || hasPerm(n.perm)) && (!n.feature || featureEnabled(n.feature)) ? [n] : [];
  });
  const isActive = (n: NavItem) =>
    n.href === "/" ? pathname === "/" : (n.tabs ?? [n]).some((t) => pathname.startsWith(t.href));
  // The tab bar for the group the current page belongs to, when it has more than one page.
  const groupTabs = visibleNav.find((n) => n.tabs && isActive(n))?.tabs;
  const mobileNav = visibleNav.slice(0, 4);
  // The menu name of the page, for the top bar until (or unless) the page names itself.
  const pageName = groupTabs?.find((t) => pathname.startsWith(t.href))?.label ?? visibleNav.find(isActive)?.label ?? "";

  // "+" creates for whatever section is open, so it is only shown where that means
  // something and the user is allowed to do it.
  const matchedCreate = CREATE_ACTIONS.find(
    (action) => pathname === action.section || pathname.startsWith(`${action.section}/`)
  );
  const createAction =
    matchedCreate &&
    hasPerm(matchedCreate.perm) &&
    (!matchedCreate.feature || featureEnabled(matchedCreate.feature))
      ? matchedCreate
      : null;

  const sidebar = (
    <nav className="flex flex-col gap-0.5 p-3">
      {visibleNav.map((n) => {
        const active = isActive(n);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setDrawer(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              active
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            )}
          >
            <n.icon size={18} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <AuthCtx.Provider
      value={{
        me,
        hasPerm,
        branches: me.branches,
        defaultBranchId: me.branches[0]?.id ?? "",
        miniMartEnabled,
        walletsEnabled,
        moduleMode: me.modules.mode,
        featureEnabled,
        playEdition,
        refreshAuth,
      }}
    >
      <ToastProvider>
        <div className="flex min-h-screen">
          {/* Desktop sidebar */}
          {/* Pinned to the screen and scrolled on its own, so the last items (Settings,
              Telegram) are reachable however many menu items a shop has turned on. */}
          <aside className={cn("no-print sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900", !sidebarHidden && "lg:block")}>
            <div className="flex items-center gap-2 border-b border-gray-200 p-4 dark:border-gray-800">
              <div className="rounded-lg bg-white p-1 ring-1 ring-gray-100 dark:ring-gray-800"><Image src="/mahar-pos-logo.svg" alt="Mahar Mini POS" width={24} height={24} /></div>
              <div className="min-w-0">
                <div className="font-bold leading-tight">Mahar Mini POS</div>
                <div className="truncate text-xs text-gray-500 dark:text-gray-400">{me.user.name} · {me.user.roleName}</div>
              </div>
            </div>
            {sidebar}
          </aside>

          {/* Mobile drawer */}
          {drawer && (
            <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setDrawer(false)}>
              <aside className="h-full w-[min(18rem,88vw)] overflow-y-auto bg-white pb-[env(safe-area-inset-bottom)] dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-800">
                  <div className="min-w-0">
                    <div className="font-bold leading-tight">Mahar Mini POS</div>
                    <div className="truncate text-xs text-gray-500 dark:text-gray-400">{me.user.name} · {me.user.roleName}</div>
                  </div>
                  <button onClick={() => setDrawer(false)}><X size={20} /></button>
                </div>
                {sidebar}
              </aside>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Top bar */}
            <header className="no-print sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-gray-200 bg-white/90 px-3 py-2 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90 sm:px-4">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <button className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden" onClick={() => setDrawer(true)}>
                  <Menu size={20} />
                </button>
                <button
                  className="hidden rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 lg:inline-flex"
                  onClick={() => setSidebarPref({ path: pathname, hidden: !sidebarHidden })}
                  title={sidebarHidden ? "Show menu" : "Hide menu"}
                  aria-label={sidebarHidden ? "Show menu" : "Hide menu"}
                >
                  {sidebarHidden ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
                </button>
                {/* The page's name. A page with a <PageHeader> puts its own here (a
                    customer's name, say), and the menu name steps aside for it. */}
                <div ref={setTitleSlot} className="flex min-w-0 items-center [&:has(.page-title)>.menu-title]:hidden">
                  <span className="menu-title truncate text-base font-bold text-gray-900 dark:text-gray-100">{pageName}</span>
                </div>
              </div>
              {/* Desktop: the page's own buttons, up here and within reach, not a row below. */}
              <div ref={setActionsSlot} className="hidden min-w-0 flex-1 items-center justify-end gap-2 px-3 lg:flex" />
              <div className="flex shrink-0 items-center gap-1">
                <LanguageSwitch className="mr-1" />
                <PwaInstall compact />
                <SoundToggle />
                <button onClick={toggleTheme} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" title="Toggle theme">
                  {dark ? <Sun size={18} /> : <Moon size={18} />}
                </button>
                <button onClick={logout} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" title={`Sign out (${me.user.name} · ${me.user.roleName})`}>
                  <LogOut size={18} />
                </button>
              </div>
            </header>

            <main className="min-w-0 flex-1 p-3 pb-24 sm:p-4 lg:pb-6">
              {blockedModulePath ? (
                <div className="flex min-h-40 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                </div>
              ) : (
                <>
                  <div className="mx-auto max-w-6xl"><AnnouncementBanner /></div>
                  {groupTabs && groupTabs.length > 1 && (
                    <div className="no-print mx-auto mb-4 flex max-w-6xl gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
                      {groupTabs.map((t) => {
                        const on = pathname.startsWith(t.href);
                        return (
                          <Link
                            key={t.href}
                            href={t.href}
                            className={cn(
                              "flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition",
                              on ? "bg-white text-blue-600 shadow dark:bg-gray-900" : "text-gray-600 hover:text-gray-900 dark:text-gray-300"
                            )}
                          >
                            <t.icon size={16} />{t.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                  <TopBarSlots.Provider value={{ title: titleSlot, actions: actionsSlot }}>{children}</TopBarSlots.Provider>
                </>
              )}
            </main>

            {/* Mobile bottom nav */}
            <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-gray-800 dark:bg-gray-900 lg:hidden">
              {mobileNav.map((n) => {
                const active = isActive(n);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={cn(
                      "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium",
                      active ? "text-blue-600" : "text-gray-500 dark:text-gray-400"
                    )}
                  >
                    <n.icon size={20} />
                    <span className="max-w-full truncate">{("short" in n && n.short) || n.label.split(" ")[0]}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Floating create button (mobile) — acts on the section being viewed */}
            {createAction && (
              /* Still a link, so tapping "+" from another section navigates there and the
                 form opens on arrival. The event covers the other half: on the page it
                 already creates for, nothing remounts and the URL alone opened nothing. */
              <Link
                href={`${createAction.section}?new=1`}
                onClick={() => window.dispatchEvent(new Event(NEW_EVENT))}
                className="no-print fixed bottom-16 right-4 z-30 rounded-full bg-blue-600 p-3.5 text-white shadow-lg lg:hidden"
                title={createAction.label}
                aria-label={createAction.label}
              >
                <Plus size={22} />
              </Link>
            )}
          </div>
        </div>
      </ToastProvider>
    </AuthCtx.Provider>
  );
}
