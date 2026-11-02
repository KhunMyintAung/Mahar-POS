"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Printer, RotateCcw } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, Empty, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";

/** The print station: left open on the PC the counter printer hangs off, it takes the slips
 *  the shop's phones send (lib/cloudPrint.ts) and prints each one there.
 *
 *  Chrome started with --kiosk-printing prints without asking, on the PC's default printer,
 *  so set the XP-80C as the default. Without the flag each slip opens the print dialog.
 */

interface Job { id: string; title: string; status: string; error: string | null; createdAt: string; printedAt: string | null; sentBy: string }
interface Claimed { id: string; title: string; html: string }

/** How often the station asks for a new slip while there is none. */
const POLL_MS = 2000;

const SHORTCUT = '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --user-data-dir="C:\\MaharPrintStation" --kiosk-printing --disable-background-timer-throttling --app=https://app.maharpos.shop/print-station';

/** Print one slip page in a frame with scripts off. A slip is HTML a shop user sent, so it
 *  never runs as this page: no script in it can reach the station's signed-in session. */
function printHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-same-origin allow-modals");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:80mm;height:10px;border:0;";
    const done = setTimeout(() => { frame.remove(); reject(new Error("The slip did not load")); }, 15000);
    frame.onload = async () => {
      try {
        const doc = frame.contentDocument;
        const win = frame.contentWindow;
        if (!doc || !win) throw new Error("The slip could not be opened");
        // The logo and the QR code, so they are on the paper and not blank boxes.
        await Promise.race([
          Promise.all([...doc.images].map((img) => img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))),
          new Promise((r) => setTimeout(r, 4000)),
        ]);
        win.focus();
        win.print();
        clearTimeout(done);
        // print() returns once the slip is spooled (or the dialog closed); let it settle.
        setTimeout(() => frame.remove(), 3000);
        resolve();
      } catch (e) {
        clearTimeout(done);
        frame.remove();
        reject(e);
      }
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function PrintStationPage() {
  const { me, hasPerm } = useAuth();
  const { push } = useToast();
  const [running, setRunning] = useState(true);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [lastPoll, setLastPoll] = useState<{ at: Date; ok: boolean; error?: string } | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const runningRef = useRef(running);
  const allowed = (me?.cloudPrint ?? false) && hasPerm("settings.manage");

  const loadJobs = useCallback(() => {
    api<Job[]>("/api/v1/print-jobs").then(setJobs).catch(() => {});
  }, []);

  useEffect(() => { runningRef.current = running; }, [running]);

  // Take a slip, print it, report it, and go straight on to the next; rest when none wait.
  useEffect(() => {
    if (!allowed) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      let wait = POLL_MS;
      if (runningRef.current) {
        try {
          const job = await api<Claimed | null>("/api/v1/print-jobs/claim", { method: "POST" });
          setLastPoll({ at: new Date(), ok: true });
          if (job) {
            setPrinting(job.title);
            try {
              await printHtml(job.html);
              await api(`/api/v1/print-jobs/${job.id}`, { method: "PATCH", body: { status: "PRINTED" } });
            } catch (e) {
              await api(`/api/v1/print-jobs/${job.id}`, {
                method: "PATCH",
                body: { status: "FAILED", error: e instanceof Error ? e.message : "Print failed" },
              }).catch(() => {});
            }
            setPrinting(null);
            loadJobs();
            wait = 0;
          }
        } catch (e) {
          setLastPoll({ at: new Date(), ok: false, error: e instanceof Error ? e.message : "No connection" });
        }
      }
      if (!stopped) timer = setTimeout(tick, wait);
    };
    void tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [allowed, loadJobs]);

  useEffect(() => {
    if (!allowed) return;
    loadJobs();
    const id = setInterval(loadJobs, 10000);
    return () => clearInterval(id);
  }, [allowed, loadJobs]);

  // Keep the PC's screen, and with it the station, from going to sleep while it is open.
  useEffect(() => {
    if (!allowed || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const take = () => { navigator.wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {}); };
    const onVisible = () => { if (document.visibilityState === "visible") take(); };
    take();
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); void lock?.release(); };
  }, [allowed]);

  async function reprint(job: Job) {
    try {
      await api(`/api/v1/print-jobs/${job.id}`, { method: "PATCH", body: { status: "QUEUED" } });
      push(`${job.title} will print again`);
      loadJobs();
    } catch (e) {
      push(e instanceof Error ? e.message : "Could not reprint", "error");
    }
  }

  if (!allowed) {
    return (
      <div className="space-y-4">
        <PageHeader title="Print station" />
        <Card><Empty message="Cloud print is not switched on for this shop." /></Card>
      </div>
    );
  }

  const healthy = lastPoll?.ok ?? true;

  return (
    <div className="space-y-4">
      <PageHeader title="Print station" />

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={cn("h-3 w-3 rounded-full", !running ? "bg-gray-400" : healthy ? "animate-pulse bg-green-500" : "bg-red-500")} />
            <div>
              <div className="font-semibold">
                {!running ? "Paused · ရပ်ထားသည်" : printing ? `Printing ${printing}…` : healthy ? "Waiting for slips · Slip စောင့်နေသည်" : "No connection · ချိတ်ဆက်မှု မရှိ"}
              </div>
              <div className="text-xs text-gray-500">
                {lastPoll ? `Last checked ${time(lastPoll.at.toISOString())}` : "Starting…"}
                {lastPoll && !lastPoll.ok && lastPoll.error ? ` · ${lastPoll.error}` : ""}
              </div>
            </div>
          </div>
          <Button variant={running ? "secondary" : "primary"} onClick={() => setRunning((r) => !r)}>
            {running ? "Pause" : "Resume"}
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          Keep this page open on the PC the XP-80C is attached to. Slips sent from the shop&apos;s phones print here.
          ဒီ page ကို printer တပ်ထားတဲ့ PC မှာ ဖွင့်ထားပါ။ ဖုန်းကနေ ပို့တဲ့ slip တွေ ဒီကနေ ထွက်ပါမယ်။
        </p>
      </Card>

      <Card className="space-y-2">
        <h3 className="text-sm font-semibold">Recent slips</h3>
        {jobs === null ? null : jobs.length === 0 ? <Empty message="No slips yet" /> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {jobs.map((job) => (
              <li key={job.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium"><Printer size={14} className="mr-1 inline" />{job.title}</div>
                  <div className="text-xs text-gray-500">
                    {time(job.createdAt)}{job.sentBy ? ` · ${job.sentBy}` : ""}{job.error ? ` · ${job.error}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium",
                    job.status === "PRINTED" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                      : job.status === "FAILED" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  )}>{job.status}</span>
                  {(job.status === "PRINTED" || job.status === "FAILED") && (
                    <Button size="sm" variant="secondary" onClick={() => reprint(job)} title="Print again" aria-label="Print again">
                      <RotateCcw size={14} />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-2">
        <h3 className="text-sm font-semibold">Print without the dialog</h3>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-gray-600 dark:text-gray-300">
          <li>Set XP-80C as this PC&apos;s default printer (Settings → Printers &amp; scanners → XP-80C → Set as default).</li>
          <li>Make a desktop shortcut with this target, open it, and sign in once:</li>
        </ol>
        <code className="block select-all break-all rounded bg-gray-100 p-2 text-xs dark:bg-gray-800">{SHORTCUT}</code>
        <p className="text-xs text-gray-500">The shortcut opens a separate Chrome window just for the station, so the flag works even while your other Chrome windows are open.</p>
      </Card>
    </div>
  );
}
