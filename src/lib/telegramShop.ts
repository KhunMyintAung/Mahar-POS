import { prisma } from "./prisma";
import { answerCallbackQuery, btn, keyboard, linkBtn, sendChatAction, sendDocument, sendMessage, sendPhoto, withTranscript, type InlineButton, type TgMessage, type TgUpdate, type TgUser } from "./telegram";
import { notifyReportTargets } from "./telegramReports";
import { loadAiKey } from "./aiKey";
import { askAgent, AiError, type ChatTurn } from "./aiAgent";
import { CUSTOMER_TOOLS, VPN_TOOLS, customerPrompt } from "./customerAgent";
import { todayBusinessDate } from "./dates";
import { audit } from "./audit";
import { REPAIR_STATUS_MM } from "./repairStatus";
import { mmNumber } from "./customerBot";
import { allowOrder, loadOnlineShop, publicShop, shopMapHref, type OnlineShopSettings } from "./onlineShop";
import { placeOnlineOrder, type PublicShop } from "./onlineOrder";
import { fmtMoneyPlain } from "./format";
import { loadModuleAccess } from "./moduleAccess";
import { findRepairJobWhere } from "./repairLookup";
import { trackToken } from "./repairTrack";
import { asciiDigits, findParts, hasSpareParts, partQuery, partQuoteText, phoneEndsWith, repairCardText } from "./customerBot";
import { watchRepair } from "./repairWatch";
import { appRows, loadVpnPayment, loadVpnPlans, notifyVpnWaiting, placeVpnOrder, planLine, planText, showMyVpn, VPN_APPS, VPN_HOW_TO, type VpnPlan } from "./vpnShop";

// ---------------------------------------------------------------------------
// The shop's bot for customers: anyone who is not the linked staff member can look
// through what the shop sells online, fill a cart and send an order. The order is an
// ordinary Online Shop order (same prices, same stock check, same Telegram notice to the
// shop), so the shop answers it from Online Shop like one from the web page.
// A shop that repairs phones also answers "is my phone ready?" (the voucher number and the
// last four digits of the phone on it) and "how much is this part?" (customerBot.ts).
// Everything here is in Myanmar: a customer never picked a language.
// ---------------------------------------------------------------------------

const PAGE = 8;
const appUrl = () => (process.env.APP_URL ?? "https://app.maharpos.shop").replace(/\/+$/, "");
const CLOSED = `မင်္ဂလာပါ 🙏

ဤ bot မှတစ်ဆင့် ဝန်ဆောင်မှု မရှိပါ။ ဆိုင်သို့ တိုက်ရိုက် ဆက်သွယ်ပါ။`;

type Shop = PublicShop & { slug: string };
type Item = Shop["items"][number];
interface State {
  /** What the next typed message is: the customer's name, phone or address, a search, a
   *  repair voucher number ("rv") and its phone digits ("rp"), or a part question ("part"). */
  step: "browse" | "name" | "phone" | "address" | "rv" | "rp" | "part" | "tu_id" | "tu_pay" | "vp_pay";
  /** The voucher number typed, kept until the phone digits come. */
  rv?: string;
  /** A game top-up under way: the package, then the game ID it goes to. */
  tu?: { itemId: string; gameId?: string };
  /** A VPN plan being bought, and the key it renews if it is a renewal. */
  vp?: { itemId?: string; renewId?: string };
  /** The last few lines with the AI, so a follow-up question makes sense. */
  chat?: ChatTurn[];
  /** Until when a person at the shop has the conversation and the AI keeps out (ms). */
  humanUntil?: number;
  cart: Record<string, number>;
  name?: string;
  phone?: string;
  address?: string;
  /** The last search, so its pages can be turned. */
  q?: string;
}

// The customer's cart and details live in the bot's session row, like a staff member's
// half-done entry; they are kept after an order so the next one needs no typing.
async function load(ownerUserId: string, chatId: string): Promise<State> {
  const row = await prisma.telegramSession.findUnique({ where: { ownerUserId_chatId: { ownerUserId, chatId } } });
  const data = row ? (JSON.parse(row.data) as Partial<State>) : {};
  return { step: "browse", cart: {}, ...data };
}
async function save(ownerUserId: string, chatId: string, state: State) {
  const data = JSON.stringify(state);
  await prisma.telegramSession.upsert({
    where: { ownerUserId_chatId: { ownerUserId, chatId } },
    create: { ownerUserId, chatId, step: `shop:${state.step}`, data },
    update: { step: `shop:${state.step}`, data },
  });
}

/** What this shop's bot can do for a customer: its online list when the shop has one open,
 *  repairs and part prices when it repairs phones. Null when it does none of these. */
interface Ctx {
  business: { id: string; name: string; phone: string | null; address: string | null; currency: string; latitude: number | null; longitude: number | null };
  cfg: OnlineShopSettings;
  shop: Shop | null;
  repairOn: boolean;
  partsOn: boolean;
  /** The staff member's own chat, told about questions the bot could not answer. */
  ownerChatId: string | null;
  /** Game top-up packages among the items shown online. */
  topups: Item[];
  /** VPN plans, only on the one shop that sells VPN keys (vpnShop.ts). */
  vpn: VpnPlan[];
  /** How to pay for VPN, set in the staff VPN menu. */
  vpnPay: string;
}

/** A game top-up package: an online item whose category or name says so. Such an item is not
 *  put in the cart; it goes to a game ID and is paid for first. */
const TOPUP = /game|top.?up|diamond|\buc\b|pubg|mobile legends|free ?fire/i;
export const isTopup = (i: { name: string; category: string }) => TOPUP.test(`${i.category} ${i.name}`);

async function loadCtx(ownerUserId: string): Promise<Ctx | null> {
  const owner = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { telegramChatId: true, business: { select: { id: true, name: true, phone: true, address: true, currency: true, latitude: true, longitude: true, shopSlug: true } } },
  });
  if (!owner) return null;
  const { shopSlug, ...business } = owner.business;
  const [cfg, access, listed] = await Promise.all([
    loadOnlineShop(business.id),
    loadModuleAccess(business.id),
    shopSlug ? publicShop(shopSlug) : null,
  ]);
  const shop = listed && shopSlug && listed.items.length > 0 ? { ...listed, slug: shopSlug } : null;
  const repairOn = access.features.repair;
  const partsOn = repairOn && (await hasSpareParts(business.id));
  const vpn = await loadVpnPlans(business.id);
  const vpnPay = vpn.length > 0 ? await loadVpnPayment(business.id) : "";
  if (!shop && !repairOn && vpn.length === 0) return null;
  const topups = shop ? shop.items.filter(isTopup) : [];
  return { business, cfg, shop, repairOn, partsOn, ownerChatId: owner.telegramChatId, topups, vpn, vpnPay };
}

const price = (shop: Shop, minor: bigint) => fmtMoneyPlain(minor, shop.business.currency);
const itemName = (i: Item) => [i.name, i.variant].filter(Boolean).join(" · ");

/** Words typed by the customer, matched against name, model, variant and category. */
function search(shop: Shop, q: string): Item[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return shop.items.filter((i) => {
    const text = `${i.name} ${i.model} ${i.variant} ${i.category}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

function categories(shop: Shop): string[] {
  return [...new Set(shop.items.map((i) => i.category || "အခြား"))].sort();
}

function cartCount(state: State) {
  return Object.values(state.cart).reduce((t, n) => t + n, 0);
}

function homeButtons(ctx: Ctx, state: State): InlineButton[][] {
  const rows: InlineButton[][] = [];
  // Repairs and the shop's address are answered when asked (typed), not offered as buttons.
  if (ctx.partsOn) rows.push([btn("📱 ဖုန်းမှန် / Parts ဈေးမေးရန်", "s:part")]);
  if (ctx.topups.length > 0) rows.push([btn("💎 Game ဖြည့်ရန် (ML / PUBG)", "s:tus")]);
  if (ctx.vpn.length > 0) rows.push([btn("🔐 VPN ဝယ်ရန်", "s:vps"), btn("🔑 ကျွန်ုပ်၏ VPN", "s:vpk")]);
  if (ctx.shop) {
    rows.push([btn("🛍 ပစ္စည်းအမျိုးအစားများ", "s:cats")]);
    rows.push([btn(`🛒 ခြင်းတောင်း (${cartCount(state)})`, "s:cart")]);
    rows.push([linkBtn("🌐 Online Shop ဖွင့်ရန်", `${appUrl()}/shop/${ctx.shop.slug}`)]);
  }
  return rows;
}

const shopPhone = (ctx: Ctx) => ctx.cfg.phone.trim() || ctx.business.phone || "";

async function home(chatId: string, ctx: Ctx, state: State) {
  const b = ctx.business;
  await sendMessage(chatId, [
    `🙏 ${b.name} မှ ကြိုဆိုပါတယ်`,
    "",
    ...(ctx.repairOn ? ["🔧 ပြင်ထားတဲ့ ဖုန်း ပြီးမပြီး Voucher နံပါတ် (ဥပမာ MS0012) ရိုက်ပို့ပြီး စစ်လို့ ရပါတယ်။"] : []),
    ...(ctx.partsOn ? ["📱 ဖုန်းမှန်၊ Battery စတဲ့ ပစ္စည်းဈေး မေးလို့ ရပါတယ်။"] : []),
    ...(ctx.topups.length > 0 ? ["💎 ML Diamond၊ PUBG UC ဖြည့်လို့ ရပါတယ်။"] : []),
    ...(ctx.vpn.length > 0 ? ["🔐 VPN Key ဝယ်လို့ ရပါတယ်။ ငွေလွှဲ Screenshot ပို့ပြီး ဆိုင်က စစ်တာနဲ့ Key ရပါမယ်။"] : []),
    ...(ctx.cfg.aiCustomers ? ["💬 မေးချင်တာကို စာရိုက်ပြီး မေးလို့ ရပါတယ်။"] : []),
    ...(ctx.shop ? [
      "🛍 ပစ္စည်းများကို ကြည့်ပြီး ဒီမှာပဲ မှာယူနိုင်ပါတယ်။",
      "🔍 ရှာချင်တာကို စာရိုက်ပို့လိုက်ပါ (ဥပမာ - iPhone, charger)။",
    ] : []),
  ].join("\n"), { replyMarkup: keyboard(homeButtons(ctx, state)) });
}

const BACK_HOME: InlineButton[] = [btn("🏠 ပင်မ", "s:home")];

async function showInfo(chatId: string, ctx: Ctx) {
  const b = ctx.business;
  const map = shopMapHref(ctx.cfg.mapUrl, b.latitude, b.longitude, b.address);
  const rows: InlineButton[][] = [];
  if (map) rows.push([linkBtn("🗺 မြေပုံ ဖွင့်ရန်", map)]);
  rows.push(BACK_HOME);
  await sendMessage(chatId, [
    `🏪 ${b.name}`,
    ...(shopPhone(ctx) ? [`📞 ${shopPhone(ctx)}`] : []),
    ...(b.address ? [`📍 ${b.address}`] : []),
  ].join("\n"), { replyMarkup: keyboard(rows) });
}

/** A voucher number as a customer types it. Unlike the till's, the letters may be missing:
 *  a shop whose name gives no initials numbers its vouchers with digits only. */
const CUSTOMER_VOUCHER = /^[A-Za-z]{0,8}[\s-]?\d{1,8}$/;
/** A voucher number typed with nothing asked: a short prefix and at least three digits
 *  (MS0012), so "iphone 13" or "A54" stays a search. */
const TYPED_VOUCHER = /^[A-Za-z]{2,4}[\s-]?\d{3,8}$/;

async function askVoucher(chatId: string, state: State) {
  state.step = "rv";
  await sendMessage(chatId, "🔧 Voucher နံပါတ် ရိုက်ပို့ပေးပါ (ဥပမာ MS0012)။\nဆိုင်က ပေးထားတဲ့ Voucher ပေါ်မှာ ပါပါတယ်။", {
    replyMarkup: keyboard([BACK_HOME]),
  });
}

async function takeVoucher(chatId: string, state: State, text: string) {
  const typed = asciiDigits(text).trim();
  if (!CUSTOMER_VOUCHER.test(typed)) {
    await sendMessage(chatId, "Voucher နံပါတ်ကို ပုံစံအတိုင်း ရိုက်ပေးပါ (ဥပမာ MS0012)။", { replyMarkup: keyboard([BACK_HOME]) });
    return;
  }
  state.rv = typed;
  state.step = "rp";
  await sendMessage(chatId, "📞 Voucher ဖွင့်တုန်းက ပေးထားတဲ့ ဖုန်းနံပါတ်ရဲ့ နောက်ဆုံး ဂဏန်း ၄ လုံး ရိုက်ပေးပါ။", {
    replyMarkup: keyboard([BACK_HOME]),
  });
}

/** The repair a voucher and the last four digits of the phone written on it point to. Both have
 *  to match, so a voucher number alone (they run in order) shows nobody else's repair; and a
 *  chat gets six tries an hour, whether by buttons or through the AI. */
async function lookupRepair(ctx: Ctx, chatId: string, voucher: string, digitsTyped: string) {
  const digits = asciiDigits(digitsTyped).replace(/\D/g, "");
  const typed = asciiDigits(voucher).trim();
  if (digits.length < 4 || !CUSTOMER_VOUCHER.test(typed)) return null;
  if (!allowOrder(`rv:${ctx.business.id}:${chatId}`, 6, 60 * 60_000)) return "limited" as const;
  const last4 = digits.slice(-4);
  const job = await findRepairJobWhere({ businessId: ctx.business.id, deletedAt: null }, typed);
  if (!job) return null;
  const contact = job.customerId
    ? await prisma.contact.findFirst({ where: { id: job.customerId, businessId: ctx.business.id }, select: { phone: true } })
    : null;
  return phoneEndsWith(job.customerPhone, last4) || phoneEndsWith(contact?.phone, last4) ? job : null;
}

async function checkRepair(chatId: string, ctx: Ctx, state: State, ownerUserId: string, digitsTyped: string) {
  const digits = asciiDigits(digitsTyped).replace(/\D/g, "");
  if (digits.length < 4) {
    await sendMessage(chatId, "ဖုန်းနံပါတ်ရဲ့ နောက်ဆုံး ဂဏန်း ၄ လုံး ရိုက်ပေးပါ (ဥပမာ 4567)။", { replyMarkup: keyboard([BACK_HOME]) });
    return;
  }
  state.step = "browse";
  const job = await lookupRepair(ctx, chatId, state.rv ?? "", digits);
  if (job === "limited") {
    await sendMessage(chatId, "⏳ စစ်တာ များနေပါတယ်။ တစ်နာရီလောက် နေမှ ပြန်စစ်ပါ။", { replyMarkup: keyboard([BACK_HOME]) });
    return;
  }
  if (!job) {
    await sendMessage(chatId, [
      "❌ Voucher နံပါတ် နဲ့ ဖုန်းနံပါတ် မကိုက်ပါ။",
      "Voucher ပေါ်က နံပါတ်နဲ့ ဆိုင်ကို ပေးထားတဲ့ ဖုန်းနံပါတ်ကို ပြန်စစ်ပေးပါ။",
      ...(shopPhone(ctx) ? ["", `မရရင် ဆိုင်ကို ဖုန်းဆက်ပါ 📞 ${shopPhone(ctx)}`] : []),
    ].join("\n"), { replyMarkup: keyboard([[btn("🔁 ပြန်စစ်မည်", "s:rv")], BACK_HOME]) });
    return;
  }
  state.rv = undefined;
  const waiting = job.status !== "DELIVERED" && job.status !== "CANCELLED";
  if (waiting) await watchRepair(job.id, ownerUserId, chatId);
  const token = trackToken(job.id);
  const rows: InlineButton[][] = [];
  if (token) rows.push([linkBtn("📄 အသေးစိတ် ကြည့်ရန်", `${appUrl()}/track/${token}`)]);
  rows.push([btn("🔧 နောက်တစ်ခု စစ်မည်", "s:rv")], BACK_HOME);
  await sendMessage(chatId, [
    repairCardText(job, ctx.business.currency),
    ...(waiting ? ["", "🔔 အခြေအနေ ပြောင်းတာနဲ့ ဒီ Bot ကနေ အသိပေးပါမယ်။"] : []),
  ].join("\n"), { replyMarkup: keyboard(rows) });
}

async function askPart(chatId: string, state: State) {
  state.step = "part";
  await sendMessage(chatId, "📱 ဖုန်း Model နဲ့ လိုတဲ့ ပစ္စည်းကို ရိုက်ပို့ပေးပါ။\nဥပမာ - iPhone 11 မှန်၊ A54 battery၊ Redmi Note 9 အားသွင်းပေါက်", {
    replyMarkup: keyboard([BACK_HOME]),
  });
}

const REPAIR_ASK = /ပြင်ပြီး|ပြီးပြီလား|ရပြီလား|voucher|ဘောက်ချာ|repair status/i;
const INFO_ASK = /လိပ်စာ|ဘယ်မှာ|ဆိုင်ဘယ်|ဖုန်းနံပါတ်|ဆက်သွယ်|address|location|contact|map|မြေပုံ/i;

const isPartQuestion = (text: string) => {
  const q = partQuery(text.slice(0, 60));
  return q.model.length > 0 && q.part.length > 0;
};

async function quoteParts(chatId: string, ctx: Ctx, state: State, text: string, from?: { first_name: string; username?: string }) {
  const q = text.slice(0, 60);
  const again: InlineButton[][] = [[btn("🔍 နောက်တစ်ခု မေးမည်", "s:part")], BACK_HOME];
  if (partQuery(q).model.length === 0) {
    await sendMessage(chatId, "ဖုန်း Model ကို ထည့်ရိုက်ပေးပါ (ဥပမာ - iPhone 11 မှန်)။", { replyMarkup: keyboard([BACK_HOME]) });
    return;
  }
  const found = await findParts(ctx.business.id, q);
  if (found.parts.length > 0) {
    await sendMessage(chatId, partQuoteText(q, found, {
      currency: ctx.business.currency, hours: ctx.cfg.partsHours, days: ctx.cfg.partsDays, note: ctx.cfg.partsNote,
    }), { replyMarkup: keyboard(again) });
    return;
  }
  // Not on the list: the shop may still have it, so the question goes on to the shop.
  if (ctx.ownerChatId && allowOrder(`ask:${ctx.business.id}:${chatId}`, 3, 30 * 60_000)) {
    const who = [from?.first_name, from?.username ? `@${from.username}` : ""].filter(Boolean).join(" ");
    await sendMessage(ctx.ownerChatId, [
      "❓ Customer က ပစ္စည်းဈေး မေးထားပါတယ် (စာရင်းထဲ မရှိ)",
      `"${q}"`,
      ...(who ? [`👤 ${who}`] : []),
    ].join("\n"), { replyMarkup: replyButtons(chatId, from) });
  }
  await sendMessage(chatId, [
    `🔍 "${q}"`,
    "",
    "စာရင်းထဲမှာ မတွေ့ပါ။ ဆိုင်ကို အသိပေးထားပါတယ်။",
    ...(shopPhone(ctx) ? [`အမြန်သိချင်ရင် ဖုန်းဆက်ပါ 📞 ${shopPhone(ctx)}`] : []),
  ].join("\n"), { replyMarkup: keyboard(again) });
}

/** A page of items as buttons, with arrows when there are more. `base` is the callback
 *  without its page number. */
async function list(chatId: string, shop: Shop, items: Item[], title: string, base: string, page: number) {
  if (items.length === 0) {
    await sendMessage(chatId, `${title}\n\nမတွေ့ပါ။ တခြားစကားလုံးနဲ့ ရှာကြည့်ပါ။`, {
      replyMarkup: keyboard([[btn("🛍 အမျိုးအစားများ", "s:cats"), btn("🏠 ပင်မ", "s:home")]]),
    });
    return;
  }
  const pages = Math.ceil(items.length / PAGE);
  const p = Math.min(Math.max(0, page), pages - 1);
  const rows: InlineButton[][] = items.slice(p * PAGE, p * PAGE + PAGE).map((i) => [
    btn(`${itemName(i)} · ${price(shop, i.price)}${i.stock > 0 ? "" : " (ကုန်)"}`.slice(0, 60), `s:item:${i.id}`),
  ]);
  const nav: InlineButton[] = [];
  if (p > 0) nav.push(btn("⬅️", `${base}:${p - 1}`));
  if (p < pages - 1) nav.push(btn("➡️", `${base}:${p + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([btn("🏠 ပင်မ", "s:home"), btn("🛒 ခြင်းတောင်း", "s:cart")]);
  await sendMessage(chatId, `${title} (${items.length})${pages > 1 ? ` · ${p + 1}/${pages}` : ""}`, { replyMarkup: keyboard(rows) });
}

async function showItem(chatId: string, shop: Shop, state: State, item: Item) {
  const caption = [
    `📦 ${itemName(item)}`,
    `💰 ${price(shop, item.price)}`,
    item.stock > 0 ? "✅ လက်ကျန် ရှိပါတယ်" : "❌ လောလောဆယ် ကုန်နေပါတယ်",
    ...(item.description ? ["", item.description.slice(0, 700)] : []),
  ].join("\n");
  const inCart = state.cart[item.id] ?? 0;
  const rows: InlineButton[][] = [];
  // A game top-up goes to a game ID and is paid first, never through the cart.
  if (isTopup(item)) rows.push([btn("💎 ဖြည့်မည်", `s:tu:${item.id}`)]);
  else if (item.stock > 0) rows.push([btn(inCart ? `➕ ထပ်ထည့် (ခြင်းထဲ ${inCart})` : "➕ ခြင်းတောင်းထဲ ထည့်မည်", `s:add:${item.id}`)]);
  rows.push([btn(`🛒 ခြင်းတောင်း (${cartCount(state)})`, "s:cart"), btn("🏠 ပင်မ", "s:home")]);
  if (item.images[0]) {
    await sendPhoto(chatId, `${appUrl()}/api/public/item-image/${item.images[0]}`, { caption, replyMarkup: keyboard(rows) });
  } else {
    await sendMessage(chatId, caption, { replyMarkup: keyboard(rows) });
  }
}

/** The cart against the shop as it is now: an item taken off the online list drops out,
 *  and no line asks for more than is on the shelf. */
function tidyCart(shop: Shop, state: State) {
  const byId = new Map(shop.items.map((i) => [i.id, i]));
  for (const [id, n] of Object.entries(state.cart)) {
    const item = byId.get(id);
    const keep = item ? Math.min(n, item.stock) : 0;
    if (keep > 0) state.cart[id] = keep; else delete state.cart[id];
  }
}

function cartLines(shop: Shop, state: State) {
  const byId = new Map(shop.items.map((i) => [i.id, i]));
  return Object.entries(state.cart).map(([id, quantity]) => ({ item: byId.get(id)!, quantity }));
}

async function showCart(chatId: string, shop: Shop, state: State) {
  tidyCart(shop, state);
  const lines = cartLines(shop, state);
  if (lines.length === 0) {
    await sendMessage(chatId, "🛒 ခြင်းတောင်းထဲမှာ ဘာမှ မရှိသေးပါ။", {
      replyMarkup: keyboard([[btn("🛍 ပစ္စည်းအမျိုးအစားများ", "s:cats")], BACK_HOME]),
    });
    return;
  }
  const total = lines.reduce((t, l) => t + l.item.price * BigInt(l.quantity), 0n);
  const rows: InlineButton[][] = lines.map((l) => [
    btn("➖", `s:dec:${l.item.id}`),
    btn(`${l.item.name} × ${l.quantity}`.slice(0, 40), `s:item:${l.item.id}`),
    btn("➕", `s:inc:${l.item.id}`),
  ]);
  rows.push([btn("✅ မှာယူမည်", "s:checkout")]);
  rows.push([btn("🛍 ဆက်ဝယ်မည်", "s:cats"), btn("🗑 ရှင်းမည်", "s:clear")]);
  await sendMessage(chatId, [
    "🛒 ခြင်းတောင်း",
    "",
    ...lines.map((l) => `• ${itemName(l.item)} × ${l.quantity} = ${price(shop, l.item.price * BigInt(l.quantity))}`),
    "",
    `💰 စုစုပေါင်း: ${price(shop, total)}`,
  ].join("\n"), { replyMarkup: keyboard(rows) });
}

async function askName(chatId: string, state: State) {
  state.step = "name";
  await sendMessage(chatId, "👤 နာမည် ရိုက်ပို့ပေးပါ။", { replyMarkup: keyboard([[btn("❌ မလုပ်တော့ပါ", "s:cart")]]) });
}

async function confirm(chatId: string, shop: Shop, state: State) {
  tidyCart(shop, state);
  const lines = cartLines(shop, state);
  if (lines.length === 0) return showCart(chatId, shop, state);
  state.step = "browse";
  const total = lines.reduce((t, l) => t + l.item.price * BigInt(l.quantity), 0n);
  await sendMessage(chatId, [
    "📝 အော်ဒါ စစ်ပေးပါ",
    "",
    ...lines.map((l) => `• ${itemName(l.item)} × ${l.quantity} = ${price(shop, l.item.price * BigInt(l.quantity))}`),
    `💰 စုစုပေါင်း: ${price(shop, total)}`,
    "",
    `👤 ${state.name}`,
    `📞 ${state.phone}`,
    ...(state.address ? [`📍 ${state.address}`] : []),
  ].join("\n"), {
    replyMarkup: keyboard([
      [btn("✅ အတည်ပြု မှာယူမည်", "s:confirm")],
      [btn("✏️ အချက်အလက် ပြင်မည်", "s:edit"), btn("🛒 ခြင်းတောင်း", "s:cart")],
    ]),
  });
}

async function placeOrder(chatId: string, shop: Shop, state: State, username?: string) {
  tidyCart(shop, state);
  const lines = cartLines(shop, state);
  if (lines.length === 0) return showCart(chatId, shop, state);
  if (!state.name || !state.phone) return askName(chatId, state);
  if (!allowOrder(`tg:${shop.business.id}:${chatId}`)) {
    await sendMessage(chatId, "⏳ အော်ဒါ များနေပါတယ်။ ခဏနေမှ ပြန်ကြိုးစားပါ။");
    return;
  }
  const result = await placeOnlineOrder(shop, {
    customerName: state.name,
    customerPhone: state.phone,
    address: state.address,
    note: `Telegram${username ? ` @${username}` : ""}`,
    lines: lines.map((l) => ({ itemId: l.item.id, quantity: l.quantity })),
  });
  if (!result.ok) {
    const left = /^Only (\d+) of (.+) left$/.exec(result.error);
    await sendMessage(chatId, `⚠️ ${left ? `${left[2]} က ${left[1]} ခုပဲ ကျန်ပါတယ်။` : "ပစ္စည်းတစ်ခုခု ပြောင်းသွားလို့ အော်ဒါ မတင်ရပါ။"} ခြင်းတောင်းကို ပြန်စစ်ပေးပါ။`, {
      replyMarkup: keyboard([[btn("🛒 ခြင်းတောင်း", "s:cart")]]),
    });
    return;
  }
  state.cart = {};
  await sendMessage(chatId, [
    `✅ အော်ဒါ ${result.orderNo} ရပါပြီ`,
    `💰 ${price(shop, result.total)}`,
    "",
    "ဆိုင်က မကြာခင် ဖုန်းဆက် အတည်ပြုပေးပါမယ်။ ကျေးဇူးတင်ပါတယ် 🙏",
  ].join("\n"), { replyMarkup: keyboard([[btn("🛍 ဆက်ဝယ်မည်", "s:cats"), btn("🏠 ပင်မ", "s:home")]]) });
}

// ---------------------------------------------------------------------------
// Game top-up: a package, the game ID, payment, a slip. The order is an ordinary Online Shop
// order; staff check the money arrived and top up from their own chat, and ring it up in POS
// into the wallet the money went to, like any online order.
// ---------------------------------------------------------------------------

/** How staff answer a customer they were told about: through the bot, which works for every
 *  customer, and straight in Telegram when the customer has a username to open. */
function replyButtons(chatId: string, from?: { username?: string }) {
  const row: InlineButton[] = [btn("💬 Bot ကနေ ပြန်ဖြေရန်", `rep:${chatId}`)];
  if (from?.username) row.push(linkBtn("👤 Telegram မှာ ဖွင့်ရန်", `https://t.me/${from.username}`));
  return keyboard([row]);
}

/** A staff member's answer, typed in their own chat, sent to the customer through the bot.
 *  For the next half hour the customer's replies go to the staff member, not the AI. */
export async function staffReply(ownerUserId: string, businessId: string, staffName: string, customerChat: string, text: string) {
  await sendMessage(customerChat, `💬 ဆိုင်မှ: ${text}`, { replyMarkup: keyboard([BACK_HOME]) });
  const state = await load(ownerUserId, customerChat);
  state.step = "browse";
  state.humanUntil = Date.now() + HUMAN_FOR;
  await save(ownerUserId, customerChat, state);
  notifyReportTargets(businessId, `💬 Customer Bot · ဝန်ထမ်း ${staffName} ပြန်ဖြေ\n🧑‍💼 ${text.slice(0, LOG_LINE)}`);
}

const who = (from?: { first_name?: string; username?: string }) =>
  [from?.first_name, from?.username ? `@${from.username}` : ""].filter(Boolean).join(" ") || "Telegram";

async function listTopups(chatId: string, ctx: Ctx) {
  const rows = ctx.topups.slice(0, 40).map((i) => [btn(`${itemName(i)} · ${fmtMoneyPlain(i.price, ctx.business.currency)}`.slice(0, 60), `s:tu:${i.id}`)]);
  await sendMessage(chatId, "💎 ဖြည့်မယ့် Package ကို ရွေးပါ", { replyMarkup: keyboard([...rows, BACK_HOME]) });
}

async function startTopup(chatId: string, ctx: Ctx, state: State, itemId: string) {
  const item = ctx.topups.find((i) => i.id === itemId);
  if (!item) return listTopups(chatId, ctx);
  state.tu = { itemId };
  state.step = "tu_id";
  await sendMessage(chatId, [
    `💎 ${itemName(item)} · ${fmtMoneyPlain(item.price, ctx.business.currency)}`,
    "",
    "Game ID ရိုက်ပို့ပေးပါ။",
    "ML ဆိုရင် User ID နဲ့ Zone ID (ဥပမာ 12345678 (2001))",
  ].join("\n"), { replyMarkup: keyboard([BACK_HOME]) });
}

async function takeGameId(chatId: string, ctx: Ctx, state: State, text: string) {
  const item = ctx.topups.find((i) => i.id === state.tu?.itemId);
  if (!item || !state.tu) return listTopups(chatId, ctx);
  const id = asciiDigits(text).trim().slice(0, 60);
  if (id.replace(/\D/g, "").length < 5) {
    await sendMessage(chatId, "Game ID ကို ဂဏန်းတွေနဲ့ မှန်အောင် ရိုက်ပေးပါ (ဥပမာ 12345678 (2001))။", { replyMarkup: keyboard([BACK_HOME]) });
    return;
  }
  state.tu.gameId = id;
  state.step = "browse";
  // A top-up sent to a wrong ID cannot be taken back, so the ID is read back before paying.
  await sendMessage(chatId, [
    "📝 စစ်ပေးပါ",
    "",
    `💎 ${itemName(item)}`,
    `🆔 ${id}`,
    `💰 ${fmtMoneyPlain(item.price, ctx.business.currency)}`,
    "",
    "⚠️ ID မှားရင် ပြန်ယူလို့ မရပါ။",
  ].join("\n"), {
    replyMarkup: keyboard([[btn("✅ မှန်တယ် · ငွေလွှဲမယ်", "s:tu_pay")], [btn("✏️ ID ပြင်မယ်", `s:tu:${item.id}`)], BACK_HOME]),
  });
}

async function askPayment(chatId: string, ctx: Ctx, state: State) {
  const item = ctx.topups.find((i) => i.id === state.tu?.itemId);
  if (!item || !state.tu?.gameId) return listTopups(chatId, ctx);
  state.step = "tu_pay";
  await sendMessage(chatId, [
    `💰 ${fmtMoneyPlain(item.price, ctx.business.currency)} လွှဲပေးပါ`,
    "",
    ctx.cfg.payment || "ဆိုင်ရဲ့ ငွေလွှဲ နံပါတ်ကို ဆိုင်မှာ မေးပါ။",
    "",
    "📸 ငွေလွှဲပြီးရင် Screenshot ကို ဒီမှာ ပို့ပေးပါ။",
  ].join("\n"), { replyMarkup: keyboard([BACK_HOME]) });
}

async function takeSlip(chatId: string, ctx: Ctx, state: State, message: TgMessage) {
  const item = ctx.topups.find((i) => i.id === state.tu?.itemId);
  const fileId = message.photo?.[message.photo.length - 1]?.file_id ?? message.document?.file_id;
  if (!item || !state.tu?.gameId || !ctx.shop) return listTopups(chatId, ctx);
  if (!fileId) {
    await sendMessage(chatId, "📸 ငွေလွှဲ Screenshot ကို ပုံအနေနဲ့ ပို့ပေးပါ။", { replyMarkup: keyboard([BACK_HOME]) });
    return;
  }
  if (!ctx.ownerChatId || !allowOrder(`tu:${ctx.business.id}:${chatId}`, 5, 60 * 60_000)) {
    await sendMessage(chatId, "⏳ ခဏနေမှ ပြန်ကြိုးစားပါ။", { replyMarkup: keyboard([BACK_HOME]) });
    return;
  }
  const result = await placeOnlineOrder(ctx.shop, {
    customerName: (message.from?.first_name ?? "Telegram").slice(0, 80),
    customerPhone: state.phone ?? "",
    note: `Game top-up · ID ${state.tu.gameId} · Telegram${message.from?.username ? ` @${message.from.username}` : ""} · slip on Telegram`,
    lines: [{ itemId: item.id, quantity: 1 }],
  });
  if (!result.ok) {
    await sendMessage(chatId, "⚠️ ဒီ Package ကို အခု မရနိုင်ပါ။ ဆိုင်ကို ဆက်သွယ်ပါ။", { replyMarkup: keyboard([BACK_HOME]) });
    return;
  }
  // The decision buttons carry the customer's chat, so the answer reaches them.
  const decide = keyboard([[btn("✅ ငွေရပြီ", `tu:ok:${result.orderId}:${chatId}`), btn("❌ ငွေမရ", `tu:no:${result.orderId}:${chatId}`)]]);
  const caption = [
    `💎 Game ဖြည့်ရန် ${result.orderNo}`,
    `${itemName(item)} · ${fmtMoneyPlain(item.price, ctx.business.currency)}`,
    `🆔 ${state.tu.gameId}`,
    `👤 ${who(message.from)}`,
    "",
    "ငွေဝင်မဝင် ကိုယ့် KBZPay / Wave မှာ စစ်ပြီးမှ နှိပ်ပါ။ Screenshot တစ်ခုတည်းကို မယုံပါနဲ့။",
  ].join("\n");
  if (message.photo) await sendPhoto(ctx.ownerChatId, fileId, { caption, replyMarkup: decide });
  else await sendDocument(ctx.ownerChatId, fileId, { caption, replyMarkup: decide });
  state.tu = undefined;
  state.step = "browse";
  await sendMessage(chatId, [
    `📨 ${result.orderNo} ပို့ပြီးပါပြီ။`,
    "ဆိုင်က ငွေဝင်တာ စစ်ပြီး ဖြည့်ပေးပါမယ်။ ပြီးရင် ဒီမှာ အသိပေးပါမယ်။",
  ].join("\n"), { replyMarkup: keyboard([BACK_HOME]) });
}

// ---------------------------------------------------------------------------
// VPN keys, on the one shop that sells them: a plan, payment, a slip; staff tap Paid and the key
// is made and sent by vpnShop.ts. A renewal is the same with the key it extends.
// ---------------------------------------------------------------------------

async function listVpn(chatId: string, ctx: Ctx, state: State) {
  const rows = ctx.vpn.slice(0, 20).map((p) => [btn(planLine(p, ctx.business.currency).slice(0, 60), `s:vp:${p.id}`)]);
  const head = state.vp?.renewId ? "🔁 သက်တမ်းတိုးမယ့် Plan ကို ရွေးပါ" : "🔐 VPN Plan ကို ရွေးပါ";
  await sendMessage(chatId, `${head}\n\nOutline / Hiddify / V2Box · ဖုန်း၊ ကွန်ပျူတာ အကုန်သုံးလို့ ရပါတယ်။`, { replyMarkup: keyboard([...rows, [btn("📖 သုံးနည်း", "s:vph")], BACK_HOME]) });
}

async function askVpnPayment(chatId: string, ctx: Ctx, state: State, itemId: string) {
  const plan = ctx.vpn.find((p) => p.id === itemId);
  if (!plan) return listVpn(chatId, ctx, state);
  state.vp = { itemId, renewId: state.vp?.renewId };
  state.step = "vp_pay";
  await sendMessage(chatId, [
    planText(plan, ctx.business.currency),
    ...(state.vp.renewId ? ["🔁 Key အဟောင်းကို သက်တမ်းတိုးပါမယ်။"] : []),
    "",
    `💰 ${fmtMoneyPlain(plan.price, ctx.business.currency)} လွှဲပေးပါ`,
    "",
    ctx.vpnPay || ctx.cfg.payment || "ဆိုင်ရဲ့ ငွေလွှဲ နံပါတ်ကို ဆိုင်မှာ မေးပါ။",
    "",
    "📸 ငွေလွှဲပြီးရင် Screenshot ကို ဒီမှာ ပို့ပေးပါ။ ဆိုင်က ငွေဝင်တာ စစ်ပြီးတာနဲ့ Key ပို့ပေးပါမယ်။",
  ].join("\n"), { replyMarkup: keyboard([BACK_HOME]) });
}

async function takeVpnSlip(chatId: string, ctx: Ctx, state: State, message: TgMessage, ownerUserId: string) {
  const plan = ctx.vpn.find((p) => p.id === state.vp?.itemId);
  const fileId = message.photo?.[message.photo.length - 1]?.file_id ?? message.document?.file_id;
  if (!plan) { state.step = "browse"; return listVpn(chatId, ctx, state); }
  if (!fileId) {
    await sendMessage(chatId, "📸 ငွေလွှဲ Screenshot ကို ပုံအနေနဲ့ ပို့ပေးပါ။", { replyMarkup: keyboard([BACK_HOME]) });
    return;
  }
  if (!ctx.ownerChatId || !allowOrder(`vp:${ctx.business.id}:${chatId}`, 5, 60 * 60_000)) {
    await sendMessage(chatId, "⏳ ခဏနေမှ ပြန်ကြိုးစားပါ။", { replyMarkup: keyboard([BACK_HOME]) });
    return;
  }
  const renewId = state.vp?.renewId;
  const order = await placeVpnOrder(ctx.business.id, plan, {
    ownerUserId, chatId, customerName: message.from?.first_name ?? "Telegram", username: message.from?.username, renewId,
  });
  const decide = keyboard([[btn("✅ ငွေရပြီ · Key ပို့မည်", `vp:ok:${order.id}`), btn("❌ ငွေမရ", `vp:no:${order.id}`)]]);
  const caption = [
    `🔐 VPN ${renewId ? "သက်တမ်းတိုး" : "ဝယ်ရန်"} ${order.orderNo}`,
    planLine(plan, ctx.business.currency),
    `👤 ${who(message.from)}`,
    "",
    "ငွေဝင်မဝင် ကိုယ့် KBZPay / Wave မှာ စစ်ပြီးမှ နှိပ်ပါ။ နှိပ်တာနဲ့ Key ကို Customer ဆီ ချက်ချင်း ပို့ပါမယ်။",
  ].join("\n");
  notifyVpnWaiting(ctx.business.id, { orderNo: order.orderNo, renewal: Boolean(renewId), planLine: planLine(plan, ctx.business.currency), customer: who(message.from) });
  if (message.photo) await sendPhoto(ctx.ownerChatId, fileId, { caption, replyMarkup: decide });
  else await sendDocument(ctx.ownerChatId, fileId, { caption, replyMarkup: decide });
  state.vp = undefined;
  state.step = "browse";
  await sendMessage(chatId, [
    `📨 ${order.orderNo} ပို့ပြီးပါပြီ။`,
    "ဆိုင်က ငွေဝင်တာ စစ်ပြီးတာနဲ့ VPN Key ကို ဒီမှာ ပို့ပေးပါမယ်။",
  ].join("\n"), { replyMarkup: keyboard([BACK_HOME]) });
}

/** A staff member's answer to a top-up, from their own chat: the money came (or did not), then
 *  the top-up is done. The order stays open for POS, where it is rung up into the wallet the
 *  money went to; this only moves it along and tells the customer. */
export async function handleTopupDecision(
  staffChatId: string, user: { id: string; businessId: string; permissions: string[] }, data: string,
) {
  const [, action, orderId, customerChat] = data.split(":");
  if (!user.permissions.includes("sale.create")) return sendMessage(staffChatId, "ဒါကို လုပ်ခွင့် မရှိပါ။");
  const order = await prisma.onlineOrder.findFirst({ where: { id: orderId, businessId: user.businessId }, include: { lines: true } });
  if (!order) return sendMessage(staffChatId, "ဒီ အော်ဒါ မရှိတော့ပါ။");
  const title = `${order.orderNo} · ${order.lines.map((l) => l.name).join(", ")}`;
  const move = async (status: "CONFIRMED" | "CANCELLED", note?: string) => {
    await prisma.onlineOrder.update({ where: { id: order.id }, data: { status, ...(note ? { note } : {}) } });
    await audit(prisma, {
      businessId: user.businessId, userId: user.id, action: `online_order.${status.toLowerCase()}`, module: "sales",
      resourceType: "OnlineOrder", resourceId: order.id, before: { status: order.status }, after: { status, via: "telegram" },
    });
  };

  if (action === "ok") {
    if (order.status !== "NEW") return sendMessage(staffChatId, `${order.orderNo} ကို ဆုံးဖြတ်ပြီးသားပါ။`);
    await move("CONFIRMED");
    await sendMessage(customerChat, `✅ ${order.orderNo} ငွေရပါပြီ။ ဖြည့်ပေးနေပါပြီ၊ ခဏစောင့်ပေးပါ။`);
    return sendMessage(staffChatId, `✅ ${title}\nငွေရပြီ။ ဖြည့်ပြီးရင် အောက်က ခလုတ် နှိပ်ပါ။`, {
      replyMarkup: keyboard([[btn("💎 ဖြည့်ပြီး", `tu:done:${order.id}:${customerChat}`)]]),
    });
  }
  if (action === "no") {
    if (order.status !== "NEW") return sendMessage(staffChatId, `${order.orderNo} ကို ဆုံးဖြတ်ပြီးသားပါ။`);
    await move("CANCELLED");
    await sendMessage(customerChat, `❌ ${order.orderNo} ငွေလွှဲတာ မတွေ့ပါ။ မှန်ရင် ဆိုင်ကို ဆက်သွယ်ပေးပါ။`);
    return sendMessage(staffChatId, `❌ ${title}\nပယ်ပြီးပါပြီ။ Customer ကို အသိပေးပြီးပါပြီ။`);
  }
  if (action === "done") {
    const DONE = " · ဖြည့်ပြီး";
    if (order.status !== "CONFIRMED" || order.note?.endsWith(DONE)) return sendMessage(staffChatId, `${order.orderNo} ကို အသိပေးပြီးသားပါ။`);
    await prisma.onlineOrder.update({ where: { id: order.id }, data: { note: `${order.note ?? ""}${DONE}` } });
    await sendMessage(customerChat, `💎 ${order.orderNo} ဖြည့်ပြီးပါပြီ။ Game ထဲမှာ စစ်ကြည့်ပါ။ ကျေးဇူးတင်ပါတယ် 🙏`);
    return sendMessage(staffChatId, `💎 ${title}\nCustomer ကို အသိပေးပြီးပါပြီ။\n\nOnline Shop ထဲက ${order.orderNo} ကို POS မှာ ငွေဝင်တဲ့ Wallet နဲ့ ငွေရှင်းပါ။`);
  }
}

// ---------------------------------------------------------------------------
// The customer's own words, answered by AI with the bot owner's key (customerAgent.ts), and
// handed to a person at the shop when the AI asks for one.
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60_000;
const HUMAN_FOR = 30 * 60_000;

async function forwardToStaff(chatId: string, ctx: Ctx, text: string, from?: TgUser) {
  if (ctx.ownerChatId && allowOrder(`fw:${ctx.business.id}:${chatId}`, 15, HUMAN_FOR)) {
    await sendMessage(ctx.ownerChatId, `💬 ${who(from)}\n${text.slice(0, 1000)}`, { replyMarkup: replyButtons(chatId, from) });
  }
  await sendMessage(chatId, "📨 ဆိုင်ကို ပို့ထားပါတယ်။ ဝန်ထမ်းက ပြန်ဖြေပေးပါမယ်။", { replyMarkup: keyboard([BACK_HOME]) });
}

/** Answers with AI when the shop turned it on and the bot's owner has a key. False when it did
 *  not answer (off, no key, over the day's limit, the provider failed), so the caller falls
 *  back to the buttons' answer. */
async function aiAnswer(chatId: string, ctx: Ctx, state: State, ownerUserId: string, text: string, from?: TgUser): Promise<boolean> {
  if (!ctx.cfg.aiCustomers) return false;
  const key = await loadAiKey(ownerUserId);
  if (!key) return false;
  // Each message is paid for on the shop's own key: a day's limit per customer and per shop.
  if (!allowOrder(`ai:${ctx.business.id}:${chatId}`, 40, DAY) || !allowOrder(`ai:${ctx.business.id}`, 500, DAY)) return false;
  void sendChatAction(chatId);

  const shop = ctx.shop;
  const money = (minor: bigint) => fmtMoneyPlain(minor, ctx.business.currency);
  const then = { cart: false, topup: "", vpn: "" };
  const run = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const s = (k: string) => String(args[k] ?? "").slice(0, 120);
    if (name === "search_products") {
      if (!shop) return { error: "This shop has no online list." };
      return search(shop, s("query")).slice(0, 10).map((i) => ({
        item_id: i.id, name: itemName(i), price: money(i.price), in_stock: i.stock > 0, game_topup: isTopup(i),
      }));
    }
    if (name === "part_price") {
      if (!ctx.partsOn) return { error: "This shop does not list spare parts." };
      const found = await findParts(ctx.business.id, s("question"));
      return {
        parts: found.parts.map((p) => ({
          name: p.name, price: money(p.price),
          ready: p.inStock ? `${mmNumber(ctx.cfg.partsHours)} နာရီအတွင်း` : `${mmNumber(ctx.cfg.partsDays)} ရက်ခန့် (မှာယူရမည်)`,
        })),
        note: ctx.cfg.partsNote || undefined,
      };
    }
    if (name === "repair_status") {
      if (!ctx.repairOn) return { error: "This shop does not take repairs here." };
      const job = await lookupRepair(ctx, chatId, s("voucher"), s("phone_last4"));
      if (job === "limited") return { error: "Too many tries; ask the customer to try again in an hour." };
      if (!job) return { error: "The voucher number and phone digits do not match a repair." };
      if (job.status !== "DELIVERED" && job.status !== "CANCELLED") await watchRepair(job.id, ownerUserId, chatId);
      return { status: REPAIR_STATUS_MM[job.status] ?? job.status, details: repairCardText(job, ctx.business.currency), will_notify: true };
    }
    if (name === "shop_info") {
      const b = ctx.business;
      return {
        name: b.name, phone: shopPhone(ctx) || undefined, address: b.address || undefined,
        map: shopMapHref(ctx.cfg.mapUrl, b.latitude, b.longitude, b.address) || undefined,
        collecting: ctx.cfg.pickupOnly ? "Orders are collected at the shop." : ctx.cfg.delivery,
        payment: ctx.cfg.payment,
      };
    }
    if (name === "add_to_cart") {
      const item = shop?.items.find((i) => i.id === s("item_id"));
      if (!item) return { error: "No such item; use search_products first." };
      if (isTopup(item)) return { error: "This is a game top-up; use start_topup." };
      const want = Math.max(1, Math.min(20, Math.floor(Number(args.quantity) || 1)));
      const have = state.cart[item.id] ?? 0;
      if (item.stock <= have) return { error: `Out of stock (${item.stock} left).` };
      state.cart[item.id] = Math.min(item.stock, have + want);
      then.cart = true;
      return { ok: true, in_cart: state.cart[item.id], shown_to_customer: "the cart with a button to order" };
    }
    if (name === "start_topup") {
      const item = ctx.topups.find((i) => i.id === s("item_id"));
      if (!item) return { error: "No such top-up package; use search_products first." };
      then.topup = item.id;
      return { ok: true, next: "The bot now asks the customer for the game ID." };
    }
    if (name === "vpn_info" && ctx.vpn.length > 0) {
      return {
        plans: ctx.vpn.map((p) => ({ plan_id: p.id, name: p.name, days: p.days, data: p.limitBytes == null ? "unlimited" : `${Number(p.limitBytes) / 1e9} GB per 30 days`, price: money(p.price) })),
        apps: [...(process.env.VPN_APP_URL ? [{ name: "Mahar VPN", link: process.env.VPN_APP_URL }] : []), ...VPN_APPS.map((a) => ({ name: a.name, android: a.android, iphone: a.ios }))],
        how_to: VPN_HOW_TO,
        payment: ctx.vpnPay || ctx.cfg.payment || undefined,
        paying: "Pay first and send the slip on the bot; the key and its QR code come when the shop has checked the payment.",
      };
    }
    if (name === "start_vpn" && ctx.vpn.length > 0) {
      const plan = ctx.vpn.find((p) => p.id === s("plan_id"));
      if (!plan) return { error: "No such plan; use vpn_info first." };
      then.vpn = plan.id;
      return { ok: true, next: "The bot now shows the plan and how to pay." };
    }
    if (name === "call_staff") {
      state.humanUntil = Date.now() + HUMAN_FOR;
      if (ctx.ownerChatId) {
        await sendMessage(ctx.ownerChatId, [`🙋 Customer က ဝန်ထမ်းနဲ့ ပြောချင်ပါတယ်`, `👤 ${who(from)}`, `📝 ${s("reason")}`, `💬 "${text.slice(0, 300)}"`].join("\n"),
          { replyMarkup: replyButtons(chatId, from) });
      }
      return { ok: true, next: "A staff member will answer soon. Tell the customer so." };
    }
    return { error: "Unknown tool" };
  };

  const turns: ChatTurn[] = [...(state.chat ?? []), { role: "user", content: text.slice(0, 500) }];
  let reply: string;
  try {
    reply = await askAgent(key, customerPrompt(ctx.business.name, ctx.business.currency, todayBusinessDate(), ctx.vpn.length > 0), turns, { tools: ctx.vpn.length > 0 ? [...CUSTOMER_TOOLS, ...VPN_TOOLS] : CUSTOMER_TOOLS, run }, 1500);
  } catch (e) {
    console.error("[telegram shop ai]", e instanceof AiError ? `${e.kind} ${e.message}` : e);
    // A key that stopped working is the shop's to fix; say so once a day, not to the customer.
    if (e instanceof AiError && e.kind !== "failed" && ctx.ownerChatId && allowOrder(`aikey:${ctx.business.id}`, 1, DAY)) {
      await sendMessage(ctx.ownerChatId, "⚠️ Customer Bot ရဲ့ AI Key အလုပ်မလုပ်ပါ (ငွေကုန် / Key မှား)။ Bot က ခလုတ်တွေနဲ့ပဲ ဆက်ဖြေနေပါတယ်။ 🤖 AI menu မှာ Key ပြန်ထည့်ပါ။");
    }
    return false;
  }
  state.chat = [...turns, { role: "assistant" as const, content: reply.slice(0, 500) }].slice(-8);
  // What comes next brings its own buttons; otherwise the way home.
  await sendMessage(chatId, reply, then.cart || then.topup || then.vpn ? undefined : { replyMarkup: keyboard([BACK_HOME]) });
  if (then.cart && shop) await showCart(chatId, shop, state);
  if (then.topup) await startTopup(chatId, ctx, state, then.topup);
  if (then.vpn) { state.vp = undefined; await askVpnPayment(chatId, ctx, state, then.vpn); }
  return true;
}

/** A customer's message or button press on the shop's bot. Returns after answering; then the
 *  exchange goes to the shop's send-only reports bot as a log, in the chats that get the live
 *  feed, so the shop sees what customers ask and what the bot told them. */
export async function handleCustomerUpdate(update: TgUpdate, ownerUserId: string, chatId: string) {
  const { lines } = await withTranscript(chatId, () => answerCustomer(update, ownerUserId, chatId));
  try {
    const owner = await prisma.user.findUnique({ where: { id: ownerUserId }, select: { businessId: true } });
    const text = conversationLog(update, lines);
    if (owner && text) notifyReportTargets(owner.businessId, text);
  } catch (e) {
    console.error("[telegram shop log]", e instanceof Error ? e.message : e);
  }
}

const LOG_LINE = 400;
const LOG_MAX = 3500;

/** One exchange as the shop reads it: who, what they typed or tapped, what the bot answered.
 *  A VPN key is a secret of the customer's, so only that one went is said, not the key. */
export function conversationLog(update: TgUpdate, replies: string[]): string | null {
  const cq = update.callback_query;
  const message = update.message;
  const from = cq?.from ?? message?.from;
  let said: string;
  if (cq) {
    const label = (cq.message?.reply_markup?.inline_keyboard ?? []).flat().find((b) => b.callback_data === cq.data)?.text;
    said = `👆 ${label ?? cq.data ?? ""}`;
  } else if (message?.photo || message?.document) said = `📸 ပုံ / Screenshot${message.caption ? ` · ${message.caption}` : ""}`;
  else if (message?.text) said = `👤 ${message.text}`;
  else return null;
  const clip = (s: string) => {
    const t = s.replace(/ss:\/\/\S+/g, "ss://… (VPN Key)").trim();
    return t.length > LOG_LINE ? `${t.slice(0, LOG_LINE)}…` : t;
  };
  const text = [
    `💬 Customer Bot · ${who(from)}`,
    clip(said),
    ...replies.map((r) => `🤖 ${clip(r)}`),
  ].join("\n");
  return text.length > LOG_MAX ? `${text.slice(0, LOG_MAX)}…` : text;
}

async function answerCustomer(update: TgUpdate, ownerUserId: string, chatId: string) {
  const ctx = await loadCtx(ownerUserId);
  const cq = update.callback_query;
  if (!ctx) {
    if (cq) await answerCallbackQuery(cq.id);
    return sendMessage(chatId, CLOSED);
  }
  const state = await load(ownerUserId, chatId);
  const shop = ctx.shop;
  const byId = (id: string) => shop?.items.find((i) => i.id === id);

  if (cq) {
    const [, action = "", arg = "", page = "0"] = (cq.data ?? "").split(":");
    let toast: string | undefined;
    if (action === "home") { state.step = "browse"; state.humanUntil = undefined; await home(chatId, ctx, state); }
    else if (action === "rv" && ctx.repairOn) await askVoucher(chatId, state);
    else if (action === "part" && ctx.partsOn) await askPart(chatId, state);
    else if (action === "info") await showInfo(chatId, ctx);
    else if (action === "tus" && ctx.topups.length > 0) await listTopups(chatId, ctx);
    else if (action === "tu" && arg) await startTopup(chatId, ctx, state, arg);
    else if (action === "tu_pay") await askPayment(chatId, ctx, state);
    else if (action === "vps" && ctx.vpn.length > 0) { state.vp = undefined; await listVpn(chatId, ctx, state); }
    else if (action === "vpr" && ctx.vpn.length > 0 && arg) { state.vp = { renewId: arg }; await listVpn(chatId, ctx, state); }
    else if (action === "vp" && arg) await askVpnPayment(chatId, ctx, state, arg);
    else if (action === "vph" && ctx.vpn.length > 0) await sendMessage(chatId, VPN_HOW_TO, { replyMarkup: keyboard([...appRows(), BACK_HOME]) });
    else if (action === "vpk" && ctx.vpn.length > 0) await showMyVpn(chatId, ctx.business.id, BACK_HOME);
    // The rest is the online list, which this shop may not have (or no longer has).
    else if (!shop) { state.step = "browse"; await home(chatId, ctx, state); }
    else if (action === "cats") {
      const cats = categories(shop);
      await sendMessage(chatId, "🛍 ပစ္စည်းအမျိုးအစား ရွေးပါ", {
        replyMarkup: keyboard([...cats.map((c, i) => [btn(c.slice(0, 60), `s:cat:${i}:0`)]), [btn("🏠 ပင်မ", "s:home")]]),
      });
    } else if (action === "cat") {
      const name = categories(shop)[Number(arg)];
      const items = name ? shop.items.filter((i) => (i.category || "အခြား") === name) : [];
      await list(chatId, shop, items, `🛍 ${name ?? ""}`, `s:cat:${arg}`, Number(page));
    } else if (action === "all") await list(chatId, shop, shop.items, "📋 ပစ္စည်းအားလုံး", "s:all", Number(arg));
    else if (action === "q") await list(chatId, shop, search(shop, state.q ?? ""), `🔍 "${state.q ?? ""}"`, "s:q", Number(arg));
    else if (action === "item") {
      const item = byId(arg);
      if (item) await showItem(chatId, shop, state, item);
      else toast = "ဒီပစ္စည်း မရှိတော့ပါ";
    } else if (action === "add" || action === "inc") {
      const item = byId(arg);
      const have = state.cart[arg] ?? 0;
      if (item && isTopup(item)) await startTopup(chatId, ctx, state, item.id);
      else if (!item || item.stock <= have) toast = item ? `${item.stock} ခုပဲ ကျန်ပါတယ်` : "ဒီပစ္စည်း မရှိတော့ပါ";
      else {
        state.cart[arg] = have + 1;
        toast = `🛒 ထည့်ပြီး (${have + 1})`;
        if (action === "inc") await showCart(chatId, shop, state);
        else await sendMessage(chatId, `🛒 ${itemName(item)} ကို ခြင်းတောင်းထဲ ထည့်ပြီးပါပြီ။`, {
          replyMarkup: keyboard([[btn(`🛒 ခြင်းတောင်း (${cartCount(state)}) · မှာယူမည်`, "s:cart")], [btn("🛍 ဆက်ဝယ်မည်", "s:cats")]]),
        });
      }
    } else if (action === "dec") {
      const have = state.cart[arg] ?? 0;
      if (have > 1) state.cart[arg] = have - 1; else delete state.cart[arg];
      await showCart(chatId, shop, state);
    } else if (action === "cart") { state.step = "browse"; await showCart(chatId, shop, state); }
    else if (action === "clear") { state.cart = {}; await showCart(chatId, shop, state); }
    else if (action === "checkout") {
      if (state.name && state.phone) await confirm(chatId, shop, state);
      else await askName(chatId, state);
    } else if (action === "edit") await askName(chatId, state);
    else if (action === "skipaddr") { state.address = undefined; await confirm(chatId, shop, state); }
    else if (action === "confirm") await placeOrder(chatId, shop, state, cq.from.username);
    else await home(chatId, ctx, state);
    await answerCallbackQuery(cq.id, toast);
    await save(ownerUserId, chatId, state);
    return;
  }

  const message = update.message;
  const from = message?.from;
  const text = (message?.text ?? "").trim();
  if (text === "/start" || text === "/menu" || text === "/help") {
    state.step = "browse";
    state.humanUntil = undefined;
    await home(chatId, ctx, state);
  } else if (state.step === "tu_pay" && message) await takeSlip(chatId, ctx, state, message);
  else if (state.step === "vp_pay" && message) await takeVpnSlip(chatId, ctx, state, message, ownerUserId);
  else if (!text) { state.step = "browse"; await home(chatId, ctx, state); }
  else if (state.step === "rv") await takeVoucher(chatId, state, text);
  else if (state.step === "rp") await checkRepair(chatId, ctx, state, ownerUserId, text);
  else if (state.step === "part") await quoteParts(chatId, ctx, state, text, from);
  else if (state.step === "tu_id") await takeGameId(chatId, ctx, state, text);
  // A person at the shop has the conversation: pass it on, and keep the AI out of it.
  else if (state.step === "browse" && (state.humanUntil ?? 0) > Date.now()) await forwardToStaff(chatId, ctx, text, from);
  else if (state.step === "browse" && (await aiAnswer(chatId, ctx, state, ownerUserId, text, from))) { /* answered */ }
  // Without the AI, a typed "iPhone 11 မှန်ရှိလား" is still a part question: a phone and a part.
  else if (state.step === "browse" && ctx.partsOn && isPartQuestion(text)) await quoteParts(chatId, ctx, state, text, from);
  // Asked, not offered: a voucher number or a repair question, and where the shop is.
  else if (state.step === "browse" && ctx.repairOn && TYPED_VOUCHER.test(asciiDigits(text).trim())) await takeVoucher(chatId, state, text);
  else if (state.step === "browse" && ctx.repairOn && REPAIR_ASK.test(text)) await askVoucher(chatId, state);
  else if (state.step === "browse" && INFO_ASK.test(text)) await showInfo(chatId, ctx);
  else if (!shop) await home(chatId, ctx, state);
  else if (state.step === "name") {
    state.name = text.slice(0, 80);
    state.step = "phone";
    await sendMessage(chatId, "📞 ဖုန်းနံပါတ် ရိုက်ပို့ပေးပါ။");
  } else if (state.step === "phone") {
    const phone = text.replace(/[\s-]/g, "");
    if (!/^\+?\d{6,15}$/.test(phone)) {
      await sendMessage(chatId, "ဖုန်းနံပါတ် မှန်အောင် ရိုက်ပေးပါ (ဥပမာ 09xxxxxxxxx)။");
    } else {
      state.phone = phone;
      // A shop that only hands orders over at the counter has no address to ask for.
      if (ctx.cfg.pickupOnly) {
        state.address = undefined;
        await confirm(chatId, shop, state);
      } else {
        state.step = "address";
        await sendMessage(chatId, "📍 ပို့ရမယ့် လိပ်စာ ရိုက်ပို့ပေးပါ။ ဆိုင်မှာ လာယူမယ်ဆိုရင် ကျော်ပါ။", {
          replyMarkup: keyboard([[btn("🏪 ဆိုင်မှာ လာယူမည် (ကျော်)", "s:skipaddr")]]),
        });
      }
    }
  } else if (state.step === "address") {
    state.address = text.slice(0, 300);
    await confirm(chatId, shop, state);
  } else {
    state.q = text.slice(0, 60);
    await list(chatId, shop, search(shop, state.q), `🔍 "${state.q}"`, "s:q", 0);
  }
  await save(ownerUserId, chatId, state);
}
