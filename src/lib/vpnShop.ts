import { prisma } from "./prisma";
import { nextNumber } from "./sequence";
import { audit } from "./audit";
import { fmtMoneyPlain } from "./format";
import { dateRangeUtc, todayBusinessDate } from "./dates";
import { btn, keyboard, linkBtn, sendMessage, sendMessageWith, type InlineButton } from "./telegram";
import { createOutlineKey, deleteOutlineKey, outlineAccessUrls, outlineConfigured, outlineUsage, removeOutlineLimit, setOutlineLimit, OutlineError } from "./outline";

// ---------------------------------------------------------------------------
// VPN keys sold on a shop's Telegram bot. Only for the one shop named on the server
// (VPN_BUSINESS_ID), with its Outline server (outline.ts); every other shop never sees it,
// and nothing about it is in the app's screens.
//
// VPN is kept apart from the shop's POS: its plans are not items and its sales are not POS
// sales or Online Shop orders. Staff set the plans and see the takings from the bot's own
// 🔐 VPN menu. A purchase is paid first: the customer sends the slip, staff check the money
// and tap Paid, and only then is the key made and sent.
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60_000;

export function vpnEnabled(businessId: string): boolean {
  return Boolean(process.env.VPN_BUSINESS_ID) && process.env.VPN_BUSINESS_ID === businessId && outlineConfigured();
}

const asciiNum = (s: string) => s.replace(/[၀-၉]/g, (d) => String("၀၁၂၃၄၅၆၇၈၉".indexOf(d)));

/** How long and how much a plan's name gives: "1 Month 50GB" → 30 days, 50 GB. A name that
 *  says no time is a month; one that says no amount (or "Unlimited") has no data limit. */
export function parsePlan(name: string): { days: number; limitBytes: bigint | null } {
  const n = asciiNum(name);
  const num = (re: RegExp) => { const m = n.match(re); return m ? Number(m[1]) : null; };
  const days = num(/(\d+)\s*(?:days?|ရက်)/i)
    ?? ((num(/(\d+)\s*(?:months?|mo\b|လ)/i) ?? 0) * 30 || null)
    ?? ((num(/(\d+)\s*(?:years?|yr|နှစ်)/i) ?? 0) * 365 || null)
    ?? 30;
  const gb = n.match(/(\d+(?:\.\d+)?)\s*GB/i);
  const limitBytes = gb && !/unlimited|အကန့်အသတ်မရှိ/i.test(n) ? BigInt(Math.round(Number(gb[1]) * 1e9)) : null;
  return { days: Math.max(1, Math.min(days, 3650)), limitBytes };
}

/** A plan as staff type it: the name, then the price — "1 Month 50GB = 5000" or
 *  "1 Month 50GB 5000". The price is in the shop's currency, in whole units. */
export function parsePlanLine(text: string): { name: string; price: bigint; days: number; limitBytes: bigint | null } | null {
  const t = asciiNum(text).trim();
  const m = t.match(/^(.*?)\s*(?:=|:|\s)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:ks|kyat|ကျပ်|mmk|thb|baht|ဘတ်)?$/i);
  if (!m) return null;
  const name = m[1].replace(/[=:]\s*$/, "").trim().slice(0, 60);
  const price = Number(m[2].replace(/,/g, ""));
  if (!name || !(price > 0)) return null;
  return { name, price: BigInt(Math.round(price * 100)), ...parsePlan(name) };
}

export interface VpnPlan { id: string; name: string; price: bigint; days: number; limitBytes: bigint | null }

export async function loadVpnPlans(businessId: string): Promise<VpnPlan[]> {
  if (!vpnEnabled(businessId)) return [];
  return prisma.vpnPlan.findMany({
    where: { businessId, active: true },
    select: { id: true, name: true, price: true, days: true, limitBytes: true },
    orderBy: [{ price: "asc" }, { createdAt: "asc" }],
  });
}

const gbText = (bytes: bigint | null) => (bytes == null ? "အကန့်အသတ်မရှိ" : `${Number(bytes) / 1e9} GB / ၃၀ ရက်`);
const dayText = (d: Date, timeZone = "Asia/Yangon") =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(d);

export function planLine(plan: VpnPlan, currency: string): string {
  return `${plan.name} · ${fmtMoneyPlain(plan.price, currency)}`;
}

export function planText(plan: VpnPlan, currency: string): string {
  return [`🔐 ${plan.name}`, `⏳ ${plan.days} ရက်`, `📦 ${gbText(plan.limitBytes)}`, `💰 ${fmtMoneyPlain(plan.price, currency)}`].join("\n");
}

/** The order for a plan, paid first. A renewal names the key it extends. */
export async function placeVpnOrder(
  businessId: string, plan: VpnPlan,
  input: { ownerUserId: string; chatId: string; customerName: string; username?: string; renewId?: string },
) {
  return prisma.$transaction(async (tx) => {
    const orderNo = await nextNumber(tx, businessId, "VPN_ORDER", (n) => `VPN-${String(n).padStart(5, "0")}`);
    return tx.vpnOrder.create({
      data: {
        businessId, orderNo, ownerUserId: input.ownerUserId, chatId: input.chatId,
        customerName: input.customerName.slice(0, 80), username: input.username ?? null,
        planId: plan.id, planName: plan.name, days: plan.days, limitBytes: plan.limitBytes, price: plan.price,
        renewKeyId: input.renewId ?? null,
      },
      select: { id: true, orderNo: true },
    });
  });
}

const OUTLINE_APPS = "https://getoutline.org/get-started/#step-3";

type Order = { id: string; orderNo: string; businessId: string; ownerUserId: string; chatId: string; planName: string; days: number; limitBytes: bigint | null; renewKeyId: string | null; keySent: boolean };

/** Make (or extend) the key a paid order bought and send it. Safe to call again: an order
 *  whose key went out is not served twice. */
async function deliver(order: Order) {
  if (order.keySent) return "already" as const;
  const chatId = order.chatId;
  const existing = order.renewKeyId
    ? await prisma.vpnKey.findFirst({ where: { id: order.renewKeyId, businessId: order.businessId, chatId, deletedAt: null } })
    : null;

  if (existing) {
    // Time is added on from whichever is later, today or the old end, so nothing paid for is lost.
    const from = existing.expiresAt > new Date() ? existing.expiresAt : new Date();
    const expiresAt = new Date(from.getTime() + order.days * DAY);
    if (order.limitBytes != null) await setOutlineLimit(existing.outlineKeyId, order.limitBytes);
    else await removeOutlineLimit(existing.outlineKeyId).catch(() => {});
    await prisma.vpnKey.update({
      where: { id: existing.id },
      data: { expiresAt, planName: order.planName, dataLimitBytes: order.limitBytes, disabledAt: null, remindedAt: null },
    });
    await prisma.vpnOrder.update({ where: { id: order.id }, data: { keySent: true } });
    await sendMessage(chatId, [`✅ VPN သက်တမ်း တိုးပြီးပါပြီ (${order.orderNo})`, `⏳ ${dayText(expiresAt)} အထိ`, `📦 ${gbText(order.limitBytes)}`, "", "Key အဟောင်းကိုပဲ ဆက်သုံးပါ။"].join("\n"));
    return "renewed" as const;
  }

  const key = await createOutlineKey(`${order.orderNo} tg${chatId}`, order.limitBytes);
  const expiresAt = new Date(Date.now() + order.days * DAY);
  try {
    await prisma.vpnKey.create({
      data: {
        businessId: order.businessId, orderId: order.id, ownerUserId: order.ownerUserId, chatId, outlineKeyId: key.id,
        planName: order.planName, dataLimitBytes: order.limitBytes, expiresAt,
      },
    });
  } catch (e) {
    // Another tap got there first: keep its key, drop this one.
    await deleteOutlineKey(key.id).catch(() => {});
    throw e;
  }
  await prisma.vpnOrder.update({ where: { id: order.id }, data: { keySent: true } });
  await sendMessage(chatId, [
    `🔐 VPN Key ရပါပြီ (${order.orderNo})`,
    `⏳ ${dayText(expiresAt)} အထိ`,
    `📦 ${gbText(order.limitBytes)}`,
    "",
    "ချိတ်နည်း:",
    "1. Outline app ကို ထည့်ပါ (Android / iPhone / Windows)",
    "2. အောက်က Key ကို ကူးပြီး Outline ထဲ ထည့်ပါ",
    "3. Connect နှိပ်ပါ",
  ].join("\n"), { replyMarkup: keyboard([[linkBtn("📲 Outline app ရယူရန်", OUTLINE_APPS)]]) });
  // On its own, so it is one long press to copy.
  await sendMessage(chatId, key.accessUrl);
  return "created" as const;
}

type Staff = { id: string; businessId: string; permissions: string[] };

/** A staff member's answer to a VPN order from their own chat: Paid makes and sends the key,
 *  Not paid cancels it. Retry makes the key again if the Outline server did not answer. */
export async function handleVpnDecision(staffChatId: string, user: Staff, data: string) {
  const [, action, orderId] = data.split(":");
  if (!user.permissions.includes("sale.create")) return sendMessage(staffChatId, "ဒါကို လုပ်ခွင့် မရှိပါ။");
  if (!vpnEnabled(user.businessId)) return sendMessage(staffChatId, "VPN ကို ဒီဆိုင်မှာ မဖွင့်ထားပါ။");
  const order = await prisma.vpnOrder.findFirst({ where: { id: orderId, businessId: user.businessId } });
  if (!order) return sendMessage(staffChatId, "ဒီ အော်ဒါ မရှိတော့ပါ။");
  const title = `${order.orderNo} · ${order.planName}`;
  const move = async (status: "PAID" | "CANCELLED") => {
    await prisma.vpnOrder.update({ where: { id: order.id }, data: { status, decidedById: user.id, decidedAt: new Date() } });
    await audit(prisma, {
      businessId: user.businessId, userId: user.id, action: `vpn_order.${status.toLowerCase()}`, module: "vpn",
      resourceType: "VpnOrder", resourceId: order.id, before: { status: order.status }, after: { status, price: order.price.toString() },
    });
  };

  if (action === "no") {
    if (order.status !== "NEW") return sendMessage(staffChatId, `${order.orderNo} ကို ဆုံးဖြတ်ပြီးသားပါ။`);
    await move("CANCELLED");
    await sendMessage(order.chatId, `❌ ${order.orderNo} ငွေလွှဲတာ မတွေ့ပါ။ မှန်ရင် ဆိုင်ကို ဆက်သွယ်ပေးပါ။`);
    return sendMessage(staffChatId, `❌ ${title}\nပယ်ပြီးပါပြီ။ Customer ကို အသိပေးပြီးပါပြီ။`);
  }
  if (action !== "ok" && action !== "retry") return;
  if (action === "ok") {
    if (order.status !== "NEW") return sendMessage(staffChatId, `${order.orderNo} ကို ဆုံးဖြတ်ပြီးသားပါ။`);
    await move("PAID");
  } else if (order.status !== "PAID") return sendMessage(staffChatId, `${order.orderNo} ကို ငွေရပြီ မနှိပ်ရသေးပါ။`);

  try {
    const done = await deliver(order);
    if (done === "already") return sendMessage(staffChatId, `${order.orderNo} Key ပို့ပြီးသားပါ။`);
    return sendMessage(staffChatId, `✅ ${title}\n${done === "renewed" ? "သက်တမ်း တိုးပြီး" : "Key ထုတ်ပြီး"} Customer ကို ပို့ပြီးပါပြီ။`, {
      replyMarkup: keyboard([[btn("🔐 VPN စာရင်း", "vpa:home")]]),
    });
  } catch (e) {
    console.error("[vpn] key failed:", e instanceof Error ? e.message : e);
    if (action === "ok") await sendMessage(order.chatId, `✅ ${order.orderNo} ငွေရပါပြီ။ Key ကို ခဏနေ ပို့ပေးပါမယ်။`);
    return sendMessage(staffChatId, `⚠️ ${title}\nငွေရပြီ၊ ဒါပေမဲ့ VPN Server က Key မထုတ်ပေးနိုင်ပါ${e instanceof OutlineError ? ` (${e.message})` : ""}။ ခဏနေ ပြန်နှိပ်ပါ။`, {
      replyMarkup: keyboard([[btn("🔁 Key ပြန်ထုတ်မည်", `vp:retry:${order.id}`)]]),
    });
  }
}

// ---------------------------------------------------------------------------
// The staff side, in the bot's own 🔐 VPN menu: the takings, the plans, adding and removing one.
// ---------------------------------------------------------------------------

async function currencyOf(businessId: string) {
  return (await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } }))?.currency ?? "MMK";
}

async function takings(businessId: string, since: Date) {
  const r = await prisma.vpnOrder.aggregate({
    where: { businessId, status: "PAID", decidedAt: { gte: since } }, _sum: { price: true }, _count: true,
  });
  return { count: r._count, total: r._sum.price ?? 0n };
}

/** The VPN menu: today's and this month's takings, keys in use, orders waiting, the plans. */
export async function vpnAdminHome(chatId: string, user: Staff, note?: string) {
  const businessId = user.businessId;
  const today = todayBusinessDate();
  const [currency, plans, day, month, active, waiting] = await Promise.all([
    currencyOf(businessId),
    prisma.vpnPlan.findMany({ where: { businessId, active: true }, orderBy: [{ price: "asc" }, { createdAt: "asc" }] }),
    takings(businessId, dateRangeUtc(today).gte),
    takings(businessId, dateRangeUtc(`${today.slice(0, 7)}-01`).gte),
    prisma.vpnKey.count({ where: { businessId, deletedAt: null, disabledAt: null } }),
    prisma.vpnOrder.count({ where: { businessId, status: "NEW" } }),
  ]);
  const money = (v: bigint) => fmtMoneyPlain(v, currency);
  const rows: InlineButton[][] = plans.map((p) => [btn(`🗑 ${p.name}`.slice(0, 60), `vpa:del:${p.id}`)]);
  await sendMessage(chatId, [
    ...(note ? [note, ""] : []),
    "🔐 VPN (POS နဲ့ သီးသန့်)",
    "",
    `ယနေ့: ${day.count} ခု · ${money(day.total)}`,
    `ဒီလ: ${month.count} ခု · ${money(month.total)}`,
    `သုံးနေဆဲ Key: ${active}${waiting ? ` · ငွေစစ်ရန် စောင့်နေ: ${waiting}` : ""}`,
    "",
    plans.length ? "Plan များ:" : "Plan မရှိသေးပါ။ ➕ နှိပ်ပြီး ထည့်ပါ။",
    ...plans.map((p) => `• ${p.name} · ${p.days} ရက် · ${gbText(p.limitBytes)} · ${money(p.price)}`),
    ...(plans.length ? ["", "Plan ဖြုတ်ချင်ရင် 🗑 ကို နှိပ်ပါ။"] : []),
  ].join("\n"), { replyMarkup: keyboard([[btn("➕ Plan အသစ်", "vpa:add")], ...rows, [btn("🏠 Menu", "cancel")]]) });
}

export async function vpnAskPlan(chatId: string) {
  await sendMessage(chatId, [
    "➕ Plan နာမည်နဲ့ ဈေးကို တစ်ကြောင်းတည်း ရိုက်ပါ:",
    "",
    "1 Month 50GB = 5000",
    "7 Days 10GB = 1500",
    "3 Month Unlimited = 15000",
    "",
    "ရက် (Day / Month / Year) နဲ့ GB ကို နာမည်ကနေ ဖတ်ပါတယ်။ GB မပါရင် အကန့်အသတ်မရှိ။",
  ].join("\n"), { replyMarkup: keyboard([[btn("✕ မလုပ်တော့ပါ", "vpa:home")]]) });
}

/** A plan typed by staff. Returns false (and says why) when the line cannot be read. */
export async function vpnAddPlanText(chatId: string, user: Staff, text: string): Promise<boolean> {
  const plan = parsePlanLine(text);
  if (!plan) {
    await sendMessage(chatId, "နားမလည်ပါ။ ဥပမာ: 1 Month 50GB = 5000", { replyMarkup: keyboard([[btn("✕ မလုပ်တော့ပါ", "vpa:home")]]) });
    return false;
  }
  const row = await prisma.vpnPlan.create({ data: { businessId: user.businessId, ...plan } });
  await audit(prisma, {
    businessId: user.businessId, userId: user.id, action: "vpn_plan.create", module: "vpn",
    resourceType: "VpnPlan", resourceId: row.id, after: { name: plan.name, days: plan.days, price: plan.price.toString() },
  });
  await vpnAdminHome(chatId, user, `✅ ${plan.name} ထည့်ပြီးပါပြီ။`);
  return true;
}

/** The 🔐 VPN menu's buttons (vpa:…), apart from adding a plan, which waits for typing. */
export async function handleVpnAdmin(chatId: string, user: Staff, data: string) {
  if (!vpnEnabled(user.businessId)) return sendMessage(chatId, "VPN ကို ဒီဆိုင်မှာ မဖွင့်ထားပါ။");
  const [, action, id] = data.split(":");
  if (action === "del" && id) {
    // Taken off sale, not deleted: orders and keys still name it.
    const plan = await prisma.vpnPlan.findFirst({ where: { id, businessId: user.businessId, active: true } });
    if (plan) {
      await prisma.vpnPlan.update({ where: { id }, data: { active: false } });
      await audit(prisma, {
        businessId: user.businessId, userId: user.id, action: "vpn_plan.remove", module: "vpn",
        resourceType: "VpnPlan", resourceId: id, before: { name: plan.name, active: true }, after: { active: false },
      });
    }
    return vpnAdminHome(chatId, user, plan ? `🗑 ${plan.name} ဖြုတ်ပြီးပါပြီ။` : undefined);
  }
  return vpnAdminHome(chatId, user);
}

// ---------------------------------------------------------------------------
// The customer's own keys, and the hourly expiry check.
// ---------------------------------------------------------------------------

/** The customer's keys on this shop, with how much each has used, and the key to copy again. */
export async function showMyVpn(chatId: string, businessId: string, back: InlineButton[]) {
  const keys = await prisma.vpnKey.findMany({ where: { businessId, chatId, deletedAt: null }, orderBy: { createdAt: "asc" } });
  if (keys.length === 0) {
    await sendMessage(chatId, "🔑 VPN Key မရှိသေးပါ။", { replyMarkup: keyboard([[btn("🔐 VPN ဝယ်ရန်", "s:vps")], back]) });
    return;
  }
  const [urls, usage] = await Promise.all([outlineAccessUrls().catch(() => new Map<string, string>()), outlineUsage().catch(() => new Map<string, number>())]);
  for (const k of keys) {
    const used = usage.get(k.outlineKeyId);
    const status = k.disabledAt ? "⛔ သက်တမ်းကုန်" : k.expiresAt.getTime() - Date.now() < 3 * DAY ? "⚠️ မကြာခင် ကုန်မည်" : "✅ သုံးလို့ရ";
    await sendMessage(chatId, [
      `🔐 ${k.planName}`,
      `${status} · ${dayText(k.expiresAt)} အထိ`,
      `📦 ${gbText(k.dataLimitBytes)}${used != null ? ` · သုံးပြီး ${(used / 1e9).toFixed(1)} GB` : ""}`,
    ].join("\n"), { replyMarkup: keyboard([[btn("🔁 သက်တမ်းတိုးမည်", `s:vpr:${k.id}`)]]) });
    const url = urls.get(k.outlineKeyId);
    if (url && !k.disabledAt) await sendMessage(chatId, url);
  }
  await sendMessage(chatId, "ပင်မ Menu", { replyMarkup: keyboard([back]) });
}

let lastCheck = 0;

/** Once an hour: a reminder three days before a key runs out; at the end, the key is held at no
 *  data (renewing brings it straight back); a week later it is removed from the server. */
export async function runDueVpnChecks(now = new Date()) {
  const shop = process.env.VPN_BUSINESS_ID;
  if (!shop || !outlineConfigured() || now.getTime() - lastCheck < 60 * 60_000) return;
  lastCheck = now.getTime();
  const keys = await prisma.vpnKey.findMany({
    where: { businessId: shop, deletedAt: null, expiresAt: { lt: new Date(now.getTime() + 3 * DAY) } },
  });
  const tokens = new Map<string, string | null>();
  const tell = async (k: { ownerUserId: string; chatId: string }, text: string) => {
    if (!tokens.has(k.ownerUserId)) {
      const u = await prisma.user.findUnique({ where: { id: k.ownerUserId }, select: { telegramBotToken: true } });
      tokens.set(k.ownerUserId, u?.telegramBotToken ?? null);
    }
    const token = tokens.get(k.ownerUserId);
    if (token) await sendMessageWith(token, k.chatId, text).catch(() => {});
  };
  for (const k of keys) {
    try {
      if (k.disabledAt && now.getTime() - k.disabledAt.getTime() >= 7 * DAY) {
        await deleteOutlineKey(k.outlineKeyId).catch(() => {});
        await prisma.vpnKey.update({ where: { id: k.id }, data: { deletedAt: now } });
      } else if (!k.disabledAt && k.expiresAt <= now) {
        await setOutlineLimit(k.outlineKeyId, 0n);
        await prisma.vpnKey.update({ where: { id: k.id }, data: { disabledAt: now } });
        await tell(k, `⛔ VPN (${k.planName}) သက်တမ်း ကုန်သွားပါပြီ။\nBot မှာ 🔑 ကျွန်ုပ်၏ VPN ကို နှိပ်ပြီး ၇ ရက်အတွင်း သက်တမ်းတိုးရင် Key အဟောင်းကိုပဲ ဆက်သုံးလို့ ရပါတယ်။`);
      } else if (!k.disabledAt && !k.remindedAt && k.expiresAt > now) {
        await prisma.vpnKey.update({ where: { id: k.id }, data: { remindedAt: now } });
        await tell(k, `⚠️ VPN (${k.planName}) ${dayText(k.expiresAt)} မှာ သက်တမ်း ကုန်ပါမယ်။\nBot မှာ 🔑 ကျွန်ုပ်၏ VPN ကို နှိပ်ပြီး သက်တမ်းတိုးလို့ ရပါတယ်။`);
      }
    } catch (e) {
      console.error("[vpn check]", e instanceof Error ? e.message : e);
    }
  }
}
