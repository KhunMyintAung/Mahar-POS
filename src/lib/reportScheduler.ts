import { runDueDailyReports } from "./telegramReports";
import { runDueGsheetBackups } from "./gsheetBackup";
import { runMspWallets } from "@/services/mspWalletService";

const TICK_MS = 60_000;
const KEY = Symbol.for("mahar.reportScheduler");

/** Checks once a minute for daily Telegram reports and Google Sheet syncs that are due.
 *  Started once per server process from instrumentation.ts; the guard keeps a second start (hot reload) from
 *  doubling it. The app runs as a single process, so each report is sent by one ticker. */
export function startReportScheduler() {
  const g = globalThis as unknown as Record<symbol, boolean>;
  if (g[KEY]) return;
  g[KEY] = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runDueDailyReports();
      await runDueGsheetBackups();
    } catch (e) {
      console.error("[report scheduler]", e);
    }
    // Separate, so a chain outage never holds up the reports (or the other way round).
    try {
      await runMspWallets();
    } catch (e) {
      console.error("[msp wallets]", e);
    } finally {
      running = false;
    }
  };
  setInterval(tick, TICK_MS).unref();
  setTimeout(tick, 15_000).unref();
}
