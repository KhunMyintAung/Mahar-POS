import { prisma } from "./prisma";
import { nextNumber } from "./sequence";
import { audit } from "./audit";
import { fmtMoneyPlain } from "./format";
import { btn, keyboard, linkBtn, sendMessage, sendMessageWith } from "./telegram";
import { createOutlineKey, deleteOutlineKey, outlineAccessUrls, outlineConfigured, outlineUsage, removeOutlineLimit, setOutlineLimit, OutlineError } from "./outline";

// ---------------------------------------------------------------------------
// VPN keys sold on a shop's Telegram bot. Only for the one shop named on the server
// (VPN_BUSINESS_ID), with its Outline server (outline.ts); every other shop never sees it,
// and nothing about it is in the app's screens.
//
// The plans are the shop's items in a "VPN" category ("VPN 1 Month 50GB"): their price is the
// price, and the name says how long and how much. They need not be shown in the Online Shop.
// A purchase is an Online Shop order paid first: the customer sends the slip, staff check the
// money and tap Paid, and only then is the key made and sent. Staff ring the order up in POS
// into the wallet the money went to, like any online order.
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60_000;

export function vpnEnabled(businessId: string): boolean {
  return Boolean(process.env.VPN_BUSINESS_ID) && process.env.VPN_BUSINESS_ID === businessId && outlineConfigured();
}

/** How long and how much a plan's name gives: "VPN 1 Month 50GB" → 30 days, 50 GB. A name
 *  that says no time is a month; one that says no amount (or "Unlimited") has no data limit. */
export function parsePlan(name: string): { days: number; limitBytes: bigint | null } {
  const n = name.replace(/[၀-၉]/g, (d) => String("၀၁၂၃၄၅၆၇၈၉".indexOf(d)));
  const num = (re: RegExp) => { const m = n.match(re); return m ? Number(m[1]) : null; };
  const days = num(/(\d+)\s*(?:days?|ရက်)/i)
    ?? ((num(/(\d+)\s*(?:months?|mo\b|လ)/i) ?? 0) * 30 || null)
    ?? ((num(/(\d+)\s*(?:years?|yr|နှစ်)/i) ?? 0) * 365 || null)
    ?? 30;
  const gb = n.match(/(\d+(?:\.\d+)?)\s*GB/i);
  const limitBytes = gb && !/unlimited|အကန့်အသတ်မရှိ/i.test(n) ? BigInt(Math.round(Number(gb[1]) * 1e9)) : null;
  return { days: Math.max(1, Math.min(days, 3650)), limitBytes };
}

export interface VpnPlan { id: string; name: string; price: bigint; days: number; limitBytes: bigint | null }

const VPN_CATEGORY = /\bvpn\b/i;

export async function loadVpnPlans(businessId: string): Promise<VpnPlan[]> {
  if (!vpnEnabled(businessId)) return [];
  const cats = await prisma.itemCategory.findMany({ where: { businessId, active: true }, select: { id: true, name: true, parentId: true } });
  const top = cats.filter((c) => VPN_CATEGORY.test(c.name)).map((c) => c.id);
  const ids = [...top, ...cats.filter((c) => c.parentId && top.includes(c.parentId)).map((c) => c.id)];
  if (ids.length === 0) return [];
  const items = await prisma.item.findMany({
    where: { businessId, categoryId: { in: ids }, active: true, deletedAt: null, sellingPrice: { gt: 0 } },
    select: { id: true, name: true, sellingPrice: true },
    orderBy: { sellingPrice: "asc" },
  });
  return items.map((i) => ({ id: i.id, name: i.name, price: i.sellingPrice, ...parsePlan(i.name) }));
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
export async function placeVpnOrder(businessId: string, plan: VpnPlan, input: { customerName: string; username?: string; renewId?: string }) {
  const note = [
    `VPN · ${plan.name}`,
    `Telegram${input.username ? ` @${input.username}` : ""}`,
    "slip on Telegram",
    ...(input.renewId ? [`renew:${input.renewId}`] : []),
  ].join(" · ");
  return prisma.$transaction(async (tx) => {
    const orderNo = await nextNumber(tx, businessId, "ONLINE_ORDER", (n) => `ORD-${String(n).padStart(5, "0")}`);
    return tx.onlineOrder.create({
      data: {
        businessId, orderNo, customerName: input.customerName.slice(0, 80), customerPhone: "", note, total: plan.price,
        lines: { create: [{ itemId: plan.id, name: plan.name, quantity: 1, unitPrice: plan.price }] },
      },
      select: { id: true, orderNo: true },
    });
  });
}

const SENT = " · key sent";
const OUTLINE_APPS = "https://getoutline.org/get-started/#step-3";

/** Make (or extend) the key an approved order paid for and send it. Safe to call again: an
 *  order whose key went out is not served twice. */
async function deliver(order: { id: string; orderNo: string; businessId: string; note: string | null; lines: { itemId: string; name: string }[] }, chatId: string, ownerUserId: string) {
  if (order.note?.endsWith(SENT)) return "already" as const;
  const line = order.lines[0];
  const plan = { name: line.name, ...parsePlan(line.name) };
  const renewId = order.note?.match(/renew:([0-9a-f-]{36})/)?.[1];
  const existing = renewId
    ? await prisma.vpnKey.findFirst({ where: { id: renewId, businessId: order.businessId, chatId, deletedAt: null } })
    : null;

  if (existing) {
    // Time is added on from whichever is later, today or the old end, so nothing paid for is lost.
    const from = existing.expiresAt > new Date() ? existing.expiresAt : new Date();
    const expiresAt = new Date(from.getTime() + plan.days * DAY);
    if (plan.limitBytes != null) await setOutlineLimit(existing.outlineKeyId, plan.limitBytes);
    else await removeOutlineLimit(existing.outlineKeyId).catch(() => {});
    await prisma.vpnKey.update({
      where: { id: existing.id },
      data: { expiresAt, planName: plan.name, dataLimitBytes: plan.limitBytes, disabledAt: null, remindedAt: null },
    });
    await prisma.onlineOrder.update({ where: { id: order.id }, data: { note: `${order.note ?? ""}${SENT}` } });
    await sendMessage(chatId, [`✅ VPN သက်တမ်း တိုးပြီးပါပြီ (${order.orderNo})`, `⏳ ${dayText(expiresAt)} အထိ`, `📦 ${gbText(plan.limitBytes)}`, "", "Key အဟောင်းကိုပဲ ဆက်သုံးပါ။"].join("\n"));
    return "renewed" as const;
  }

  const key = await createOutlineKey(`${order.orderNo} tg${chatId}`, plan.limitBytes);
  const expiresAt = new Date(Date.now() + plan.days * DAY);
  try {
    await prisma.vpnKey.create({
      data: {
        businessId: order.businessId, orderId: order.id, ownerUserId, chatId, outlineKeyId: key.id,
        planName: plan.name, dataLimitBytes: plan.limitBytes, expiresAt,
      },
    });
  } catch (e) {
    // Another tap got there first: keep its key, drop this one.
    await deleteOutlineKey(key.id).catch(() => {});
    throw e;
  }
  await prisma.onlineOrder.update({ where: { id: order.id }, data: { note: `${order.note ?? ""}${SENT}` } });
  await sendMessage(chatId, [
    `🔐 VPN Key ရပါပြီ (${order.orderNo})`,
    `⏳ ${dayText(expiresAt)} အထိ`,
    `📦 ${gbText(plan.limitBytes)}`,
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

/** A staff member's answer to a VPN order from their own chat: Paid makes and sends the key,
 *  Not paid cancels it. Retry makes the key again if the Outline server did not answer. */
export async function handleVpnDecision(
  staffChatId: string, user: { id: string; businessId: string; permissions: string[] }, data: string,
) {
  const [, action, orderId, customerChat] = data.split(":");
  if (!user.permissions.includes("sale.create")) return sendMessage(staffChatId, "ဒါကို လုပ်ခွင့် မရှိပါ။");
  if (!vpnEnabled(user.businessId)) return sendMessage(staffChatId, "VPN ကို ဒီဆိုင်မှာ မဖွင့်ထားပါ။");
  const order = await prisma.onlineOrder.findFirst({ where: { id: orderId, businessId: user.businessId }, include: { lines: true } });
  if (!order || order.lines.length === 0) return sendMessage(staffChatId, "ဒီ အော်ဒါ မရှိတော့ပါ။");
  const title = `${order.orderNo} · ${order.lines[0].name}`;
  const move = async (status: "CONFIRMED" | "CANCELLED") => {
    await prisma.onlineOrder.update({ where: { id: order.id }, data: { status } });
    await audit(prisma, {
      businessId: user.businessId, userId: user.id, action: `online_order.${status.toLowerCase()}`, module: "sales",
      resourceType: "OnlineOrder", resourceId: order.id, before: { status: order.status }, after: { status, via: "telegram vpn" },
    });
  };

  if (action === "no") {
    if (order.status !== "NEW") return sendMessage(staffChatId, `${order.orderNo} ကို ဆုံးဖြတ်ပြီးသားပါ။`);
    await move("CANCELLED");
    await sendMessage(customerChat, `❌ ${order.orderNo} ငွေလွှဲတာ မတွေ့ပါ။ မှန်ရင် ဆိုင်ကို ဆက်သွယ်ပေးပါ။`);
    return sendMessage(staffChatId, `❌ ${title}\nပယ်ပြီးပါပြီ။ Customer ကို အသိပေးပြီးပါပြီ။`);
  }
  if (action !== "ok" && action !== "retry") return;
  if (action === "ok") {
    if (order.status !== "NEW") return sendMessage(staffChatId, `${order.orderNo} ကို ဆုံးဖြတ်ပြီးသားပါ။`);
    await move("CONFIRMED");
  } else if (order.status !== "CONFIRMED") return sendMessage(staffChatId, `${order.orderNo} ကို ငွေရပြီ မနှိပ်ရသေးပါ။`);

  try {
    const done = await deliver(order, customerChat, user.id);
    if (done === "already") return sendMessage(staffChatId, `${order.orderNo} Key ပို့ပြီးသားပါ။`);
    return sendMessage(staffChatId, `✅ ${title}\n${done === "renewed" ? "သက်တမ်း တိုးပြီး" : "Key ထုတ်ပြီး"} Customer ကို ပို့ပြီးပါပြီ။\n\nOnline Shop ထဲက ${order.orderNo} ကို POS မှာ ငွေဝင်တဲ့ Wallet နဲ့ ငွေရှင်းပါ။`);
  } catch (e) {
    console.error("[vpn] key failed:", e instanceof Error ? e.message : e);
    if (action === "ok") await sendMessage(customerChat, `✅ ${order.orderNo} ငွေရပါပြီ။ Key ကို ခဏနေ ပို့ပေးပါမယ်။`);
    return sendMessage(staffChatId, `⚠️ ${title}\nငွေရပြီ၊ ဒါပေမဲ့ VPN Server က Key မထုတ်ပေးနိုင်ပါ${e instanceof OutlineError ? ` (${e.message})` : ""}။ ခဏနေ ပြန်နှိပ်ပါ။`, {
      replyMarkup: keyboard([[btn("🔁 Key ပြန်ထုတ်မည်", `vp:retry:${order.id}:${customerChat}`)]]),
    });
  }
}

/** The customer's keys on this shop, with how much each has used, and the key to copy again. */
export async function showMyVpn(chatId: string, businessId: string, back: ReturnType<typeof btn>[]) {
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
