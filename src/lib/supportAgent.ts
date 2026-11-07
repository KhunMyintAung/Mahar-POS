import { prisma } from "./prisma";
import { loadAiKey, type AiProvider } from "./aiKey";
import { askPlain, type ChatTurn } from "./aiAgent";
import { MANUAL, MANUAL_CATEGORY_LABEL } from "./manual";

/** "Ask for support" beside the user manual: a visitor's question about using Mahar POS,
 *  answered from the whole manual.
 *
 *  It runs on Mahar Shwe's own AI key (the one saved for its Telegram AI helper), so the
 *  service pays nothing extra and visitors need no key. Being public, it is rate limited per
 *  visitor and per day, and it reads no shop's records: it knows only the manual. */

const SUPPORT_BUSINESS_ID = process.env.SUPPORT_AI_BUSINESS_ID || "adf8576b-31e6-4e98-a19c-8e32149950e9";
const TELEGRAM_HELP = "https://t.me/+2gc9ml7iMgk1ZThl";

function manualText(): string {
  return MANUAL.map((g, i) => [
    `### Guide ${i + 1}: ${g.title}  [${MANUAL_CATEGORY_LABEL[g.category]}] (https://maharpos.shop/manual/${g.slug})`,
    g.description,
    ...g.steps.map((s, n) => `${n + 1}. ${s.t} — ${s.d}`),
    ...(g.tips ?? []).map((t) => `Tip: ${t}`),
  ].join("\n")).join("\n\n");
}

let systemCache: string | null = null;
function systemPrompt(): string {
  return (systemCache ??= [
    "You are the support assistant of Mahar POS (app.maharpos.shop), a cloud business management software for shops in Myanmar: sales and IMEI, phone repairs, stock, purchases and supplier debt, customer credit, Cash/KPay/Wave wallets, phone top-up and bills, income and expense, staff and roles, branches, an online shop, reports, Google Sheet and Telegram.",
    "Answer the visitor's questions about how to use Mahar POS and how each function works, using the user manual below. It is your source of truth.",
    "Rules:",
    "• Always answer in Myanmar (Burmese) language, politely, the way a patient support person would. Keep English menu and button names as the manual writes them.",
    "• For a how-to question, answer step by step as a numbered list (1. 2. 3.), naming the exact menu and buttons from the manual. For a 'how does it work' question, explain what the function does and why, then how to use it. Give a short tip when it helps.",
    "• Combine guides when a question needs more than one, and end with the link of the most relevant guide.",
    "• Plain text only: no Markdown (no **, #, or tables).",
    "• Never invent menus, buttons, prices or features the manual does not describe. If the manual does not cover something, say what the manual does say that is closest, and suggest asking the support team on Telegram: " + TELEGRAM_HELP,
    "• Mahar POS is free for now, because it is still in its development period; if paid plans come later, shops will be told in advance and keep their data.",
    "• You cannot see any shop's records or account. For questions about a shop's own numbers, tell them to look in the app (or the Telegram AI helper inside the app).",
    "• Do not discuss source code, servers or technical internals. Stay on Mahar POS; politely decline unrelated requests.",
    "",
    "USER MANUAL:",
    manualText(),
  ].join("\n"));
}

// --- The key -------------------------------------------------------------------------

let keyCache: { at: number; key: { provider: AiProvider; key: string } | null } | null = null;

async function supportKey() {
  if (keyCache && Date.now() - keyCache.at < 5 * 60_000) return keyCache.key;
  const users = await prisma.user.findMany({
    where: { businessId: SUPPORT_BUSINESS_ID, deletedAt: null, active: true },
    select: { id: true, role: { select: { name: true } } },
  });
  const saved = new Set((await prisma.telegramAiKey.findMany({ where: { userId: { in: users.map((u) => u.id) } }, select: { userId: true } })).map((k) => k.userId));
  // The Owner's key first, then anyone else's at the shop.
  const order = users.filter((u) => saved.has(u.id)).sort((a, b) => Number(b.role.name === "Owner") - Number(a.role.name === "Owner"));
  let key: { provider: AiProvider; key: string } | null = null;
  for (const u of order) {
    const k = await loadAiKey(u.id);
    if (k) { key = { provider: k.provider, key: k.key }; break; }
  }
  keyCache = { at: Date.now(), key };
  return key;
}

export function forgetSupportKey() {
  keyCache = null;
}

// --- Limits --------------------------------------------------------------------------

const PER_VISITOR = 20;          // questions an hour
const PER_DAY = 500;             // questions a day, everyone together
const hits = new Map<string, number[]>();
let day = { date: "", count: 0 };

/** Whether a visitor may ask now; counts the question when they may. */
export function takeSupportTurn(ip: string): "ok" | "visitor" | "day" {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  if (day.date !== today) day = { date: today, count: 0 };
  if (day.count >= PER_DAY) return "day";
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= PER_VISITOR) { hits.set(ip, recent); return "visitor"; }
  recent.push(now);
  hits.set(ip, recent);
  day.count++;
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 3_600_000)) hits.delete(k);
  return "ok";
}

export async function askSupport(turns: ChatTurn[]): Promise<string | null> {
  const key = await supportKey();
  if (!key) return null;
  return askPlain(key, systemPrompt(), turns);
}
