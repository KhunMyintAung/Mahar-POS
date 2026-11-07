"use client";

import { useState } from "react";
import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { Button, ConfirmDialog, Modal, cn, useToast } from "./ui";
import { useAuth } from "./AppShell";
import { fmtMoney } from "@/lib/format";
import { setNetMode, useNetMode, useOnline, type NetMode } from "@/lib/netMode";
import { removeQueued, syncQueued, useQueuedSales, type QueuedSale } from "@/lib/offlineSales";

const MODES: { value: NetMode; label: string; hint: string }[] = [
  { value: "online", label: "Online only", hint: "Every sale is sent at once. Without the internet a sale cannot be made." },
  { value: "sync", label: "Sync later", hint: "Sent at once when there is internet; without it the sale is kept on this device and sent by itself when the internet is back." },
  { value: "offline", label: "Offline", hint: "Sales are kept on this device and sent only when you press Sync now." },
];

/** The till's connection: the mode for this device, whether it is online, and the sales kept
 *  on it waiting to be sent, with Sync now and the ones the server refused. */
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

  const current = MODES.find((m) => m.value === mode)!;
  return (
    <div className="no-print mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900">
      <span className={cn("inline-flex items-center gap-1 font-medium", online ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400")}>
        {online ? <Wifi size={16} /> : <CloudOff size={16} />}
        {online ? "Connected" : "No internet"}
      </span>
      <div className="inline-flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-700" role="radiogroup" aria-label="Connection mode">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            title={m.hint}
            onClick={() => setNetMode(m.value)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium",
              mode === m.value ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <span className="hidden text-xs text-gray-500 md:inline">{current.hint}</span>
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
