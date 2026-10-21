"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Send, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, Input, cn, useToast } from "@/components/ui";

interface Target { chatId: string; name: string; live: boolean; daily: boolean }
interface ReportsView {
  enabled: boolean;
  hasToken: boolean;
  botUsername: string | null;
  dailyTime: string;
  targets: Target[];
  lastDailySent: string | null;
}
interface SendResult { chatId: string; name: string; ok: boolean; error?: string }

/** Owner-only: the shop's send-only Telegram bot for the live feed and the daily report. */
export function TelegramReportsCard() {
  const [cfg, setCfg] = useState<ReportsView | null>(null);
  const [token, setToken] = useState("");
  const [chats, setChats] = useState<{ id: string; title: string; type: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  const load = useCallback(() => {
    api<ReportsView>("/api/v1/telegram/reports").then(setCfg).catch((e) => push(e.message, "error"));
  }, [push]);
  useEffect(load, [load]);

  if (!cfg) return null;

  const setTarget = (i: number, patch: Partial<Target>) =>
    setCfg({ ...cfg, targets: cfg.targets.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  async function save(extra?: { botToken?: string }, enabled = cfg!.enabled) {
    const bad = cfg!.targets.find((t) => !/^-?\d{3,20}$|^@[A-Za-z0-9_]{4,64}$/.test(t.chatId.trim()));
    if (bad) {
      push(`"${bad.chatId || bad.name || "New chat"}" is not a chat ID. Use a number like 123456789 or -1001234567890.`, "error");
      return false;
    }
    setBusy(true);
    try {
      const next = await api<ReportsView>("/api/v1/telegram/reports", {
        method: "PUT",
        body: { enabled, dailyTime: cfg!.dailyTime, targets: cfg!.targets.map((t) => ({ ...t, chatId: t.chatId.trim() })), ...extra },
      });
      setCfg(next);
      setToken("");
      push("Saved");
      return true;
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function act(action: "test" | "daily-now" | "chats") {
    // Unsaved recipients would not be sent to, so save them first.
    if (action !== "chats" && !(await save())) return;
    setBusy(true);
    try {
      if (action === "chats") {
        const d = await api<{ chats: { id: string; title: string; type: string }[] }>("/api/v1/telegram/reports", { method: "POST", body: { action } });
        setChats(d.chats);
        if (d.chats.length === 0) push("No chats yet. Send the bot a message (or add it to the group and post there), then try again.", "error");
      } else {
        const d = await api<{ results: SendResult[] }>("/api/v1/telegram/reports", { method: "POST", body: { action } });
        const bad = d.results.filter((r) => !r.ok);
        if (d.results.length === 0) push("No chat is set to get this. Tick Daily report for a chat.", "error");
        else if (bad.length) push(`Not sent to ${bad.map((r) => r.name || r.chatId).join(", ")}: ${bad[0].error}`, "error");
        else push(action === "test" ? "Test message sent" : "Daily report sent");
      }
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Reports bot (notifications only)</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          A bot that only sends: every sale, top-up, transfer and other entry as it happens, and a daily report at the time you choose — to you, a staff group or a channel. It does not answer anyone.
        </p>
      </div>

      {/* Bot */}
      {cfg.hasToken ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60">
          <span>Bot: <b>@{cfg.botUsername}</b></span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => save({ botToken: "" }, false)}>Remove bot</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Input label="Bot token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AA… from @BotFather" />
          <p className="text-xs text-gray-500">Make a new bot with @BotFather (/newbot) just for reports, and paste its token.</p>
          <Button disabled={busy || token.trim().length < 20} onClick={() => save({ botToken: token.trim() })}>Save bot</Button>
        </div>
      )}

      {/* Recipients */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Send to</span>
          {cfg.hasToken && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("chats")}>
              <Search size={14} className="mr-1 inline" />Find chat IDs
            </Button>
          )}
        </div>
        {chats && chats.length > 0 && (
          <div className="space-y-1 rounded-lg border border-blue-200 bg-blue-50 p-2 text-sm dark:border-blue-900 dark:bg-blue-950/30">
            <div className="text-xs text-gray-500">Chats that messaged the bot:</div>
            {chats.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{c.title} <span className="font-mono text-xs text-gray-500">{c.id}</span></span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={cfg.targets.some((t) => t.chatId === c.id)}
                  onClick={() => setCfg({ ...cfg, targets: [...cfg.targets, { chatId: c.id, name: c.title, live: true, daily: true }] })}
                >
                  Add
                </Button>
              </div>
            ))}
          </div>
        )}
        {cfg.targets.map((t, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-gray-200 p-2 dark:border-gray-700">
            <div className="grid grid-cols-2 gap-2">
              <Input label="Name" value={t.name} placeholder="Owner / Staff group" onChange={(e) => setTarget(i, { name: e.target.value })} />
              <Input label="Chat ID" value={t.chatId} placeholder="-1001234567890" onChange={(e) => setTarget(i, { chatId: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={t.live} onChange={(e) => setTarget(i, { live: e.target.checked })} />Live feed</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={t.daily} onChange={(e) => setTarget(i, { daily: e.target.checked })} />Daily report</label>
              <button type="button" className="ml-auto text-gray-400 hover:text-red-600" aria-label="Remove" onClick={() => setCfg({ ...cfg, targets: cfg.targets.filter((_, j) => j !== i) })}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {cfg.targets.length < 10 && (
          <Button size="sm" variant="secondary" onClick={() => setCfg({ ...cfg, targets: [...cfg.targets, { chatId: "", name: "", live: true, daily: true }] })}>
            <Plus size={14} className="mr-1 inline" />Add chat
          </Button>
        )}
        <p className="text-xs text-gray-500">
          For a group: add the bot to the group, post any message there, then press Find chat IDs. For yourself: open the bot and send /start.
        </p>
      </div>

      {/* Time + on/off */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-36">
          <Input label="Daily report time" type="time" value={cfg.dailyTime} onChange={(e) => setCfg({ ...cfg, dailyTime: e.target.value })} />
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={cfg.enabled}
          onClick={() => setCfg({ ...cfg, enabled: !cfg.enabled })}
          className="flex items-center gap-2 pb-2 text-sm font-medium"
        >
          <span className={cn("relative h-6 w-11 rounded-full transition", cfg.enabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700")}>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", cfg.enabled ? "left-5" : "left-0.5")} />
          </span>
          {cfg.enabled ? "On" : "Off"}
        </button>
      </div>
      {cfg.lastDailySent && <p className="-mt-2 text-xs text-gray-500">Last daily report: {cfg.lastDailySent}</p>}

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => save()}>{busy ? "Saving…" : "Save"}</Button>
        {cfg.hasToken && <Button variant="secondary" disabled={busy} onClick={() => act("test")}><Send size={14} className="mr-1 inline" />Send test</Button>}
        {cfg.hasToken && <Button variant="secondary" disabled={busy} onClick={() => act("daily-now")}>Send today&apos;s report now</Button>}
      </div>
    </Card>
  );
}
