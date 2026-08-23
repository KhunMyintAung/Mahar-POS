import { randomBytes } from "crypto";
import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getMe, setWebhook, deleteWebhook } from "@/lib/telegram";

// Every signed-in user manages their own bot — no extra permission needed,
// same as changing your own password would be. Each user pastes their own
// token from @BotFather; we verify it, register the webhook, and from then
// on whoever first messages that bot becomes the linked chat.

export const GET = withAuth(null, async ({ user }) => {
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: { telegramBotToken: true, telegramBotUsername: true, telegramChatId: true },
  });
  return json({
    configured: !!u?.telegramBotToken,
    botUsername: u?.telegramBotUsername ?? null,
    linked: !!u?.telegramChatId,
  });
});

const schema = z.object({ botToken: z.string().min(20, "That doesn't look like a valid bot token") });

export const POST = withAuth(null, async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const token = body.botToken.trim();

  const appUrl = process.env.APP_URL;
  if (!appUrl || appUrl.includes("localhost")) {
    throw new ApiError(422, "APP_URL must be a public HTTPS address before a Telegram webhook can be registered");
  }

  const existing = await prisma.user.findUnique({ where: { telegramBotToken: token } });
  if (existing && existing.id !== user.id) throw new ApiError(422, "This bot token is already linked to another account");

  let me: { id: number; username: string };
  try {
    me = await getMe(token);
  } catch {
    throw new ApiError(422, "Telegram rejected that token — double check it was copied correctly from @BotFather");
  }

  const webhookSecret = randomBytes(24).toString("hex");
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook/${user.id}`;
  try {
    await setWebhook(token, webhookUrl, webhookSecret);
  } catch (e) {
    throw new ApiError(502, `Could not register the webhook with Telegram: ${e instanceof Error ? e.message : "unknown error"}`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramBotToken: token,
      telegramBotUsername: me.username,
      telegramWebhookSecret: webhookSecret,
      telegramChatId: null, // re-bind on next /start — a new bot means a fresh chat
    },
  });

  return json({ botUsername: me.username, deepLink: `https://t.me/${me.username}` }, { status: 201 });
});

export const DELETE = withAuth(null, async ({ user }) => {
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { telegramBotToken: true } });
  if (u?.telegramBotToken) {
    try {
      await deleteWebhook(u.telegramBotToken);
    } catch (e) {
      console.error("[telegram] deleteWebhook failed:", e);
    }
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramBotToken: null, telegramBotUsername: null, telegramWebhookSecret: null, telegramChatId: null },
  });
  return json({ unlinked: true });
});
