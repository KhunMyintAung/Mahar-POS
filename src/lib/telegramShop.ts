import { prisma } from "./prisma";
import { answerCallbackQuery, btn, keyboard, linkBtn, sendMessage, sendPhoto, type InlineButton, type TgUpdate } from "./telegram";
import { allowOrder, loadOnlineShop, publicShop, shopMapHref, type OnlineShopSettings } from "./onlineShop";
import { placeOnlineOrder, type PublicShop } from "./onlineOrder";
import { fmtMoneyPlain } from "./format";
import { loadModuleAccess } from "./moduleAccess";
import { findRepairJobWhere } from "./repairLookup";
import { trackToken } from "./repairTrack";
import { asciiDigits, findParts, hasSpareParts, partQuery, partQuoteText, phoneEndsWith, repairCardText } from "./customerBot";
import { watchRepair } from "./repairWatch";

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
  step: "browse" | "name" | "phone" | "address" | "rv" | "rp" | "part";
  /** The voucher number typed, kept until the phone digits come. */
  rv?: string;
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
}

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
  if (!shop && !repairOn) return null;
  return { business, cfg, shop, repairOn, partsOn, ownerChatId: owner.telegramChatId };
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
  if (ctx.repairOn) rows.push([btn("🔧 ဖုန်းပြင်ပြီးပြီလား စစ်ရန်", "s:rv")]);
  if (ctx.partsOn) rows.push([btn("📱 ဖုန်းမှန် / Parts ဈေးမေးရန်", "s:part")]);
  if (ctx.shop) {
    rows.push([btn("🛍 ပစ္စည်းအမျိုးအစားများ", "s:cats"), btn("📋 အားလုံး", "s:all:0")]);
    rows.push([btn(`🛒 ခြင်းတောင်း (${cartCount(state)})`, "s:cart")]);
    rows.push([linkBtn("🌐 Online Shop ဖွင့်ရန်", `${appUrl()}/shop/${ctx.shop.slug}`)]);
  }
  rows.push([btn("📍 ဆိုင်လိပ်စာ / ဆက်သွယ်ရန်", "s:info")]);
  return rows;
}

const shopPhone = (ctx: Ctx) => ctx.cfg.phone.trim() || ctx.business.phone || "";

async function home(chatId: string, ctx: Ctx, state: State) {
  const b = ctx.business;
  await sendMessage(chatId, [
    `🙏 ${b.name} မှ ကြိုဆိုပါတယ်`,
    "",
    ...(ctx.repairOn ? ["🔧 ပြင်ထားတဲ့ ဖုန်း ပြီးမပြီး ဒီမှာ စစ်လို့ ရပါတယ်။"] : []),
    ...(ctx.partsOn ? ["📱 ဖုန်းမှန်၊ Battery စတဲ့ ပစ္စည်းဈေး မေးလို့ ရပါတယ်။"] : []),
    ...(ctx.shop ? [
      "🛍 ပစ္စည်းများကို ကြည့်ပြီး ဒီမှာပဲ မှာယူနိုင်ပါတယ်။",
      "🔍 ရှာချင်တာကို စာရိုက်ပို့လိုက်ပါ (ဥပမာ - iPhone, charger)။",
    ] : []),
    ...(shopPhone(ctx) ? ["", `📞 ${shopPhone(ctx)}`] : []),
    ...(b.address ? [`📍 ${b.address}`] : []),
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

/** The voucher and the last four digits of the phone written on it. Both have to match, so a
 *  voucher number alone (they run in order) does not show anybody else's repair. */
async function checkRepair(chatId: string, ctx: Ctx, state: State, ownerUserId: string, digitsTyped: string) {
  const digits = asciiDigits(digitsTyped).replace(/\D/g, "");
  if (digits.length < 4) {
    await sendMessage(chatId, "ဖုန်းနံပါတ်ရဲ့ နောက်ဆုံး ဂဏန်း ၄ လုံး ရိုက်ပေးပါ (ဥပမာ 4567)။", { replyMarkup: keyboard([BACK_HOME]) });
    return;
  }
  state.step = "browse";
  if (!allowOrder(`rv:${ctx.business.id}:${chatId}`, 6, 60 * 60_000)) {
    await sendMessage(chatId, "⏳ စစ်တာ များနေပါတယ်။ တစ်နာရီလောက် နေမှ ပြန်စစ်ပါ။", { replyMarkup: keyboard([BACK_HOME]) });
    return;
  }
  const last4 = digits.slice(-4);
  const job = state.rv ? await findRepairJobWhere({ businessId: ctx.business.id, deletedAt: null }, state.rv) : null;
  const contact = job?.customerId
    ? await prisma.contact.findFirst({ where: { id: job.customerId, businessId: ctx.business.id }, select: { phone: true } })
    : null;
  if (!job || !(phoneEndsWith(job.customerPhone, last4) || phoneEndsWith(contact?.phone, last4))) {
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

async function quoteParts(chatId: string, ctx: Ctx, text: string, from?: { first_name: string; username?: string }) {
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
    ].join("\n"), from?.username ? { replyMarkup: keyboard([[linkBtn("💬 ပြန်ဖြေရန်", `https://t.me/${from.username}`)]]) } : undefined);
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
  if (item.stock > 0) rows.push([btn(inCart ? `➕ ထပ်ထည့် (ခြင်းထဲ ${inCart})` : "➕ ခြင်းတောင်းထဲ ထည့်မည်", `s:add:${item.id}`)]);
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
      replyMarkup: keyboard([[btn("🛍 ပစ္စည်းအမျိုးအစားများ", "s:cats"), btn("📋 အားလုံး", "s:all:0")], BACK_HOME]),
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

/** A customer's message or button press on the shop's bot. Returns after answering. */
export async function handleCustomerUpdate(update: TgUpdate, ownerUserId: string, chatId: string) {
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
    if (action === "home") { state.step = "browse"; await home(chatId, ctx, state); }
    else if (action === "rv" && ctx.repairOn) await askVoucher(chatId, state);
    else if (action === "part" && ctx.partsOn) await askPart(chatId, state);
    else if (action === "info") await showInfo(chatId, ctx);
    // The rest is the online list, which this shop may not have (or no longer has).
    else if (!shop) { state.step = "browse"; await home(chatId, ctx, state); }
    else if (action === "cats") {
      const cats = categories(shop);
      await sendMessage(chatId, "🛍 ပစ္စည်းအမျိုးအစား ရွေးပါ", {
        replyMarkup: keyboard([...cats.map((c, i) => [btn(c.slice(0, 60), `s:cat:${i}:0`)]), [btn("📋 အားလုံး", "s:all:0"), btn("🏠 ပင်မ", "s:home")]]),
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
      if (!item || item.stock <= have) toast = item ? `${item.stock} ခုပဲ ကျန်ပါတယ်` : "ဒီပစ္စည်း မရှိတော့ပါ";
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

  const text = (update.message?.text ?? "").trim();
  if (!text || text === "/start" || text === "/menu" || text === "/help") {
    state.step = "browse";
    await home(chatId, ctx, state);
  } else if (state.step === "rv") await takeVoucher(chatId, state, text);
  else if (state.step === "rp") await checkRepair(chatId, ctx, state, ownerUserId, text);
  else if (state.step === "part") await quoteParts(chatId, ctx, text, update.message?.from);
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
      state.step = "address";
      await sendMessage(chatId, "📍 ပို့ရမယ့် လိပ်စာ ရိုက်ပို့ပေးပါ။ ဆိုင်မှာ လာယူမယ်ဆိုရင် ကျော်ပါ။", {
        replyMarkup: keyboard([[btn("🏪 ဆိုင်မှာ လာယူမည် (ကျော်)", "s:skipaddr")]]),
      });
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
