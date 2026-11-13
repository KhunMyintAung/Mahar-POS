"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Wallet, HandCoins, FileBarChart,
  Users, UserCog, IdCard, Settings, ScrollText, Info, Menu, X, LogOut, HardDrive,
  Receipt, Plus, ShoppingCart, Package, Truck, MessageCircle,
  Wrench, Smartphone, History, PanelLeftClose, PanelLeftOpen, Store, ArrowLeftRight, ChevronDown, ClipboardList, Award,
} from "lucide-react";
import { api } from "@/lib/client";
import { setShopTimeZone } from "@/lib/format";
import { ToastProvider, cn, useToast } from "./ui";
import { CLOUD_PRINT_EVENT, setCloudPrintAllowed, type CloudPrintNotice } from "@/lib/cloudPrintSend";
import { PwaInstall } from "./PwaInstall";
import { SoundToggle } from "./SoundToggle";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitch, useAccountLanguage, useShowCurrency } from "./LanguageProvider";
import { isPhoneShop, type FeatureKey, type FeatureVisibility, type ModuleMode } from "@/lib/modules";
import { NEW_EVENT } from "@/lib/useNewModal";
import { TopBarTitle } from "./PageHeader";
import { clearOfflineCaches, getNetMode, offlineReadyAt, prepareOffline, tellServiceWorker } from "@/lib/netMode";
import { OFFLINE_EXTRA_URLS, posDataUrls } from "@/lib/posData";
import { listRepairOps, syncRepairs, topUpNumbers } from "@/lib/offlineRepairs";
import { isDeviceShop, refreshDeviceApp } from "@/lib/device";
import { DeviceBackupReminder } from "./DeviceBackupReminder";

/** Parts that need a server, hidden in a shop kept on this device only. */
const DEVICE_OFF: FeatureKey[] = ["onlineShop", "telegram", "users"];
import { listQueued, syncQueued } from "@/lib/offlineSales";

interface Me {
  user: {
    id: string; name: string; username: string; roleName: string;
    permissions: string[]; allBranches: boolean; branchIds: string[];
  };
  business: { name: string; phone: string | null; address: string | null; city?: string | null; currency: string; timezone?: string; logoUrl: string | null } | null;
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
  /** This shop's phones send slips to its counter printer (lib/cloudPrint.ts). */
  cloudPrint?: boolean;
}

/** The outcome of a slip a phone sent to the counter printer, as a toast. */
function CloudPrintNotices() {
  const { push } = useToast();
  useEffect(() => {
    const onNotice = (e: Event) => {
      const { ok, message } = (e as CustomEvent<CloudPrintNotice>).detail;
      push(message, ok ? "success" : "error");
    };
    window.addEventListener(CLOUD_PRINT_EVENT, onNotice);
    return () => window.removeEventListener(CLOUD_PRINT_EVENT, onNotice);
  }, [push]);
  return null;
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
  /** Phone names, brands, IMEIs and warranties apply (not in a mini mart). */
  phoneShop: boolean;
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
  phoneShop: false,
  playEdition: false,
  refreshAuth: async () => {},
});

export function useAuth() {
  return useContext(AuthCtx);
}

/** The shop's main currency (MMK, USD or THB): totals, the till and the dashboard count in it. */
export function useCurrency(): string {
  return useContext(AuthCtx).me?.business?.currency ?? "MMK";
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
  { section: "/credit", perm: "credit.create", feature: "credit", label: "New credit record" },
  { section: "/income-expense", perm: "income_expense.create", feature: "incomeExpense", label: "New income or expense" },
  { section: "/customers", perm: "customer.manage", feature: "customers", label: "New customer" },
  { section: "/users", perm: "users.manage", feature: "users", label: "New user" },
];

interface NavTab { href: string; label: string; icon: typeof LayoutDashboard; perm: string; feature: FeatureKey }

/** Wallets and Transfer & Cash-out share one sidebar entry; the pages switch between them
 *  with tabs. Each tab keeps its own permission and module switch. The older Transfer
 *  (between the shop's wallets) and Withdraw (owner's money) pages are off the tabs: the
 *  shop's transfers and cash-outs are a service for customers only. */
const WALLET_TABS: NavTab[] = [
  { href: "/wallets", label: "Wallets", icon: Wallet, perm: "wallet.view", feature: "wallets" },
  // Customers' KBZPay / Wave transfers and cash-outs, with the shop's fee.
  { href: "/money-service", label: "Transfer & Cash-out", icon: ArrowLeftRight, perm: "wallet.transfer", feature: "transfers" },
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
  /** The sidebar heading it sits under. */
  section: NavSection;
  /** Shown indented under this entry (its href) in the sidebar, which can fold it away. */
  parent?: string;
  /** Pages of its own listed under it in the sidebar (the page also has them as tabs). */
  subs?: NavTab[];
  /** The sidebar name of the group it heads, when it has pages under it ("Sales", "Stock"). */
  group?: string;
}

type NavSection = "Workspace" | "Money" | "Online" | "Setup";
const SECTIONS: NavSection[] = ["Workspace", "Money", "Online", "Setup"];

/** Repair Jobs' own pages, listed under it in the sidebar. */
const REPAIR_SUBS: NavTab[] = [
  { href: "/repairs", label: "Repair Jobs", icon: Wrench, perm: "repair.view", feature: "repair" },
  { href: "/repairs/orders", label: "Order list", icon: ClipboardList, perm: "repair.view", feature: "repair" },
  { href: "/repairs/technicians", label: "Technicians", icon: Award, perm: "repair.view", feature: "repair" },
];

// The order here is the order of the phone's bottom bar (its first four) too.
const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view", section: "Workspace" },
  { href: "/pos", label: "Sales & POS", icon: ShoppingCart, perm: "sale.create", feature: "pos", section: "Workspace", group: "Sales" },
  { href: "/sales", label: "Sale History", short: "History", icon: History, perm: "sale.view", feature: "pos", section: "Workspace", parent: "/pos" },
  { href: "/repairs", label: "Repair Jobs", icon: Wrench, perm: "repair.view", feature: "repair", section: "Workspace", subs: REPAIR_SUBS, group: "Repairs" },
  { href: "/items", label: "Items", icon: Package, perm: "item.view", feature: "items", section: "Workspace", group: "Stock" },
  { href: "/purchases", label: "Purchases", icon: Truck, perm: "purchase.view", feature: "purchases", section: "Workspace", parent: "/items" },
  { href: "/customers", label: "Customers", icon: Users, perm: "customer.view", feature: "customers", section: "Workspace", group: "Customers" },
  { href: "/credit", label: "Credit & Payable", icon: HandCoins, perm: "credit.view", feature: "credit", section: "Workspace", parent: "/customers" },
  { href: "/wallets", label: "Wallets", icon: Wallet, perm: null, tabs: WALLET_TABS, section: "Money" },
  { href: "/income-expense", label: "Income & Expense", icon: Receipt, perm: "income_expense.view", feature: "incomeExpense", section: "Money" },
  { href: "/billers", label: "Top-up Billers", icon: Smartphone, perm: "biller.view", feature: "biller", section: "Money" },
  { href: "/reports", label: "Reports", icon: FileBarChart, perm: "report.view", feature: "reports", section: "Money" },
  // Running the online shop (its orders, prices and photos), not just seeing the items in it.
  { href: "/online-shop", label: "Online Shop", icon: Store, perm: "item.manage", feature: "onlineShop", section: "Online" },
  { href: "/telegram", label: "Telegram", icon: MessageCircle, perm: null, feature: "telegram", section: "Online" },
  { href: "/staff", label: "Staff Management", short: "Staff", icon: IdCard, perm: "staff.manage", feature: "staff", section: "Setup" },
  { href: "/users", label: "Users & Roles", icon: UserCog, perm: "users.manage", feature: "users", section: "Setup" },
  { href: "/settings", label: "Settings", icon: Settings, perm: "settings.manage", section: "Setup" },
  { href: "/audit", label: "Audit Logs", icon: ScrollText, perm: "audit.view", feature: "audit", section: "Setup" },
  { href: "/about", label: "About Us", icon: Info, perm: null, feature: "about", section: "Setup" },
];

/** Pages that want the whole width (the till, the repair list): the
 *  sidebar starts folded there and comes back with the menu button. */
const FOLDED_SIDEBAR = ["/pos", "/repairs"];

export function AppShell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  useShowCurrency(me?.business?.currency ?? "MMK");
  useAccountLanguage(me?.user.id, me?.business?.currency);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  // Sidebar groups opened or closed by hand (by label); otherwise a group is open while
  // one of its pages is the one shown.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // The desktop sidebar folds away on the pages that want the width (FOLDED_SIDEBAR)
  // and stays open elsewhere. The header button overrides that for the page you are on.
  const [sidebarPref, setSidebarPref] = useState<{ path: string; hidden: boolean } | null>(null);
  // Where a page's <PageHeader> puts its name (a callback ref, set once mounted).
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const pathname = usePathname();
  const sidebarHidden = sidebarPref?.path === pathname ? sidebarPref.hidden : FOLDED_SIDEBAR.some((p) => pathname.startsWith(p));
  const router = useRouter();

  const refreshAuth = useCallback(async () => {
    const next = await api<Me>("/api/v1/auth/me");
    setShopTimeZone(next.business?.timezone);
    setMe(next);
  }, []);

  // A shop kept on this device only (no account): its engine answers, no one signs in or out.
  const [deviceShop] = useState(() => typeof window !== "undefined" && isDeviceShop());
  const [deviceError, setDeviceError] = useState("");

  useEffect(() => {
    api<Me>("/api/v1/auth/me")
      // Before the first screen is drawn, so every time on it is in the shop's own zone.
      .then((next) => { setShopTimeZone(next.business?.timezone); setMe(next); })
      .catch((error) => {
        if (isDeviceShop()) setDeviceError(error instanceof Error ? error.message : String(error));
        else router.push("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  // A device shop brings its kept app up to date when there is internet and a new version.
  useEffect(() => {
    if (!deviceShop || !navigator.onLine) return;
    const timer = window.setTimeout(() => { refreshDeviceApp().catch(() => {}); }, 8000);
    return () => window.clearTimeout(timer);
  }, [deviceShop]);

  async function logout() {
    await api("/api/v1/auth/logout", { method: "POST" });
    // The kept screens and data are this shop's; the next person to sign in starts clean.
    // Sales kept on the device stay, under this user, until they sign in again.
    await clearOfflineCaches();
    router.push("/login");
  }

  // In sync mode, sales kept on the device while the internet was gone are sent by
  // themselves: when it comes back, on opening the app, and once a minute.
  const userId = me?.user.id;
  const branchId = me?.branches[0]?.id ?? "";
  useEffect(() => {
    if (!userId || deviceShop) return;
    tellServiceWorker();
    const run = () => {
      if (getNetMode() !== "sync" || !navigator.onLine) return;
      // Sales first, then repairs: each queue keeps its own order.
      const sales: Promise<unknown> = listQueued(userId).some((s) => s.status === "pending") ? syncQueued(userId).catch(() => {}) : Promise.resolve();
      sales.then(async () => { if (listRepairOps(userId).some((o) => o.status === "pending")) await syncRepairs(userId); else await topUpNumbers(userId); }).catch(() => {});
    };
    run();
    // Not online only: keep the till's offline copy current by itself (a new version of the
    // app or new prices), so it works without the internet even if Get ready was never
    // pressed again. At most every 10 minutes.
    const refresh = window.setTimeout(() => {
      const readyAt = offlineReadyAt();
      if (getNetMode() === "online" || !navigator.onLine || (readyAt && Date.now() - readyAt < 10 * 60_000)) return;
      prepareOffline(Object.values(posDataUrls(branchId)), OFFLINE_EXTRA_URLS).catch(() => {});
    }, 5000);
    window.addEventListener("online", run);
    const timer = window.setInterval(run, 60_000);
    return () => {
      window.removeEventListener("online", run);
      window.clearInterval(timer);
      window.clearTimeout(refresh);
    };
  }, [userId, branchId, deviceShop]);

  const miniMartEnabled = me?.modules.miniMartEnabled ?? false;
  const walletsEnabled = me?.modules.walletsEnabled ?? true;
  const playEdition = me?.edition === "PLAY";
  const featureEnabled = (feature: FeatureKey) => (me?.modules.features[feature] ?? false) && !(deviceShop && DEVICE_OFF.includes(feature));
  const blockedModulePath = [...NAV, ...WALLET_TABS].some(
    (item) =>
      item.feature &&
      pathname.startsWith(item.href) &&
      !featureEnabled(item.feature)
  );

  useEffect(() => {
    if (me && blockedModulePath) router.replace("/");
  }, [blockedModulePath, me, router]);

  useEffect(() => {
    setCloudPrintAllowed(me?.cloudPrint ?? false);
  }, [me]);

  if (deviceError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-medium">{"The shop on this device could not open."}</p>
        <p className="max-w-sm text-sm text-gray-500">{deviceError}</p>
        <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">{"Try again"}</button>
      </div>
    );
  }

  if (loading || !me) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gold-500" />
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
  // The page a user starts on: the Dashboard, or for someone without it (a technician) the
  // first page they may open. The language, sound and theme switches sit in its top bar.
  const homeHref = hasPerm("dashboard.view") ? "/" : visibleNav[0]?.href ?? "/";
  const pageName = groupTabs?.find((t) => pathname.startsWith(t.href))?.label ?? visibleNav.find(isActive)?.label ?? "";

  // "+" creates for whatever section is open, so it is only shown where that means
  // something and the user is allowed to do it.
  // The order list under Repairs adds from its own box, and "+" there would cover its button.
  const matchedCreate = pathname.startsWith("/repairs/orders") ? undefined : CREATE_ACTIONS.find(
    (action) => pathname === action.section || pathname.startsWith(`${action.section}/`)
  );
  const createAction =
    matchedCreate &&
    hasPerm(matchedCreate.perm) &&
    (!matchedCreate.feature || featureEnabled(matchedCreate.feature))
      ? matchedCreate
      : null;

  // Sidebar: headings (Workspace, Money…), each entry with its sub-pages under it. Tapping
  // the entry opens them (and goes to its page); tapping it again on its page closes them.
  // An entry whose parent this user cannot open stands on its own.
  const shownHrefs = new Set(NAV.filter((n) => visibleNav.some((v) => v.label === n.label)).map((n) => n.href));
  type Sub = { href: string; label: string; icon: typeof LayoutDashboard };
  const subsOf = (n: NavItem): Sub[] => {
    const own = NAV.find((x) => x.label === n.label);
    return [
      ...(own?.subs ?? []).filter(tabAllowed),
      ...(n.tabs && n.tabs.length > 1 ? n.tabs : []),
      ...visibleNav.filter((x) => x.parent && x.parent === own?.href),
    ];
  };
  // A page's own entry is lit only on that exact page; one under it lights for its sub-pages.
  const subActive = (k: Sub, group: NavItem) =>
    k.href === group.href || k.href === "/repairs" || k.href === "/wallets" ? pathname === k.href : pathname.startsWith(k.href);
  const linkClass = (active: boolean, sub: boolean) => cn(
    "flex items-center gap-2.5 rounded-md transition-colors",
    sub ? "px-3 py-1.5 text-[13px]" : "px-3 py-2 text-sm font-medium",
    active
      ? "bg-white/10 text-white shadow-[inset_3px_0_0_var(--color-gold-400)] [&>svg]:text-gold-400"
      : sub ? "text-slate-400 hover:bg-white/5 hover:text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
  );
  const navLink = (n: NavItem) => {
    const extra = subsOf(n);
    if (extra.length === 0) {
      return (
        <Link key={n.label} href={n.href} onClick={() => setDrawer(false)} className={linkClass(isActive(n), false)}>
          <n.icon size={17} />
          {n.label}
        </Link>
      );
    }
    // A group: its name only opens and closes it; its pages, the entry's own first, sit under it.
    const own = NAV.find((x) => x.label === n.label);
    const kids: Sub[] = [{ href: n.href, label: n.label, icon: n.icon }, ...extra].filter((k, i, all) => all.findIndex((x) => x.href === k.href) === i);
    const inGroup = kids.some((k) => subActive(k, n));
    const open = openGroups[n.label] ?? inGroup;
    return (
      <div key={n.label}>
        <button
          type="button"
          onClick={() => setOpenGroups((g) => ({ ...g, [n.label]: !open }))}
          aria-expanded={open}
          className={cn(linkClass(false, false), "w-full text-left", inGroup && !open && "text-white")}
        >
          <n.icon size={17} className={inGroup ? "text-gold-400" : undefined} />
          <span className="flex-1">{own?.group ?? n.label}</span>
          <ChevronDown size={14} className={cn("text-slate-500 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <div className="mt-0.5 space-y-0.5 pl-7">
            {kids.map((k) => (
              <Link key={k.href} href={k.href} onClick={() => setDrawer(false)} className={linkClass(subActive(k, n), true)}>
                <k.icon size={15} />
                {k.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };
  const sidebar = (
    <nav className="flex flex-col gap-0.5 p-3">
      {SECTIONS.map((section) => {
        const top = visibleNav.filter((n) => n.section === section && !(n.parent && shownHrefs.has(n.parent)));
        if (top.length === 0) return null;
        return (
          <div key={section} className="mb-2">
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{section}</p>
            {top.map((n) => navLink(n))}
          </div>
        );
      })}
      {deviceShop ? (
        <p className="mt-2 flex items-center gap-3 border-t border-white/10 px-3 py-2 text-xs text-slate-400">
          <HardDrive size={16} />{"This device only"}
        </p>
      ) : (
      <button
        type="button"
        onClick={logout}
        className="mt-2 flex items-center gap-3 rounded-lg border-t border-white/10 px-3 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white"
      >
        <LogOut size={18} />Sign out
      </button>
      )}
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
        phoneShop: isPhoneShop(me.modules),
        playEdition,
        refreshAuth,
      }}
    >
      <ToastProvider>
        <CloudPrintNotices />
        <div className="flex min-h-screen">
          {/* Desktop sidebar */}
          {/* Pinned to the screen and scrolled on its own, so the last items (Settings,
              Telegram) are reachable however many menu items a shop has turned on. */}
          <aside className={cn("no-print sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto border-r border-white/5 bg-navy-900 text-white", !sidebarHidden && "lg:block")}>
            <div className="flex items-center gap-2.5 border-b border-white/10 p-4">
              <div className="rounded-lg bg-white p-1 ring-2 ring-gold-500/60"><Image src="/mahar-pos-logo.svg" alt="Mahar Mini POS" width={24} height={24} /></div>
              <div className="min-w-0">
                <div className="font-bold leading-tight">Mahar <span className="text-gold-400">Mini POS</span></div>
                <div className="truncate text-xs text-slate-400">{me.user.name} · {me.user.roleName}</div>
              </div>
            </div>
            {sidebar}
          </aside>

          {/* Mobile drawer */}
          {drawer && (
            <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setDrawer(false)}>
              <aside className="h-full w-[min(18rem,88vw)] overflow-y-auto bg-navy-900 pb-[env(safe-area-inset-bottom)] text-white" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-white/10 p-4">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="shrink-0 rounded-lg bg-white p-1 ring-2 ring-gold-500/60"><Image src="/mahar-pos-logo.svg" alt="Mahar Mini POS" width={24} height={24} /></div>
                    <div className="min-w-0">
                      <div className="font-bold leading-tight">Mahar <span className="text-gold-400">Mini POS</span></div>
                      <div className="truncate text-xs text-slate-400">{me.user.name} · {me.user.roleName}</div>
                    </div>
                  </div>
                  <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10"><X size={20} /></button>
                </div>
                {/* Someone without the Dashboard (a technician) has no top bar with these on a
                    phone, so they sit at the top of the menu instead. */}
                {homeHref !== "/" && (
                  <div className="flex items-center gap-1 border-b border-white/10 bg-white px-3 py-2 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
                    <LanguageSwitch className="mr-1" />
                    <SoundToggle />
                    <ThemeToggle />
                  </div>
                )}
                {sidebar}
              </aside>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Top bar */}
            <header className="no-print relative z-30 flex min-h-11 items-center justify-between border-b border-gray-200 bg-white/90 px-3 py-1 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90 sm:px-4">
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
              {/* Language, sound, theme and sign out live on the first page only; other pages
                  keep the bar for their name. All of them are in the menu too. A first page
                  other than the Dashboard (Repairs, with its tabs) needs the bar on a phone,
                  so there they show on a wide screen only. */}
              {pathname === homeHref && (
              <div className={cn("shrink-0 items-center gap-1", homeHref === "/" ? "flex" : "hidden lg:flex")}>
                <LanguageSwitch className="mr-1" />
                <PwaInstall compact />
                <SoundToggle />
                <ThemeToggle />
                {!deviceShop && (
                  <button onClick={logout} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" title={`Sign out (${me.user.name} · ${me.user.roleName})`}>
                    <LogOut size={18} />
                  </button>
                )}
              </div>
              )}
            </header>

            <main className="min-w-0 flex-1 px-3 pb-24 pt-2 sm:px-4 sm:pt-2.5 lg:pb-6">
              {blockedModulePath ? (
                <div className="flex min-h-40 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gold-500" />
                </div>
              ) : (
                <>
                  <div className="mx-auto max-w-6xl"><AnnouncementBanner /></div>
                  {deviceShop && pathname === "/" && <div className="mx-auto max-w-6xl"><DeviceBackupReminder /></div>}
                  {groupTabs && groupTabs.length > 1 && (
                    <div className="no-print mx-auto mb-2.5 flex max-w-6xl gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
                      {groupTabs.map((t) => {
                        const on = pathname.startsWith(t.href);
                        return (
                          <Link
                            key={t.href}
                            href={t.href}
                            className={cn(
                              "flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition",
                              on ? "bg-white text-navy-900 shadow ring-1 ring-gold-500/40 dark:bg-gray-900 dark:text-gold-400" : "text-gray-600 hover:text-gray-900 dark:text-gray-300"
                            )}
                          >
                            <t.icon size={16} />{t.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                  <TopBarTitle.Provider value={titleSlot}>{children}</TopBarTitle.Provider>
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
                      "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium",
                      active ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
                    )}
                  >
                    {active && <span aria-hidden className="absolute top-0 h-[3px] w-8 rounded-b-full bg-gold-500" />}
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
                className="no-print fixed bottom-16 right-4 z-30 rounded-full bg-blue-600 p-3.5 text-white shadow-lg shadow-blue-600/30 ring-4 ring-white dark:ring-gray-950 lg:hidden"
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
