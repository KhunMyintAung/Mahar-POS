"use client";

import { useEffect, useState } from "react";
import { Coins, ExternalLink } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, Input, cn, useToast } from "@/components/ui";

interface Status {
  configured: boolean; contract: string | null; minter: string | null; explorer: string | null;
  pending: string; sending: string; minted: string; problem: string | null;
}

/** Settings → Points: the shop's Mahar Shwe Point (MSP) switch and earning rate, and what
 *  it has given out so far. Customers get their points in their own BNB Chain wallet,
 *  entered on the customer's page. */
export function MspSettingsCard({ initial, currency }: { initial: Record<string, unknown> | undefined; currency: string }) {
  const { push } = useToast();
  const [enabled, setEnabled] = useState(Boolean(initial?.enabled));
  const [perPoint, setPerPoint] = useState(String(initial?.perPoint ?? 1000));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    api<Status>("/api/v1/msp").then(setStatus).catch(() => setStatus(null));
  }, []);

  async function save() {
    const n = Number(perPoint);
    if (!Number.isInteger(n) || n < 1) { push("Enter a whole amount of 1 or more", "error"); return; }
    setBusy(true);
    try {
      await api("/api/v1/settings", { method: "PUT", body: { key: "msp", value: { enabled, perPoint: n } } });
      push("Settings saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const link = (path: string) => (status?.explorer ? `${status.explorer}/${path}` : null);

  return (
    <Card>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Coins size={16} />Mahar Shwe Point (MSP)</h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        Customers earn MSP on what they pay at the till. The points go to the customer&apos;s own
        BNB Chain wallet, which you enter on their page under Customers. A sale without a customer earns nothing.
      </p>

      <div className="mt-3 space-y-3">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <span className="text-sm font-medium">Give MSP on sales</span>
          <button type="button" role="switch" aria-checked={enabled} onClick={() => setEnabled(!enabled)}
            className={cn("relative h-6 w-11 shrink-0 rounded-full transition", enabled ? "bg-green-600" : "bg-gray-300 dark:bg-gray-700")}>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", enabled ? "left-5" : "left-0.5")} />
          </button>
        </label>
        <Input label={`${currency} spent for 1 MSP`} inputMode="numeric" value={perPoint} onChange={(e) => setPerPoint(e.target.value)} />
        <p className="-mt-1 text-xs text-gray-500">
          {Number(perPoint) >= 1 ? `A ${(Number(perPoint) * 10).toLocaleString()} ${currency} sale earns 10 MSP.` : ""}
        </p>
        <Button disabled={busy} onClick={save}>Save</Button>
      </div>

      {status && (
        <div className="mt-4 space-y-2 border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><div className="text-xs text-gray-500">Waiting</div><div className="font-semibold tabular-nums">{status.pending}</div></div>
            <div><div className="text-xs text-gray-500">On the way</div><div className="font-semibold tabular-nums">{status.sending}</div></div>
            <div><div className="text-xs text-gray-500">In wallets</div><div className="font-semibold tabular-nums">{status.minted}</div></div>
          </div>
          <p className="text-xs text-gray-500">Waiting: the customer has no wallet yet, or the next batch has not gone out (every minute).</p>
          {!status.configured && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              This server does not mint MSP yet. Points are recorded and will be sent once it does.
            </p>
          )}
          {status.problem && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">{status.problem}</p>
          )}
          {status.contract && link(`token/${status.contract}`) && (
            <a href={link(`token/${status.contract}`)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
              MSP on BscScan <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
    </Card>
  );
}
