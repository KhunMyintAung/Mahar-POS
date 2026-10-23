import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getMe, recentChats } from "@/lib/telegram";
import { todayBusinessDate } from "@/lib/dates";
import {
  TIME_PATTERN,
  buildDailyReport,
  loadTelegramReports,
  saveTelegramReports,
  sendToTargets,
  type TelegramReports,
} from "@/lib/telegramReports";

// The shop's send-only reports bot. Owner only (settings.manage). The bot token is never
// sent back to the browser; the page only learns whether one is saved.

function view(cfg: TelegramReports) {
  const { botToken, ...rest } = cfg;
  return { ...rest, hasToken: Boolean(botToken) };
}

export const GET = withAuth("settings.manage", async ({ user }) => {
  return json(view(await loadTelegramReports(user.businessId)));
});

const targetSchema = z.object({
  chatId: z.string().trim().regex(/^-?\d{3,20}$|^@[A-Za-z0-9_]{4,64}$/, "A chat ID is a number like 123456789 or -1001234567890, or a channel @name"),
  name: z.string().trim().max(60).default(""),
  live: z.boolean(),
  daily: z.boolean(),
});

const putSchema = z.object({
  enabled: z.boolean(),
  /** A new token; leave out to keep the saved one, "" to remove it. */
  botToken: z.string().trim().optional(),
  dailyTime: z.string().regex(TIME_PATTERN, "Time must be HH:MM, e.g. 21:00"),
  targets: z.array(targetSchema).max(10),
});

export const PUT = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, putSchema);
  const prev = await loadTelegramReports(user.businessId);
  let botToken = prev.botToken;
  let botUsername = prev.botUsername;
  if (body.botToken !== undefined) {
    if (body.botToken === "") {
      botToken = null;
      botUsername = null;
    } else {
      try {
        botUsername = (await getMe(body.botToken)).username;
        botToken = body.botToken;
      } catch {
        throw new ApiError(422, "Telegram rejected that token. Copy it again from @BotFather.");
      }
    }
  }
  if (body.enabled && !botToken) throw new ApiError(422, "Add the bot token first");
  const next: TelegramReports = {
    enabled: body.enabled,
    botToken,
    botUsername,
    dailyTime: body.dailyTime,
    targets: body.targets,
    // A new time for today should still send today.
    lastDailySent: body.dailyTime !== prev.dailyTime ? null : prev.lastDailySent,
  };
  await saveTelegramReports(user.businessId, next);
  await audit(prisma, {
    businessId: user.businessId, userId: user.id, action: "UPDATE", module: "settings",
    resourceType: "TelegramReports", resourceId: user.businessId,
    after: { enabled: next.enabled, botUsername, dailyTime: next.dailyTime, targets: next.targets.length },
  });
  return json(view(next));
});

const postSchema = z.object({ action: z.enum(["test", "daily-now", "chats", "preview"]) });

export const POST = withAuth("settings.manage", async ({ req, user }) => {
  const { action } = await parseBody(req, postSchema);
  // Today's report as it would go out, without sending it (no bot needed).
  if (action === "preview") return json({ text: await buildDailyReport(user.businessId, todayBusinessDate()) });
  const cfg = await loadTelegramReports(user.businessId);
  if (!cfg.botToken) throw new ApiError(422, "Add the bot token first");

  if (action === "chats") {
    try {
      return json({ chats: await recentChats(cfg.botToken) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      throw new ApiError(422, /webhook/i.test(msg)
        ? "This bot is also connected as someone's personal bot, so its chats can't be listed. Use a separate bot for reports, or type the chat ID."
        : `Telegram: ${msg || "could not list chats"}`);
    }
  }

  if (cfg.targets.length === 0) throw new ApiError(422, "Add at least one chat ID first");
  const text = action === "test"
    ? "✅ Mahar Mini POS reports bot is connected to this chat."
    : await buildDailyReport(user.businessId, todayBusinessDate());
  const results = await sendToTargets(cfg, action === "test" ? "all" : "daily", text);
  return json({ results });
});
