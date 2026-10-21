// Minimal Telegram Bot API client. No SDK dependency — just fetch against
// https://api.telegram.org.
//
// Each Mahar Mini POS user brings their own bot (their own token), so there is
// no single global token. In-conversation calls (sendMessage etc.) pull the
// active token from an AsyncLocalStorage context set once per webhook
// request by withBotToken() — this avoids threading a token argument through
// every function in telegramBot.ts. Admin calls (setWebhook, getMe) that run
// outside that context — e.g. when a user first saves their token — take the
// token as an explicit argument instead.

import { AsyncLocalStorage } from "node:async_hooks";

const tokenContext = new AsyncLocalStorage<string>();

/** Run `fn` with `token` as the active bot for any sendMessage/etc. calls inside it. */
export function withBotToken<T>(token: string, fn: () => Promise<T>): Promise<T> {
  return tokenContext.run(token, fn);
}

function activeToken(): string {
  const token = tokenContext.getStore();
  if (!token) throw new Error("No Telegram bot token in context — call within withBotToken()");
  return token;
}

const REQUEST_TIMEOUT_MS = 10_000;

// Throws on failure — used by setup/admin calls (setWebhook, getMe) where the
// caller needs to know something actually went wrong instead of failing
// silently.
async function call<T = unknown>(token: string, method: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description ?? `${method} failed`);
  return data.result as T;
}

// Non-throwing wrapper for in-conversation sends: a Telegram API hiccup must
// not abort the business logic — e.g. a withdrawal already committed to the
// database should not roll back just because the confirmation message failed
// to send.
async function callBestEffort<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T | undefined> {
  try {
    return await call<T>(activeToken(), method, payload);
  } catch (e) {
    console.error(`[telegram] ${method} failed:`, e instanceof Error ? e.message : e);
    return undefined;
  }
}

/** A button carries either a callback or a link, never both — Telegram rejects a button
 *  with neither and ignores one with both. */
export type InlineButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };
export type InlineKeyboard = InlineButton[][];

export function keyboard(rows: InlineButton[][]): { inline_keyboard: InlineButton[][] } {
  return { inline_keyboard: rows };
}

export function btn(text: string, data: string): InlineButton {
  return { text, callback_data: data };
}

/** A button that opens a link — used to hand a customer straight to the shop's Telegram
 *  rather than making them copy a name out of a message. */
export function linkBtn(text: string, url: string): InlineButton {
  return { text, url };
}

/** A keyboard that stays under the message it came with, and disappears with it. */
export type ReplyMarkup =
  | { inline_keyboard: InlineButton[][] }
  | ReplyKeyboard;

/** A keyboard that replaces the user's own keyboard and stays there between messages —
 *  the buttons remain reachable however far the conversation has scrolled. Private chats
 *  only, which is where customers are. */
export interface ReplyKeyboard {
  keyboard: { text: string }[][];
  resize_keyboard: true;
  is_persistent: true;
}

export function persistentKeyboard(rows: string[][]): ReplyKeyboard {
  return {
    keyboard: rows.map((row) => row.map((text) => ({ text }))),
    resize_keyboard: true,
    is_persistent: true,
  };
}

export async function sendMessage(
  chatId: string,
  text: string,
  opts?: { replyMarkup?: ReplyMarkup; parseMode?: "Markdown" | "HTML" }
) {
  return callBestEffort("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: opts?.replyMarkup,
    parse_mode: opts?.parseMode,
  });
}

/** Forward an image by file_id. The slip stays on Telegram's servers — we store the id,
 *  never the bytes, so no customer payment slip lands on our disk. */
export async function sendPhoto(
  chatId: string,
  fileId: string,
  opts?: { caption?: string; replyMarkup?: { inline_keyboard: InlineButton[][] } }
) {
  return callBestEffort("sendPhoto", {
    chat_id: chatId,
    photo: fileId,
    caption: opts?.caption,
    reply_markup: opts?.replyMarkup,
  });
}

export async function sendDocument(
  chatId: string,
  fileId: string,
  opts?: { caption?: string; replyMarkup?: { inline_keyboard: InlineButton[][] } }
) {
  return callBestEffort("sendDocument", {
    chat_id: chatId,
    document: fileId,
    caption: opts?.caption,
    reply_markup: opts?.replyMarkup,
  });
}

export async function editMessageText(
  chatId: string,
  messageId: number,
  text: string,
  opts?: { replyMarkup?: { inline_keyboard: InlineButton[][] } }
) {
  return callBestEffort("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: opts?.replyMarkup,
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
  return callBestEffort("answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: showAlert });
}

// Admin calls: explicit token, real errors — used once when a user saves
// their bot token (to verify it and register the webhook), not from within
// an in-conversation flow.
export async function setWebhook(token: string, url: string, secretToken: string) {
  return call(token, "setWebhook", { url, secret_token: secretToken, allowed_updates: ["message", "callback_query"] });
}

export async function deleteWebhook(token: string) {
  return call(token, "deleteWebhook", {});
}

export async function getMe(token: string) {
  return call<{ id: number; username: string }>(token, "getMe", {});
}

// --- Update payload shapes (only the fields we use) ---
export interface TgUser {
  id: number;
  first_name: string;
  username?: string;
}
export interface TgPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}
export interface TgMessage {
  message_id: number;
  chat: { id: number };
  from?: TgUser;
  text?: string;
  caption?: string;
  /** Telegram sends every size it made, smallest first. */
  photo?: TgPhotoSize[];
  /** A slip sent as a file rather than a photo. */
  document?: { file_id: string; mime_type?: string; file_name?: string };
}
export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

/** A message straight to one chat with an explicit token, throwing on failure — for the
 *  send-only reports bot, whose test button must say plainly when a chat ID is wrong. */
export async function sendMessageWith(token: string, chatId: string, text: string) {
  return call(token, "sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}

/** Chats that have messaged a bot lately, so a shop can pick a chat ID instead of looking
 *  one up. Only works while the bot has no webhook; Telegram refuses getUpdates then. */
export async function recentChats(token: string): Promise<{ id: string; title: string; type: string }[]> {
  type Chat = { id: number; type: string; title?: string; first_name?: string; last_name?: string; username?: string };
  const updates = await call<{ message?: { chat: Chat }; channel_post?: { chat: Chat }; my_chat_member?: { chat: Chat } }[]>(token, "getUpdates", { limit: 100, timeout: 0 });
  const chats = new Map<string, { id: string; title: string; type: string }>();
  for (const u of updates) {
    const c = u.message?.chat ?? u.channel_post?.chat ?? u.my_chat_member?.chat;
    if (!c) continue;
    const person = [c.first_name, c.last_name].filter(Boolean).join(" ");
    chats.set(String(c.id), { id: String(c.id), title: c.title || person || c.username || String(c.id), type: c.type });
  }
  return [...chats.values()];
}
