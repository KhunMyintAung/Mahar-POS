"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Coins, FileSpreadsheet, LayoutList, LocateFixed, Printer, Store, UserCircle } from "lucide-react";
import { Button, Card, Input, Spinner, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { RepairVoucherSettingsCard } from "@/components/RepairVoucherSettingsCard";
import { BusinessLogoCard } from "@/components/BusinessLogoCard";
import { WarrantySettingsCard } from "@/components/WarrantySettingsCard";
import { BranchesCard } from "@/components/BranchesCard";
import { PrinterPaperCard } from "@/components/PrinterPaperCard";
import { GsheetSyncCard } from "@/components/GsheetSyncCard";
import { MspRewardsCard, type MspRewardSummary } from "@/components/MspRewardsCard";
import {
  defaultFeaturesForMode,
  FEATURE_DEFINITIONS,
  FEATURE_GROUPS,
  moduleSettingFromFeatures,
  parseModuleAccess,
  type FeatureVisibility,
} from "@/lib/modules";
import { PageHeader } from "@/components/PageHeader";
interface SettingsData {
  business: { id: string; name: string; logoUrl?: string | null; phone?: string; address?: string; telegram?: string; website?: string; websiteLabel?: string | null; city?: string | null; latitude?: number | null; longitude?: number | null; currency: string; timezone: string };
  settings: Record<string, Record<string, unknown>>;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [rewards, setRewards] = useState<MspRewardSummary | null>(null);
  const [biz, setBiz] = useState({
    name: "", phone: "", address: "", telegram: "", website: "", websiteLabel: "", city: "",
    latitude: null as number | null, longitude: null as number | null,
  });
  const [locating, setLocating] = useState(false);
  const [features, setFeatures] = useState<FeatureVisibility>(
    defaultFeaturesForMode("WALLET_ONLY")
  );
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState("shop");

  // The open tab lives in the URL hash, so a reload or a shared link lands on the same one.
  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (fromHash) {
      const timer = window.setTimeout(() => setTab(fromHash), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);
  function selectTab(key: string) {
    setTab(key);
    window.history.replaceState(null, "", `#${key}`);
  }
  const { push } = useToast();
  const { refreshAuth, me, featureEnabled, phoneShop } = useAuth();

  async function deleteBusiness() {
    setDeleting(true);
    try {
      await api("/api/v1/account/delete", { method: "POST", body: { confirmName: deleteConfirm.trim() } });
      // The account no longer exists, so there is nothing to return to — leave the app
      // entirely rather than routing to a page that would fail to load.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load: the account is gone
      window.location.href = "/login";
    } catch (e) {
      push(e instanceof Error ? e.message : "Delete failed", "error");
      setDeleting(false);
    }
  }

  const load = useCallback(() => {
    api<SettingsData>("/api/v1/settings").then((d) => {
      setData(d);
      setBiz({
        name: d.business.name ?? "", phone: d.business.phone ?? "", address: d.business.address ?? "",
        telegram: d.business.telegram ?? "", website: d.business.website ?? "",
        websiteLabel: d.business.websiteLabel ?? "", city: d.business.city ?? "",
        latitude: d.business.latitude ?? null, longitude: d.business.longitude ?? null,
      });
      setFeatures(parseModuleAccess(d.settings.modules ?? { miniMartEnabled: true }).features);
    }).catch((e) => push(e.message, "error"));
  }, [push]);
  useEffect(load, [load]);
  useEffect(() => {
    api<MspRewardSummary>("/api/v1/msp/rewards").then(setRewards).catch(() => setRewards(null));
  }, []);

  /** Pins the shop where this device is now and fills in the city (and the address, when it
   *  is still empty) from the map. */
  function locateShop() {
    if (!navigator.geolocation) { push("This browser cannot share its location", "error"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const latitude = Math.round(pos.coords.latitude * 1e6) / 1e6;
      const longitude = Math.round(pos.coords.longitude * 1e6) / 1e6;
      try {
        const place = await api<{ city: string; address: string }>(`/api/v1/settings/geocode?lat=${latitude}&lng=${longitude}`);
        setBiz((b) => ({ ...b, latitude, longitude, city: place.city || b.city, address: b.address || place.address }));
        push(place.city ? `Location found: ${place.city}` : "Location found");
      } catch {
        setBiz((b) => ({ ...b, latitude, longitude }));
        push("Location found");
      } finally {
        setLocating(false);
      }
    }, (err) => {
      setLocating(false);
      push(err.code === err.PERMISSION_DENIED ? "Location permission was blocked. Allow it in the browser and try again." : "Could not get the location", "error");
    }, { enableHighAccuracy: true, timeout: 15000 });
  }

  async function save(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      push("Settings saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  /** Switches the Users & Roles menu on and opens it. */
  async function showUsers() {
    const next = { ...features, users: true };
    try {
      await api("/api/v1/settings", { method: "PUT", body: { key: "modules", value: moduleSettingFromFeatures(next) } });
      setFeatures(next);
      await refreshAuth();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load rebuilds the menus for the new modules
      window.location.href = "/users";
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function saveModules() {
    setBusy(true);
    try {
      await api("/api/v1/settings", {
        method: "PUT",
        body: { key: "modules", value: moduleSettingFromFeatures(features) },
      });
      await refreshAuth();
      push("Module setting saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Spinner />;

  // One section at a time instead of one long page. Printing appears only for shops that
  // print vouchers or warranty cards.
  const hasPrinting = featureEnabled("pos") || featureEnabled("repair");
  const tabs = [
    { key: "shop", label: "Shop", icon: Store },
    ...(hasPrinting ? [{ key: "printing", label: "Printing", icon: Printer }] : []),
    ...(featureEnabled("reports") ? [{ key: "sheets", label: "Google Sheet", icon: FileSpreadsheet }] : []),
    { key: "points", label: "Points", icon: Coins },
    { key: "menu", label: "Menu", icon: LayoutList },
    { key: "account", label: "Account", icon: UserCircle },
  ] as const;
  const current = tabs.some((t) => t.key === tab) ? tab : "shop";

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <PageHeader title={<>Settings</>} />

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => selectTab(t.key)}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition",
              current === t.key ? "bg-white text-blue-600 shadow dark:bg-gray-900" : "text-gray-600 hover:text-gray-900 dark:text-gray-300"
            )}
          >
            <t.icon size={16} />{t.label}
          </button>
        ))}
      </div>

      {current === "shop" && <>
      <Card>
        <h3 className="mb-3 text-sm font-semibold">Business profile</h3>
        <div className="space-y-3">
          <Input label="Business name" value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Phone" value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} />
            <Input label="Telegram" value={biz.telegram} onChange={(e) => setBiz({ ...biz, telegram: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Input label="Address" value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} />
            </div>
            <Input label="City" value={biz.city} onChange={(e) => setBiz({ ...biz, city: e.target.value })} />
          </div>

          <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Shop location</div>
                <div className="text-xs text-gray-500">
                  {biz.latitude != null && biz.longitude != null ? `${biz.latitude}, ${biz.longitude}` : "Not pinned yet"}
                </div>
              </div>
              <div className="flex gap-2">
                {biz.latitude != null && (
                  <Button size="sm" variant="ghost" onClick={() => setBiz({ ...biz, latitude: null, longitude: null })}>Remove</Button>
                )}
                <Button size="sm" variant="secondary" disabled={locating} onClick={locateShop}>
                  <LocateFixed size={14} className="mr-1 inline" />{locating ? "Finding…" : "Use my current location"}
                </Button>
              </div>
            </div>
            {biz.latitude != null && biz.longitude != null && (
              <iframe
                title="Shop location"
                className="h-48 w-full rounded-lg border-0"
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${biz.longitude - 0.004},${biz.latitude - 0.003},${biz.longitude + 0.004},${biz.latitude + 0.003}&layer=mapnik&marker=${biz.latitude},${biz.longitude}`}
              />
            )}
            <p className="text-xs text-gray-500">Press the button while you are at the shop. The repair QR page&apos;s location button opens this spot.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Website" value={biz.website} placeholder="maharpos.shop" onChange={(e) => setBiz({ ...biz, website: e.target.value })} />
            <Input label="Website button text" value={biz.websiteLabel} placeholder="Online Shop" onChange={(e) => setBiz({ ...biz, websiteLabel: e.target.value })} />
          </div>
          <p className="-mt-1 text-xs text-gray-500">
            The website button on the repair QR page shows this text, for example Game Shop or Visit Our Website.
          </p>
          <p className="text-xs text-gray-500">{`Default currency: ${data.business.currency} · Time zone: ${data.business.timezone}`}</p>
          <Button disabled={busy} onClick={() => save(() => api("/api/v1/settings", { method: "PATCH", body: biz }))}>Save profile</Button>
        </div>
      </Card>

      <BusinessLogoCard initial={data.business.logoUrl ?? null} onSaved={() => { refreshAuth(); }} />

      <BranchesCard usersOn={featureEnabled("users")} onShowUsers={showUsers} />
      </>}

      {current === "printing" && <>
      <PrinterPaperCard />

      {featureEnabled("repair") && <RepairVoucherSettingsCard />}

      {/* Phone warranties (new and second-hand); a mini mart sells none. */}
      {featureEnabled("pos") && phoneShop && <WarrantySettingsCard />}
      </>}

      {current === "sheets" && <GsheetSyncCard />}

      {current === "points" && rewards && <MspRewardsCard initial={rewards} onChange={(r) => { setRewards(r); refreshAuth(); }} />}

      {current === "menu" && (
      <Card>
        <h3 className="text-sm font-semibold">Sidebar functions</h3>
        {FEATURE_GROUPS.map((group) => (
          <div key={group} className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">{group}</h4>
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
              {FEATURE_DEFINITIONS
                .filter((item) => item.group === group)
                .map((item) => (
                <div key={item.key} className="flex min-h-12 items-center justify-between gap-4 px-3 py-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{item.label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={features[item.key]}
                    aria-label={`${item.label} ${features[item.key] ? "on" : "off"}`}
                    onClick={() =>
                      setFeatures((current) => ({
                        ...current,
                        [item.key]: !current[item.key],
                      }))
                    }
                    className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                      features[item.key] ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${
                        features[item.key] ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>
                ))}
            </div>
          </div>
        ))}
        <Button className="mt-3" disabled={busy} onClick={saveModules}>
          Save sidebar functions
        </Button>
      </Card>
      )}

      {current === "account" && <>
      <Card>
        <h3 className="text-sm font-semibold">Privacy and account</h3>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link className="font-medium text-blue-600 hover:text-blue-700" href="/privacy">Privacy policy</Link>
          <Link className="font-medium text-red-600 hover:text-red-700" href="/account-deletion">Request account deletion</Link>
        </div>
      </Card>

      {me?.user.roleName === "Owner" && (
        <Card className="border-red-300 dark:border-red-900">
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">Delete this business</h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Erases this business and everything in it — wallets and their history, credits,
            sales, purchases, stock, records, users and audit logs. It happens immediately
            and cannot be undone, and there is no copy afterwards.
          </p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Type <b>{data.business.name}</b> to confirm.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Input
                label="Business name"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={data.business.name}
              />
            </div>
            <Button
              variant="danger"
              disabled={deleting || deleteConfirm.trim().toLowerCase() !== data.business.name.trim().toLowerCase()}
              onClick={deleteBusiness}
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </Card>
      )}
      </>}
    </div>
  );
}
