"use client";

import { useState } from "react";
import { CloudOff, Download, RefreshCw, Wifi } from "lucide-react";
import { Button, Card, ConfirmDialog, Modal, cn, useToast } from "./ui";
import { useAuth } from "./AppShell";
import { fmtMoney } from "@/lib/format";
import { prepareOffline, setNetMode, useNetMode, useOfflineReadyAt, useOnline, type NetMode } from "@/lib/netMode";
import { removeQueued, syncQueued, useQueuedSales, type QueuedSale } from "@/lib/offlineSales";
import { posDataUrls } from "@/lib/posData";
import { useInstalledApp } from "@/lib/installedApp";

const MODES: { value: NetMode; label: string; hint: string }[] = [
  { value: "online", label: "Online only", hint: "Every sale is sent at once. Without the internet a sale cannot be made." },
  { value: "sync", label: "Sync later", hint: "Sent at once when there is internet; without it the sale is kept on this device and sent by itself when the internet is back." },
  { value: "offline", label: "Offline", hint: "Sales are kept on this device and sent only when you press Sync now." },
];

/** Settings → Account: how this device's till uses the internet. Kept in this browser, as each
 *  counter's connection differs. */
export function NetModeCard() {
  const mode = useNetMode();
  const online = useOnline();
  const installed = useInstalledApp();
  const readyAt = useOfflineReadyAt();
  const { me, defaultBranchId } = useAuth();
  const queued = useQueuedSales(me?.user.id);
  const { push } = useToast();
  const [preparing, setPreparing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function prepare() {
    setPreparing(true);
    try {
      const ok = await prepareOffline(Object.values(posDataUrls(defaultBranchId)));
      push(ok ? "This device is ready to sell offline" : "Could not get ready. Open the app once with the internet, then try again.", ok ? "success" : "error");
    } finally {
      setPreparing(false);
    }
  }

  async function syncNow() {
    if (!me) return;
    setSyncing(true);
    try {
      const r = await syncQueued(me.user.id, { retryFailed: true });
      if (r.stopped === "offline") push("No internet. The sales stay on this device.", "error");
      else if (r.stopped) push("The server could not take them now. Try again shortly.", "error");
      else if (r.failed > 0) push(`${r.sent} sent, ${r.failed} need checking`, "error");
      else push(`${r.sent} sales sent`, "success");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{"Internet connection (this device)"}</h3>
        <p className="mt-1 text-xs text-gray-500">{"How the till on this device sells when the internet is weak or gone."}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Connection mode">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            disabled={!installed && m.value !== "online"}
            onClick={() => { setNetMode(m.value); push(m.label); }}
            className={cn(
              "rounded-lg border-2 px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
              mode === m.value ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40" : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
            )}
          >
            <span className="block text-sm font-semibold">{m.label}{m.value === "online" && <span className="ml-1 text-xs font-normal text-gray-500">{"(default)"}</span>}</span>
            <span className="mt-1 block text-xs text-gray-500">{m.hint}</span>
          </button>
        ))}
      </div>
      {!installed && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{"Sync later and Offline work in the installed app only: the app on the phone's home screen, the app installed on the computer, or the Android app. A browser tab is always Online only."}</p>
      )}

      <div className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800/60">
        <p className={cn("flex items-center gap-1 font-medium", online ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400")}>
          {online ? <Wifi size={16} /> : <CloudOff size={16} />}{online ? "Connected" : "No internet"}
        </p>
        {mode !== "online" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-600 dark:text-gray-300">
              {readyAt ? <>{"Ready offline since"} {new Date(readyAt).toLocaleString()}</> : "Not ready offline yet: press Get ready while connected."}
            </span>
            <Button size="sm" variant="secondary" className="ml-auto" onClick={prepare} disabled={preparing || !online}>
              <Download size={14} className="mr-1 inline" />{preparing ? "Getting ready..." : "Get ready for offline"}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-600 dark:text-gray-300">
            {queued.length === 0 ? "Every sale has been sent." : <>{queued.length} {"sales on this device not sent yet"}</>}
          </span>
          {queued.length > 0 && (
            <Button size="sm" className="ml-auto" onClick={syncNow} disabled={syncing || !online}>
              <RefreshCw size={14} className={cn("mr-1 inline", syncing && "animate-spin")} />{"Sync now"}
            </Button>
          )}
        </div>
      </div>
      {mode !== "online" && (
        <p className="text-xs text-gray-500">{"Offline works for selling at the POS. Repairs, purchases, reports and settings need the internet."}</p>
      )}
    </Card>
  );
}

/** The till's connection on the POS: shown when there is no internet or sales are kept on
 *  the device waiting to be sent, with Sync now and the ones the server refused. */
export function NetModeBar() {
  const { me } = useAuth();
  const userId = me?.user.id;
  const mode = useNetMode();
  const online = useOnline();
  const queued = useQueuedSales(userId);
  const { push } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [removing, setRemoving] = useState<QueuedSale | null>(null);
  const pending = queued.filter((s) => s.status === "pending").length;
  const failed = queued.filter((s) => s.status === "failed").length;

  async function syncNow() {
    if (!userId) return;
    setSyncing(true);
    try {
      const r = await syncQueued(userId, { retryFailed: true });
      if (r.stopped === "offline") push("No internet. The sales stay on this device.", "error");
      else if (r.stopped === "signed-out") push("Sign in again to send the sales.", "error");
      else if (r.stopped === "server") push("The server could not take them now. Try again shortly.", "error");
      else if (r.failed > 0) { push(`${r.sent} sent, ${r.failed} need checking`, "error"); setListOpen(true); }
      else push(`${r.sent} sales sent`, "success");
    } finally {
      setSyncing(false);
    }
  }

  // Shown only when there is something to say: no internet, or sales waiting on the device.
  // The mode itself is chosen in Settings.
  if (online && queued.length === 0 && mode !== "offline") return null;
  const current = MODES.find((m) => m.value === mode)!;
  return (
    <div className="no-print mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/30">
      <span className={cn("inline-flex items-center gap-1 font-medium", online ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400")}>
        {online ? <Wifi size={16} /> : <CloudOff size={16} />}
        {online ? "Connected" : "No internet"}
      </span>
      <span className="text-xs text-gray-600 dark:text-gray-300">{current.label}</span>
      {queued.length > 0 && (
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setListOpen(true)} className="text-xs font-medium text-amber-700 underline dark:text-amber-400">
            {pending > 0 && <>{pending} {"waiting to send"}</>}
            {pending > 0 && failed > 0 && " · "}
            {failed > 0 && <span className="text-red-600">{failed} {"need checking"}</span>}
          </button>
          <Button size="sm" variant="secondary" onClick={syncNow} disabled={syncing}>
            <RefreshCw size={14} className={cn("mr-1 inline", syncing && "animate-spin")} />{"Sync now"}
          </Button>
        </span>
      )}

      <Modal open={listOpen} onClose={() => setListOpen(false)} title="Sales on this device" wide>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
          {"These sales were made without the internet. They are not in the shop's books, stock or wallets until they are sent."}
        </p>
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {queued.map((s) => (
            <li key={s.clientRef} className="flex flex-wrap items-center gap-2 p-2 text-sm">
              <span className="font-mono">{s.receipt.txnNo}</span>
              <span className="text-gray-500">{new Date(s.at).toLocaleString()}</span>
              <span className="font-medium">{fmtMoney(s.total)} MMK</span>
              <span className={cn("rounded px-1.5 text-xs", s.status === "failed" ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200")}>
                {s.status === "failed" ? "Not accepted" : "Waiting"}
              </span>
              {s.error && <span className="w-full text-xs text-red-600">{s.error}</span>}
              {s.status === "failed" && (
                <Button size="sm" variant="ghost" className="ml-auto text-red-600" onClick={() => setRemoving(s)}>{"Remove"}</Button>
              )}
            </li>
          ))}
          {queued.length === 0 && <li className="p-3 text-sm text-gray-500">{"Nothing waiting. Every sale has been sent."}</li>}
        </ul>
        <div className="mt-3 flex justify-end">
          <Button onClick={syncNow} disabled={syncing || queued.length === 0}>
            <RefreshCw size={14} className={cn("mr-1 inline", syncing && "animate-spin")} />{"Sync now"}
          </Button>
        </div>
      </Modal>
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => { if (userId && removing) removeQueued(userId, removing.clientRef); setRemoving(null); }}
        title="Remove this sale?"
        message="It was never recorded, and it will not be. Ring it up again at the till if the customer still bought it, so the stock and the money stay right."
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
