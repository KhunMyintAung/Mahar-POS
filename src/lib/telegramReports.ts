import { prisma } from "./prisma";
import { sendMessageWith } from "./telegram";
import { dateRangeUtc, todayBusinessDate } from "./dates";
import { computeDaySummary } from "@/services/summaryService";
import { buildReport } from "@/services/reportService";

/** The shop's send-only Telegram bot: it posts the live transaction feed and a daily
 *  report to chats the owner picks (themselves, a staff group, a channel) and never
 *  answers anything. Separate from each person's own interactive bot.
 *
 *  Kept in SystemSetting under its own key. The settings API leaves this key out, so the
 *  bot token is only ever read here and by the owner-only reports route. */
export const TELEGRAM_REPORTS_KEY = "telegram_reports";

export interface ReportTarget {
  chatId: string;
  name: string;
  /** Each sale, top-up, transfer… as it is saved. */
  live: boolean;
  /** The end-of-day summary at dailyTime. */
  daily: boolean;
}

export interface TelegramReports {
  enabled: boolean;
  botToken: string | null;
  botUsername: string | null;
  /** "HH:MM", shop time (Asia/Yangon). */
  dailyTime: string;
  targets: ReportTarget[];
  /** The business date the daily report last went out for, so it goes once a day. */
  lastDailySent: string | null;
}

export const DEFAULT_TELEGRAM_REPORTS: TelegramReports = {
  enabled: false, botToken: null, botUsername: null, dailyTime: "21:00", targets: [], lastDailySent: null,
};

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseTelegramReports(raw: unknown): TelegramReports {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<TelegramReports>;
  const targets = Array.isArray(v.targets)
    ? v.targets
        .filter((t): t is ReportTarget => Boolean(t && typeof t.chatId === "string" && t.chatId.trim()))
        .map((t) => ({ chatId: t.chatId.trim(), name: String(t.name ?? "").slice(0, 60), live: Boolean(t.live), daily: Boolean(t.daily) }))
        .slice(0, 10)
    : [];
  return {
    enabled: Boolean(v.enabled),
    botToken: typeof v.botToken === "string" && v.botToken ? v.botToken : null,
    botUsername: typeof v.botUsername === "string" ? v.botUsername : null,
    dailyTime: typeof v.dailyTime === "string" && TIME_PATTERN.test(v.dailyTime) ? v.dailyTime : DEFAULT_TELEGRAM_REPORTS.dailyTime,
    targets,
    lastDailySent: typeof v.lastDailySent === "string" ? v.lastDailySent : null,
  };
}

export async function loadTelegramReports(businessId: string): Promise<TelegramReports> {
  const row = await prisma.systemSetting.findUnique({ where: { businessId_key: { businessId, key: TELEGRAM_REPORTS_KEY } } });
  try {
    return parseTelegramReports(row ? JSON.parse(row.value) : undefined);
  } catch {
    return { ...DEFAULT_TELEGRAM_REPORTS };
  }
}

export async function saveTelegramReports(businessId: string, value: TelegramReports) {
  const json = JSON.stringify(value);
  await prisma.systemSetting.upsert({
    where: { businessId_key: { businessId, key: TELEGRAM_REPORTS_KEY } },
    create: { businessId, key: TELEGRAM_REPORTS_KEY, value: json },
    update: { value: json },
  });
}

/** Sends to every chat that wants this kind of message. Returns, per chat, whether it
 *  went, so the test button can say which chat ID is wrong. */
export async function sendToTargets(
  cfg: TelegramReports,
  kind: "live" | "daily" | "all",
  text: string
): Promise<{ chatId: string; name: string; ok: boolean; error?: string }[]> {
  if (!cfg.botToken) return [];
  const targets = cfg.targets.filter((t) => kind === "all" || t[kind]);
  return Promise.all(targets.map(async (t) => {
    try {
      await sendMessageWith(cfg.botToken!, t.chatId, text);
      return { chatId: t.chatId, name: t.name, ok: true };
    } catch (e) {
      return { chatId: t.chatId, name: t.name, ok: false, error: e instanceof Error ? e.message : "failed" };
    }
  }));
}

/** The live feed for the reports bot. Fire-and-forget, like the per-person feed. */
export function notifyReportTargets(businessId: string, text: string): void {
  (async () => {
    const cfg = await loadTelegramReports(businessId);
    if (!cfg.enabled || !cfg.botToken) return;
    const results = await sendToTargets(cfg, "live", text);
    for (const r of results) if (!r.ok) console.error(`[telegram reports] live to ${r.chatId}: ${r.error}`);
  })().catch((e) => console.error("[telegram reports] live feed failed:", e));
}

function money(minor: bigint): string {
  const neg = minor < 0n;
  const whole = ((neg ? -minor : minor) / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${whole}`;
}

/** One day's figures as a Telegram message: the day's income and expense by part of the
 *  shop (the same columns as the Reports daily summary) and its net profit or loss, then
 *  repairs, wallets and debts. */
export async function buildDailyReport(businessId: string, date: string): Promise<string> {
  const [business, day, summary, repairsIn, repairsDone, wallets] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { name: true } }),
    buildReport(businessId, date, date),
    computeDaySummary(prisma, businessId, date),
    prisma.repairJob.count({ where: { businessId, deletedAt: null, receivedAt: dateRangeUtc(date) } }),
    prisma.repairJob.count({ where: { businessId, deletedAt: null, completedAt: dateRangeUtc(date) } }),
    prisma.wallet.findMany({
      where: { businessId, deletedAt: null, active: true },
      select: { name: true, currency: true, currentBalance: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const t = day.totals;
  const parts = ([["sales", "Sales"], ["service", "Service"], ["topup", "Top-up"]] as const).filter(([k]) => day.shown[k]);
  const col = (label: string, v: bigint) => `   • ${label}: ${money(v)}`;

  const lines = [
    `📊 Daily report · ${business?.name ?? ""}`,
    `📅 ${date}`,
    "",
    "💰 Income",
    ...parts.map(([k, label]) => col(label, t.inc[k])),
    col("Other income", t.inc.other),
    `   = Total income: ${money(t.inc.total)} MMK`,
    "",
    "💸 Expense",
    ...parts.map(([k, label]) => col(label, t.exp[k])),
    col("Other expense", t.exp.other),
    `   = Total expense: ${money(t.exp.total)} MMK`,
    "",
    `${t.net >= 0n ? "📈 Net profit" : "📉 Net loss"}: ${money(t.net)} MMK`,
    "",
    `🔧 Repairs taken in: ${repairsIn} · finished: ${repairsDone}`,
    "",
    "👛 Wallets now:",
    ...wallets.map((w) => `   • ${w.name}: ${money(w.currentBalance)} ${w.currency}`),
  ];
  if (summary.credit.outstanding > 0n) lines.push("", `🧾 Customers owe: ${money(summary.credit.outstanding)} MMK`);
  if (summary.payable.outstanding > 0n) lines.push(`🏷️ We owe suppliers: ${money(summary.payable.outstanding)} MMK`);
  return lines.join("\n");
}

/** The shop's clock: today's business date and the time now as "HH:MM". */
function shopNow(): { date: string; time: string } {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Yangon", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  return { date: todayBusinessDate(), time };
}

/** Called every minute: sends each shop's daily report once its time has come today. */
export async function runDueDailyReports() {
  const rows = await prisma.systemSetting.findMany({ where: { key: TELEGRAM_REPORTS_KEY } });
  const { date, time } = shopNow();
  for (const row of rows) {
    let cfg: TelegramReports;
    try { cfg = parseTelegramReports(JSON.parse(row.value)); } catch { continue; }
    if (!cfg.enabled || !cfg.botToken || !cfg.targets.some((t) => t.daily)) continue;
    if (time < cfg.dailyTime || cfg.lastDailySent === date) continue;
    // Marked first, so a slow send can never go out twice from the next tick.
    await saveTelegramReports(row.businessId, { ...cfg, lastDailySent: date });
    try {
      const text = await buildDailyReport(row.businessId, date);
      const results = await sendToTargets(cfg, "daily", text);
      for (const r of results) if (!r.ok) console.error(`[telegram reports] daily to ${r.chatId}: ${r.error}`);
    } catch (e) {
      console.error("[telegram reports] daily report failed:", e);
    }
  }
}
