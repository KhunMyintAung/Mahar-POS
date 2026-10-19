"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button, Card, Input, Spinner, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { RepairVoucherSettingsCard } from "@/components/RepairVoucherSettingsCard";
import {
  defaultFeaturesForMode,
  FEATURE_DEFINITIONS,
  FEATURE_GROUPS,
  moduleSettingFromFeatures,
  parseModuleAccess,
  type FeatureVisibility,
} from "@/lib/modules";
interface SettingsData {
  business: { id: string; name: string; phone?: string; address?: string; telegram?: string; website?: string; currency: string; timezone: string };
  settings: Record<string, Record<string, unknown>>;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [biz, setBiz] = useState({ name: "", phone: "", address: "", telegram: "", website: "" });
  const [features, setFeatures] = useState<FeatureVisibility>(
    defaultFeaturesForMode("WALLET_ONLY")
  );
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { push } = useToast();
  const { refreshAuth, me, featureEnabled } = useAuth();

  async function deleteBusiness() {
    setDeleting(true);
    try {
      await api("/api/v1/account/delete", { method: "POST", body: { confirmName: deleteConfirm.trim() } });
      // The account no longer exists, so there is nothing to return to — leave the app
      // entirely rather than routing to a page that would fail to load.
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
      });
      setFeatures(parseModuleAccess(d.settings.modules ?? { miniMartEnabled: true }).features);
    }).catch((e) => push(e.message, "error"));
  }, [push]);
  useEffect(load, [load]);

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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">Settings</h1>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Business profile</h3>
        <div className="space-y-3">
          <Input label="Business name" value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Phone" value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} />
            <Input label="Telegram" value={biz.telegram} onChange={(e) => setBiz({ ...biz, telegram: e.target.value })} />
          </div>
          <Input label="Address" value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} />
          <Input label="Website" value={biz.website} onChange={(e) => setBiz({ ...biz, website: e.target.value })} />
          <p className="text-xs text-gray-500">Default currency: {data.business.currency} · Time zone: {data.business.timezone}</p>
          <Button disabled={busy} onClick={() => save(() => api("/api/v1/settings", { method: "PATCH", body: biz }))}>Save profile</Button>
        </div>
      </Card>

      {featureEnabled("repair") && <RepairVoucherSettingsCard />}

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
    </div>
  );
}
