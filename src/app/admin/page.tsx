"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, RefreshCw, Search, ShieldCheck, UserCheck, UserPlus, Users, Wallet } from "lucide-react";
import { Button, Card, Select, Spinner } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

interface AdminStats {
  registeredAccounts: number;
  registeredUsers: number;
  enabledUsers: number;
  activeUsers: number;
  registeredToday: number;
  registrationAuditRecords: number;
  /** False when nobody is signed in: the figures are there, the lists are not. */
  detailed: boolean;
  users: {
    id: string;
    name: string;
    username: string;
    businessName: string;
    active: boolean;
    registeredToday: boolean;
    hasValidSession: boolean;
    lastSessionAt: string | null;
    createdAt: string;
  }[];
  activityLogs: {
    id: string;
    // Null unless an admin is signed in: the feed is public, the names are not.
    businessName: string | null;
    userDisplayName: string | null;
    username: string | null;
    action: string;
    module: string;
    resourceType: string | null;
    reason: string | null;
    createdAt: string;
  }[];
  updatedAt: string;
}

const stats = [
  { key: "registeredAccounts", label: "Registered Accounts", icon: Building2, tone: "text-blue-600 dark:text-blue-400" },
  { key: "registeredUsers", label: "Registered Users", icon: Users, tone: "text-gray-700 dark:text-gray-200" },
  { key: "activeUsers", label: "Valid Login Sessions", icon: ShieldCheck, tone: "text-green-600 dark:text-green-400" },
  { key: "enabledUsers", label: "Enabled Users", icon: UserCheck, tone: "text-teal-600 dark:text-teal-400" },
  { key: "registeredToday", label: "Registered Today", icon: UserPlus, tone: "text-amber-600 dark:text-amber-400" },
  { key: "registrationAuditRecords", label: "Registration Audit Records", icon: UserPlus, tone: "text-violet-600 dark:text-violet-400" },
] as const;

export default function AdminPage() {
  // null until the first response arrives, so the page does not flash empty figures.
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [data, setData] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [passcode, setPasscode] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [userScope, setUserScope] = useState<"all" | "today">("all");
  const [activityQuery, setActivityQuery] = useState("");
  const [activityAction, setActivityAction] = useState("");
  const userAuditRef = useRef<HTMLElement>(null);
  const activityAuditRef = useRef<HTMLElement>(null);

  // Access follows from the signed-in account alone. Nothing is typed to get in.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/stats", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "Unable to load statistics");
      setData(body.data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load statistics");
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, []);

  const unlock = useCallback(async () => {
    setUnlocking(true);
    setUnlockError("");
    try {
      const response = await fetch("/api/admin/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error || "Wrong passcode.");
      setPasscode("");
      // The cookie is set; the same endpoint now answers with the names filled in.
      await load();
    } catch (unlockFailure) {
      setUnlockError(unlockFailure instanceof Error ? unlockFailure.message : "Wrong passcode.");
    } finally {
      setUnlocking(false);
    }
  }, [passcode, load]);

  // Load on mount and keep it fresh. Deferred so the fetch does not set state during the
  // effect body.
  useEffect(() => {
    const firstLoad = window.setTimeout(() => load(), 0);
    const timer = window.setInterval(() => load(), 30_000);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(timer);
    };
  }, [load]);

  const openUserAudit = (scope: "all" | "today") => {
    setUserScope(scope);
    window.requestAnimationFrame(() => {
      userAuditRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const openActivityAudit = () => {
    window.requestAnimationFrame(() => {
      activityAuditRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const needle = query.trim().toLowerCase();
  const scopedUsers = (data?.users ?? []).filter((user) => userScope === "all" || user.registeredToday);
  const visibleUsers = scopedUsers.filter((user) =>
    !needle ||
    user.username.toLowerCase().includes(needle) ||
    user.name.toLowerCase().includes(needle) ||
    user.businessName.toLowerCase().includes(needle)
  );
  const named = data?.detailed ?? false;
  const activityNeedle = activityQuery.trim().toLowerCase();
  const activityActions = [...new Set((data?.activityLogs ?? []).map((log) => log.action))].sort();
  const visibleActivity = (data?.activityLogs ?? []).filter((log) =>
    (!activityAction || log.action === activityAction) &&
    (!activityNeedle ||
      log.username?.toLowerCase().includes(activityNeedle) ||
      log.userDisplayName?.toLowerCase().includes(activityNeedle) ||
      log.businessName?.toLowerCase().includes(activityNeedle) ||
      log.module.toLowerCase().includes(activityNeedle) ||
      log.resourceType?.toLowerCase().includes(activityNeedle))
  );

  // Wait for the first response rather than flashing zeroes.
  if (!loadedOnce) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
        <Spinner />
      </main>
    );
  }

  // The figures are open to anyone; the names behind them are not. Whoever runs the
  // platform types the passcode once and the page fills in.
  if (!named) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
        <Card className="w-full max-w-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-600 p-2 text-white"><Wallet size={20} /></div>
            <div>
              <h1 className="font-bold">Grand Admin Portal</h1>
              <p className="text-xs text-gray-500">Enter the passcode to continue</p>
            </div>
          </div>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              unlock();
            }}
          >
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              autoFocus
              autoComplete="current-password"
              placeholder="Passcode"
              className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
            {unlockError && <p className="text-sm text-red-600">{unlockError}</p>}
            <Button type="submit" className="w-full" disabled={unlocking || !passcode}>
              {unlocking ? "Checking…" : "Unlock"}
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-4 dark:bg-gray-950 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4 dark:border-gray-800">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-lg bg-blue-600 p-2 text-white">
              <Wallet size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold">Mahar Mini POS Admin</h1>
              <p className="text-xs text-gray-500">Registration and user activity</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw size={15} className={`mr-1.5 inline ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {stats.map((item) => {
            const Icon = item.icon;
            const content = (
              <Card className="min-h-28">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium text-gray-500">{item.label}</span>
                  <Icon size={18} className={item.tone} />
                </div>
                <div className={`mt-4 text-3xl font-bold tabular-nums ${item.tone}`}>
                  {data ? data[item.key].toLocaleString() : "-"}
                </div>
              </Card>
            );

            if (item.key === "registeredAccounts") {
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => openUserAudit("all")}
                  aria-label="Show all registered user details"
                  className="text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {content}
                </button>
              );
            }

            if (item.key === "registeredToday") {
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => openUserAudit("today")}
                  aria-label="Show users registered today"
                  className="text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {content}
                </button>
              );
            }

            if (item.key === "registrationAuditRecords") {
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={openActivityAudit}
                  aria-label="Show activity audit logs"
                  className="text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {content}
                </button>
              );
            }

            return <div key={item.key}>{content}</div>;
          })}
        </section>

        <div className="grid items-start gap-4 xl:grid-cols-2">
        {named && <section ref={userAuditRef} className="scroll-mt-4 border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
            <div>
              <h2 className="text-sm font-semibold">
                {userScope === "today" ? "Registered Today User Details" : "Registered User Audit"}
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {userScope === "today"
                  ? "Users registered since midnight today."
                  : "PostgreSQL user records, newest first. A valid session does not necessarily mean the user is online now."}
              </p>
            </div>
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[auto_18rem]">
              <div className="flex rounded-lg border border-gray-300 p-1 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setUserScope("all")}
                  className={`min-h-8 px-3 text-xs font-semibold ${userScope === "all" ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-300"}`}
                >
                  All users
                </button>
                <button
                  type="button"
                  onClick={() => setUserScope("today")}
                  className={`min-h-8 px-3 text-xs font-semibold ${userScope === "today" ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-300"}`}
                >
                  Today
                </button>
              </div>
              <label className="relative">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search username, owner, business"
                  className="min-h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-800"
                />
              </label>
            </div>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-950">
                <tr>
                  <th className="px-4 py-3 font-medium">Business</th>
                  <th className="px-4 py-3 font-medium">Owner name</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Login session</th>
                  <th className="px-4 py-3 font-medium">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {visibleUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium">{user.businessName}</td>
                    <td className="px-4 py-3">{user.name}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-blue-700 dark:text-blue-400">{user.username}</td>
                    <td className="px-4 py-3">
                      <span className={user.active ? "text-green-700 dark:text-green-400" : "text-red-600"}>
                        {user.active ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={user.hasValidSession ? "text-green-700 dark:text-green-400" : "text-gray-400"}>
                        {user.hasValidSession ? "Valid" : "None"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{fmtDateTime(user.createdAt)}</td>
                  </tr>
                ))}
                {!loading && visibleUsers.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No registered users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="border-t border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-800">
            Showing {visibleUsers.length.toLocaleString()} of {scopedUsers.length.toLocaleString()} {userScope === "today" ? "users registered today" : "loaded users"}
          </footer>
        </section>}

        <section ref={activityAuditRef} className="scroll-mt-4 border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <header className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
            <div>
              <h2 className="text-sm font-semibold">Activity Audit Logs</h2>
              <p className="mt-1 text-xs text-gray-500">
                Latest 500 activities across registered businesses.
                {!named && " Sign in as an admin to see which business and who."}
              </p>
            </div>
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[18rem_12rem]">
              <label className="relative">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                <input
                  value={activityQuery}
                  onChange={(event) => setActivityQuery(event.target.value)}
                  placeholder="Search username, business, module"
                  className="min-h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-800"
                />
              </label>
              <Select value={activityAction} onChange={(event) => setActivityAction(event.target.value)}>
                <option value="">All actions</option>
                {activityActions.map((action) => <option key={action} value={action}>{action}</option>)}
              </Select>
            </div>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-950">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  {named && <th className="px-4 py-3 font-medium">Business</th>}
                  {named && <th className="px-4 py-3 font-medium">User</th>}
                  {named && <th className="px-4 py-3 font-medium">Username</th>}
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Module</th>
                  <th className="px-4 py-3 font-medium">Resource</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {visibleActivity.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{fmtDateTime(log.createdAt)}</td>
                    {named && <td className="px-4 py-3 font-medium">{log.businessName}</td>}
                    {named && <td className="px-4 py-3">{log.userDisplayName}</td>}
                    {named && <td className="px-4 py-3 font-mono font-semibold text-blue-700 dark:text-blue-400">{log.username}</td>}
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold dark:bg-gray-800">{log.action}</span>
                    </td>
                    <td className="px-4 py-3">{log.module}</td>
                    <td className="px-4 py-3 text-gray-500">{log.resourceType ?? "-"}</td>
                  </tr>
                ))}
                {!loading && visibleActivity.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No activity logs found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="border-t border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-800">
            Showing {visibleActivity.length.toLocaleString()} of {(data?.activityLogs.length ?? 0).toLocaleString()} loaded activities
          </footer>
        </section>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
          <span>Auto refresh: 30 seconds</span>
          <span>{data ? `Updated ${fmtDateTime(data.updatedAt)}` : "Loading..."}</span>
        </div>
      </div>
    </main>
  );
}
