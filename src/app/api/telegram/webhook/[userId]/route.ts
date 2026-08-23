import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withBotToken } from "@/lib/telegram";
import { handleUpdate } from "@/lib/telegramBot";
import type { TgUpdate } from "@/lib/telegram";

// Each Mahar Mini POS user has their own bot, so their own webhook URL:
// /api/telegram/webhook/<userId>. We verify the secret Telegram echoes back
// (set once via setWebhook when the user saved their token) against that
// specific user's stored secret — never a global shared value.
export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { active: true, deletedAt: true, telegramBotToken: true, telegramWebhookSecret: true },
  });
  if (!user || !user.active || user.deletedAt || !user.telegramBotToken || !user.telegramWebhookSecret) {
    return new NextResponse("Not found", { status: 404 });
  }

  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== user.telegramWebhookSecret) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let update: TgUpdate;
  try {
    update = await req.json();
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  try {
    await withBotToken(user.telegramBotToken, () => handleUpdate(update, userId));
  } catch (e) {
    console.error("[telegram webhook]", e);
  }
  // Always 200 — Telegram retries aggressively on non-2xx responses.
  return NextResponse.json({ ok: true });
}
