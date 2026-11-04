import { prisma } from "./prisma";
import { answerCallbackQuery, btn, keyboard, linkBtn, sendMessage, sendPhoto, type InlineButton, type TgUpdate } from "./telegram";
import { allowOrder, publicShop } from "./onlineShop";
import { placeOnlineOrder, type PublicShop } from "./onlineOrder";
import { fmtMoney } from "./format";

// ---------------------------------------------------------------------------
// The shop's bot for customers: anyone who is not the linked staff member can look
// through what the shop sells online, fill a cart and send an order. The order is an
// ordinary Online Shop order (same prices, same stock check, same Telegram notice to the
// shop), so the shop answers it from Online Shop like one from the web page.
// Everything here is in Myanmar: a customer never picked a language.
// ---------------------------------------------------------------------------

const PAGE = 8;
const appUrl = () => (process.env.APP_URL ?? "https://app.maharpos.shop").replace(/\/+$/, "");
const CLOSED = `မင်္ဂလာပါ 🙏

ဤ bot မှတစ်ဆင့် ဝန်ဆောင်မှု မရှိပါ။ ဆိုင်သို့ တိုက်ရိုက် ဆက်သွယ်ပါ။`;

type Shop = PublicShop & { slug: string };
type Item = Shop["items"][number];
interface State {
  /** What the next typed message is: the customer's name, phone or address, or a search. */
  step: "browse" | "name" | "phone" | "address";
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

async function loadShop(ownerUserId: string): Promise<Shop | null> {
  const owner = await prisma.user.findUnique({ where: { id: ownerUserId }, select: { business: { select: { shopSlug: true } } } });
  const slug = owner?.business.shopSlug;
  if (!slug) return null;
  const shop = await publicShop(slug);
  return shop && shop.items.length > 0 ? { ...shop, slug } : null;
}

const price = (shop: Shop, minor: bigint) => fmtMoney(minor, shop.business.currency);
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

function homeButtons(shop: Shop, state: State): InlineButton[][] {
  return [
    [btn("🛍 ပစ္စည်းအမျိုးအစားများ", "s:cats"), btn("📋 အားလုံး", "s:all:0")],
    [btn(`🛒 ခြင်းတောင်း (${cartCount(state)})`, "s:cart")],
    [linkBtn("🌐 Online Shop ဖွင့်ရန်", `${appUrl()}/shop/${shop.slug}`)],
  ];
}

async function home(chatId: string, shop: Shop, state: State) {
  const b = shop.business;
  await sendMessage(chatId, [
    `🙏 ${b.name} မှ ကြိုဆိုပါတယ်`,
    "",
    "ပစ္စည်းများကို ကြည့်ပြီး ခြင်းတောင်းထဲ ထည့်ကာ ဒီမှာပဲ မှာယူနိုင်ပါတယ်။",
    "🔍 ရှာချင်တာကို စာရိုက်ပို့လိုက်ပါ (ဥပမာ - iPhone, charger)။",
    ...(b.phone ? ["", `📞 ${b.phone}`] : []),
    ...(b.address ? [`📍 ${b.address}`] : []),
  ].join("\n"), { replyMarkup: keyboard(homeButtons(shop, state)) });
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
    await sendMessage(chatId, "🛒 ခြင်းတောင်းထဲမှာ ဘာမှ မရှိသေးပါ။", { replyMarkup: keyboard(homeButtons(shop, state)) });
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
  const shop = await loadShop(ownerUserId);
  const cq = update.callback_query;
  if (!shop) {
    if (cq) await answerCallbackQuery(cq.id);
    return sendMessage(chatId, CLOSED);
  }
  const state = await load(ownerUserId, chatId);
  const byId = (id: string) => shop.items.find((i) => i.id === id);

  if (cq) {
    const [, action = "", arg = "", page = "0"] = (cq.data ?? "").split(":");
    let toast: string | undefined;
    if (action === "home") await home(chatId, shop, state);
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
    else await home(chatId, shop, state);
    await answerCallbackQuery(cq.id, toast);
    await save(ownerUserId, chatId, state);
    return;
  }

  const text = (update.message?.text ?? "").trim();
  if (!text || text === "/start" || text === "/menu" || text === "/help") {
    state.step = "browse";
    await home(chatId, shop, state);
  } else if (state.step === "name") {
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
