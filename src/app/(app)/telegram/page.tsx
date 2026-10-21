"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, Input, Spinner, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { TelegramReportsCard } from "@/components/TelegramReportsCard";

interface TelegramStatus {
  configured: boolean;
  linked: boolean;
  botUsername: string | null;
}
interface SaveResult {
  botUsername: string;
  deepLink: string;
}

export default function TelegramPage() {
  const [tg, setTg] = useState<TelegramStatus | null>(null);
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState<SaveResult | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { hasPerm } = useAuth();

  const load = useCallback(() => {
    api<TelegramStatus>("/api/v1/telegram/link").then(setTg).catch((e) => push(e.message, "error"));
  }, [push]);
  useEffect(load, [load]);

  async function saveToken() {
    setBusy(true);
    try {
      const result = await api<SaveResult>("/api/v1/telegram/link", { method: "POST", body: { botToken: token } });
      setSaved(result);
      setToken("");
      push("Bot connected");
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      await api("/api/v1/telegram/link", { method: "DELETE" });
      push("Telegram bot disconnected");
      setSaved(null);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!tg) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Telegram</h1>

      {hasPerm("settings.manage") && <TelegramReportsCard />}

      <h2 className="pt-2 font-semibold">My bot (records from chat)</h2>

      <Card className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Each person uses their <b>own</b> Telegram bot to record Income, Expense, Transfer, Withdraw, Top-up and credit entries from a chat quick-start menu — no need to open the app.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-gray-500">
          <li>Open Telegram and message <b>@BotFather</b></li>
          <li>Send <code>/newbot</code> and follow the prompts</li>
          <li>Copy the token BotFather gives you and paste it below</li>
        </ol>
      </Card>

      <Card>
        {tg.configured && tg.linked ? (
          <div className="space-y-3">
            <p className="text-sm text-green-600">✅ Connected — @{tg.botUsername}, chat linked.</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Open your bot in Telegram and send <code>/menu</code> for the quick-start keyboard.
            </p>
            <Button variant="secondary" disabled={busy} onClick={unlink}>Disconnect bot</Button>
          </div>
        ) : tg.configured && !tg.linked ? (
          <div className="space-y-3">
            <p className="text-sm text-amber-600">Bot connected — @{tg.botUsername}. Now open it and send anything to link this chat.</p>
            <a href={`https://t.me/${tg.botUsername}`} target="_blank" rel="noreferrer">
              <Button><Send size={16} className="mr-1 inline" />Open @{tg.botUsername}</Button>
            </a>
            <Button variant="secondary" disabled={busy} onClick={unlink} className="ml-2">Disconnect bot</Button>
          </div>
        ) : saved ? (
          <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-900 dark:bg-blue-900/20">
            <p>Connected to @{saved.botUsername}. Open it and send anything (e.g. /start) to finish linking.</p>
            <a href={saved.deepLink} target="_blank" rel="noreferrer">
              <Button><Send size={16} className="mr-1 inline" />Open @{saved.botUsername}</Button>
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <Input label="Bot token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AA...your token from @BotFather" />
            <Button disabled={busy || token.trim().length < 20} onClick={saveToken}>
              {busy ? "Connecting…" : "Connect bot"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
