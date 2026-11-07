import { prisma } from "./prisma";
import { loadAiKey, type AiProvider } from "./aiKey";
import { askAgent, type ChatTurn, type ToolSet } from "./aiAgent";
import { MANUAL, MANUAL_CATEGORY_LABEL } from "./manual";
import SCREENS from "./supportScreens.json";

/** "Ask for support" beside the user manual: a visitor's question about using Mahar POS,
 *  answered from the whole manual and from what each screen of the app really shows.
 *
 *  The screen reference (supportScreens.json) is read from the app's own source by
 *  scripts/gen-support-screens.mjs: every screen's buttons, fields and messages in the
 *  Myanmar the app shows, and the sidebar menu with who may see each entry. The model looks
 *  screens up before naming a button, so it names only what exists.
 *
 *  It runs on Mahar Shwe's own AI key (the one saved for its Telegram AI helper), so visitors
 *  need no key. Being public, it is rate limited per visitor and per day, and it reads no
 *  shop's records. */

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

/** Who sees a menu entry, in words. */
function who(permission: string | undefined): string {
  if (!permission || permission === "everyone" || permission === "null") return "everyone";
  if (permission === "settings.manage") return "Owner only";
  return `staff whose role has ${permission}`;
}

function menuText(): string {
  const lines: string[] = [];
  let section = "";
  for (const m of SCREENS.menu) {
    if (m.section && m.section !== section) { section = m.section; lines.push(`[${section}]`); }
    lines.push(`${m.under ? "    " : "  "}${m.name} — ${m.path} — ${who(m.permission)}`);
  }
  lines.push("Wallets entry has tabs: " + SCREENS.walletTabs.map((t) => `${t.name} (${t.path})`).join(", "));
  lines.push("Repair Jobs entry has tabs: " + SCREENS.repairTabs.map((t) => `${t.name} (${t.path})`).join(", "));
  lines.push("The + (create) button at the top offers, on each screen: " + SCREENS.createActions.map((a) => `${a.on}: ${a.button}`).join("; "));
  return lines.join("\n");
}

/** How the money features work, as the app does it. */
const RULES = [
  "Mistakes are never deleted: a sale, purchase, transfer or income/expense entry is undone with Void, Cancel or Reverse, with a reason, and the record stays in the history and the Audit Logs.",
  "Every change to a wallet balance (Cash, KPay, Wave and other wallets) goes through one ledger, so balances always match their history.",
  "An expense counts on the day the money is actually paid. A purchase on credit becomes expense only as the supplier is paid (Credit & Payable), on the day of each payment.",
  "Stock is valued at average cost; cancelling a purchase takes its price back out of the average cost.",
  "A transfer's fee is recorded as a Transfer Fee expense, and reversing the transfer reverses the fee too.",
  "Reports: a month is the sum of its days; profit sections add up to the total profit. Bill/top-up income is not counted twice.",
  "Repair parts (Settings): either 'parts from stock' (parts are bought as a Service purchase and counted as expense when bought) or 'parts bought per job' (each job's parts cost is taken off on the day the job is paid). Daily repair profit = repair income (repairs paid plus service income entered as Other income) − that day's repair expense (Daily Service Expense) − per-job parts cost when parts are bought per job.",
  "A purchase is tagged Sale or Service; moving it between them is in a Danger zone and needs the permission to cancel purchases.",
  "Staff can never grant a permission they do not have themselves; an Admin cannot make themselves Owner; only the Owner can change the Owner's account; Settings are for the Owner.",
  "Cost price and profit are shown only to staff whose role allows it.",
].map((r) => `• ${r}`).join("\n");

let systemCache: string | null = null;
function systemPrompt(): string {
  return (systemCache ??= [
    "You are the support assistant of Mahar POS (app.maharpos.shop), a cloud business management software for shops in Myanmar.",
    "You answer visitors' questions about how to use Mahar POS and how each function works. You must be exact: every menu, button, field and message you name must really exist.",
    "",
    "How to answer:",
    "1. Find the answer in the USER MANUAL and the HOW IT WORKS rules below.",
    "2. Before naming any button, field, tab or message, look up the screen with the screen tool (or search with find_label) and use its exact Myanmar name with the English in brackets, as the reference gives it, e.g. ပြန်ဖွင့်မည် (Reopen). Name the menu path the way the MENU below shows it.",
    "3. Answer in Myanmar (Burmese), politely and clearly. For how-to questions give numbered steps (1. 2. 3.), each a single action on a named screen. For 'how does it work' questions explain what happens and why, then how to use it.",
    "4. If neither the manual, the rules nor the screen reference show something, do not guess and do not make up a way: say plainly that you are not sure, say what you do know, and suggest asking the support team on Telegram: " + TELEGRAM_HELP,
    "5. Mention who may do it when it depends on permissions (see the MENU).",
    "6. End with the link of the most relevant manual guide when there is one.",
    "Plain text only: no Markdown (no **, #, or tables).",
    "Mahar POS is free for now because it is still in its development period; if paid plans come later, shops will be told in advance and keep their data.",
    "You cannot see any shop's records. For a shop's own numbers, tell them where in the app to look (or the Telegram AI helper).",
    "Never talk about source code, servers or technical internals. Stay on Mahar POS; politely decline unrelated requests.",
    "",
    "MENU (name — address — who sees it):",
    menuText(),
    "",
    "SCREENS you can look up: " + SCREENS.screens.map((s) => s.path).join(", "),
    "",
    "HOW IT WORKS:",
    RULES,
    "",
    "USER MANUAL:",
    manualText(),
  ].join("\n"));
}

// --- Lookups --------------------------------------------------------------------------

const SCREEN_TOOLS: ToolSet = {
  tools: [
    {
      name: "screen",
      description: "Everything one screen of the app shows: its buttons, fields, tabs, columns and messages, as 'Myanmar (English)'. Use it before naming anything on that screen.",
      parameters: { type: "object", properties: { path: { type: "string", description: "The screen's address from the SCREENS list, e.g. /pos or /repairs" } }, required: ["path"] },
    },
    {
      name: "find_label",
      description: "Which screens show a word or phrase (Myanmar or English), with the matching labels. Use it to find where a function is.",
      parameters: { type: "object", properties: { text: { type: "string", description: "A word or phrase, e.g. Reopen, warranty, ငွေလွှဲ" } }, required: ["text"] },
    },
  ],
  run: async (name, args) => {
    if (name === "screen") {
      const path = String(args.path ?? "").trim().replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/";
      const s = SCREENS.screens.find((x) => x.path === path);
      if (!s) return { error: `No screen ${path}. Screens: ${SCREENS.screens.map((x) => x.path).join(", ")}` };
      const menu = SCREENS.menu.find((m) => m.path === path);
      return { path, menu: menu ? { name: menu.name, whoSees: who(menu.permission) } : null, labels: s.labels };
    }
    if (name === "find_label") {
      const q = String(args.text ?? "").trim().toLowerCase();
      if (q.length < 2) return { error: "Give a longer word" };
      const hits = SCREENS.screens
        .map((s) => ({ path: s.path, labels: s.labels.filter((l) => l.toLowerCase().includes(q)).slice(0, 15) }))
        .filter((s) => s.labels.length);
      return hits.length ? { matches: hits.slice(0, 10) } : { matches: [], note: "No screen shows this word; try another word or a Myanmar/English equivalent." };
    }
    return { error: `Unknown lookup ${name}` };
  },
};

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
  return askAgent(key, systemPrompt(), turns, SCREEN_TOOLS, 6000);
}

/** For tests: the lookups the model gets. */
export const supportLookups = SCREEN_TOOLS;
