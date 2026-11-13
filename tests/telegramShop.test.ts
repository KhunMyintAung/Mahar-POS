import { beforeEach, describe, expect, it, vi } from "vitest";

// The bot's replies, its session row and the shop are stand-ins: the test walks a customer
// from the first message to a placed order and checks what they were sent. Chat "999" is the
// shop's own (staff) chat; "555" is the customer.
type Sent = { text: string; buttons: string[]; data: string[] };
const mocks = vi.hoisted(() => ({
  sent: [] as Sent[],
  owner: [] as Sent[],
  session: null as null | { step: string; data: string },
  orders: [] as unknown[],
  watched: [] as string[],
  logs: [] as string[],
  capture: null as null | { chat: string; lines: string[] },
  cfg: { aiCustomers: false, pickupOnly: false },
  aiKey: null as null | { provider: string; key: string },
  /** What the stand-in AI does with the tools before it replies. */
  ai: null as null | ((run: (name: string, args: Record<string, unknown>) => Promise<unknown>) => Promise<string>),
  order: { id: "o1", orderNo: "ORD-00008", status: "NEW", note: "Game top-up", lines: [{ name: "ML 86 Diamonds" }] },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async () => ({
        telegramChatId: "999",
        business: { id: "b1", name: "Mahar Shwe", phone: "09123", address: "", currency: "MMK", latitude: null, longitude: null, shopSlug: "mahar" },
      }),
    },
    contact: { findFirst: async () => null },
    telegramSession: {
      findUnique: async () => mocks.session,
      upsert: async ({ create }: { create: { step: string; data: string } }) => { mocks.session = { step: create.step, data: create.data }; },
    },
    onlineOrder: {
      findFirst: async () => mocks.order,
      update: async ({ data }: { data: { status?: string; note?: string } }) => { Object.assign(mocks.order, data); return mocks.order; },
    },
  },
}));
vi.mock("@/lib/audit", () => ({ audit: async () => {} }));

vi.mock("@/lib/telegram", async (orig) => {
  type Opts = { replyMarkup?: { inline_keyboard: { text: string; callback_data?: string }[][] }; caption?: string };
  const record = (chatId: string, text: string, opts?: Opts) => {
    const flat = (opts?.replyMarkup?.inline_keyboard ?? []).flat();
    if (mocks.capture?.chat === chatId) mocks.capture.lines.push(text);
    (chatId === "999" ? mocks.owner : mocks.sent).push({ text, buttons: flat.map((b) => b.text), data: flat.map((b) => b.callback_data ?? "") });
  };
  return {
    ...(await orig<typeof import("@/lib/telegram")>()),
    sendMessage: async (chatId: string, text: string, opts?: Opts) => record(chatId, text, opts),
    sendPhoto: async (chatId: string, _photo: string, opts?: Opts) => record(chatId, opts?.caption ?? "", opts),
    sendDocument: async (chatId: string, _doc: string, opts?: Opts) => record(chatId, opts?.caption ?? "", opts),
    sendChatAction: async () => {},
    withTranscript: async (chat: string, fn: () => Promise<unknown>) => {
      mocks.capture = { chat, lines: [] };
      const result = await fn();
      const lines = mocks.capture.lines;
      mocks.capture = null;
      return { result, lines };
    },
    answerCallbackQuery: async () => {},
  };
});

const items = [
  { id: "i1", name: "Type-C Charger", description: "Fast", category: "Accessories", model: "", variant: "", price: 1_500_000n, stock: 2, images: [] },
  { id: "i2", name: "iPhone 13", description: "", category: "Phone New", model: "iPhone 13", variant: "128GB", price: 150_000_000n, stock: 0, images: [] },
  { id: "g1", name: "ML 86 Diamonds", description: "", category: "Game Top-up", model: "", variant: "", price: 500_000n, stock: 999999, images: [] },
];
vi.mock("@/lib/onlineShop", () => ({
  loadOnlineShop: async () => ({ phone: "", mapUrl: "", partsHours: 3, partsDays: 2, partsNote: "", delivery: "", payment: "KBZPay 09123", ...mocks.cfg }),
  shopMapHref: () => "",
  publicShop: async () => ({ business: { id: "b1", name: "Mahar Shwe", phone: "09123", address: "", currency: "MMK" }, cfg: {}, items }),
  allowOrder: () => true,
}));
vi.mock("@/lib/onlineOrder", () => ({
  placeOnlineOrder: async (_shop: unknown, input: { lines: { quantity: number }[] }) => {
    mocks.orders.push(input);
    return { ok: true, orderId: "o1", orderNo: "ORD-00007", createdAt: new Date(), total: 3_000_000n, lines: [] };
  },
}));
vi.mock("@/lib/aiKey", () => ({ loadAiKey: async () => mocks.aiKey }));
vi.mock("@/lib/aiAgent", () => ({
  AiError: class extends Error {},
  askAgent: async (_key: unknown, _system: string, _turns: unknown, tools: { run: (n: string, a: Record<string, unknown>) => Promise<unknown> }) => mocks.ai!(tools.run),
}));

vi.mock("@/lib/moduleAccess", () => ({ loadModuleAccess: async () => ({ features: { repair: true } }) }));
vi.mock("@/lib/customerBot", async (orig) => ({
  ...(await orig<typeof import("@/lib/customerBot")>()),
  hasSpareParts: async () => true,
  findParts: async (_b: string, q: string) => ({
    parts: q.toLowerCase().includes("iphone 11") ? [{ id: "p1", name: "iPhone 11 LCD", price: 8_500_000n, inStock: true }] : [],
    more: false,
  }),
}));
const job = {
  id: "j1", jobNo: "MS0012", customerId: null, customerPhone: "09 777 123 456", deviceBrand: "Samsung", deviceModel: "A54",
  problem: "Screen", status: "IN_PROGRESS", estimatedCost: 0n, finalCost: 0n, paidAmount: 0n,
};
vi.mock("@/lib/repairLookup", () => ({ findRepairJobWhere: async (_w: unknown, typed: string) => (typed.toUpperCase().endsWith("12") ? job : null) }));
vi.mock("@/lib/repairTrack", () => ({ trackToken: () => "tok" }));
vi.mock("@/lib/telegramReports", () => ({ notifyReportTargets: (_b: string, text: string) => { mocks.logs.push(text); } }));
vi.mock("@/lib/repairWatch", () => ({ watchRepair: async (id: string) => { mocks.watched.push(id); } }));

import { conversationLog, handleCustomerUpdate, handleTopupDecision, staffReply } from "@/lib/telegramShop";

const chat = { id: 555, type: "private" };
const from = { id: 555, first_name: "Ko", username: "koaung" };
const say = (text: string) => handleCustomerUpdate({ update_id: 1, message: { message_id: 1, chat, from, text } }, "owner", "555");
const photo = () => handleCustomerUpdate({ update_id: 1, message: { message_id: 1, chat, from, photo: [{ file_id: "slip", file_unique_id: "u", width: 1, height: 1 }] } }, "owner", "555");
const tap = (data: string) => handleCustomerUpdate({ update_id: 1, callback_query: { id: "q", from, message: { message_id: 1, chat }, data } }, "owner", "555");
const last = () => mocks.sent[mocks.sent.length - 1];
const cart = () => JSON.parse(mocks.session!.data).cart;

describe("customer ordering on the shop's Telegram bot", () => {
  beforeEach(() => {
    mocks.sent = []; mocks.owner = []; mocks.session = null; mocks.orders = []; mocks.watched = []; mocks.logs = [];
    mocks.cfg = { aiCustomers: false, pickupOnly: false }; mocks.aiKey = null; mocks.ai = null;
    mocks.order = { id: "o1", orderNo: "ORD-00008", status: "NEW", note: "Game top-up", lines: [{ name: "ML 86 Diamonds" }] };
  });

  it("greets with the shop and its menu", async () => {
    await say("/start");
    expect(last().text).toContain("Mahar Shwe");
    const buttons = last().buttons.join(" ");
    expect(buttons).toContain("ခြင်းတောင်း (0)");
    // Repairs and the address are answered when asked, not offered as buttons.
    expect(buttons).not.toContain("ဖုန်းပြင်ပြီးပြီလား");
    expect(buttons).not.toContain("ဆက်သွယ်ရန်");
    expect(last().text).toContain("Voucher နံပါတ်");
    expect(buttons).toContain("Parts ဈေးမေးရန်");
    expect(buttons).toContain("Game ဖြည့်ရန်");
  });

  it("shows a repair only when the voucher and the phone digits both match, then watches it", async () => {
    await tap("s:rv");
    await say("ms 12");
    expect(last().text).toContain("၄ လုံး");
    await say("9999");
    expect(last().text).toContain("မကိုက်ပါ");
    expect(mocks.watched).toEqual([]);
    await tap("s:rv");
    await say("MS12");
    await say("၃၄၅၆");
    expect(last().text).toContain("MS0012");
    expect(last().text).toContain("ပြင်ဆင်နေဆဲ");
    expect(last().text).not.toContain("777");
    expect(mocks.watched).toEqual(["j1"]);
  });

  it("quotes a part with how soon, and passes an unknown one to the shop", async () => {
    await tap("s:part");
    await say("iPhone 11 မှန်");
    expect(last().text).toContain("iPhone 11 LCD");
    expect(last().text).toContain("နာရီအတွင်း");
    await say("Vivo Y99 မှန်");
    expect(last().text).toContain("မတွေ့ပါ");
    expect(mocks.owner[0].text).toContain("Vivo Y99");
  });

  it("finds items by the words typed and marks what is sold out", async () => {
    await say("iphone");
    expect(last().buttons[0]).toContain("iPhone 13 · 128GB");
    expect(last().buttons[0]).toContain("(ကုန်)");
  });

  it("never puts more in the cart than is on the shelf, nor a game top-up at all", async () => {
    await tap("s:add:i1");
    await tap("s:add:i1");
    await tap("s:add:i1");
    expect(cart()).toEqual({ i1: 2 });
    await tap("s:add:i2");
    expect(cart()).toEqual({ i1: 2 });
    await tap("s:add:g1");
    expect(cart()).toEqual({ i1: 2 });
    expect(last().text).toContain("Game ID");
  });

  it("takes name, phone and address, then places an Online Shop order", async () => {
    await tap("s:add:i1");
    await tap("s:checkout");
    expect(last().text).toContain("နာမည်");
    await say("Ko Aung");
    await say("12");
    expect(last().text).toContain("မှန်အောင်");
    await say("09 777 888 999");
    await say("Yangon");
    expect(last().text).toContain("09777888999");
    await tap("s:confirm");
    expect(mocks.orders).toEqual([{ customerName: "Ko Aung", customerPhone: "09777888999", address: "Yangon", note: "Telegram @koaung", lines: [{ itemId: "i1", quantity: 1 }] }]);
    expect(last().text).toContain("ORD-00007");
    // The cart empties; the details stay for the next order.
    const state = JSON.parse(mocks.session!.data);
    expect(state.cart).toEqual({});
    expect(state.name).toBe("Ko Aung");
  });

  it("does not ask for an address when orders are collected at the shop", async () => {
    mocks.cfg.pickupOnly = true;
    await tap("s:add:i1");
    await tap("s:checkout");
    await say("Ko Aung");
    await say("09777888999");
    expect(last().text).toContain("အော်ဒါ စစ်ပေးပါ");
    expect(last().buttons.join(" ")).toContain("အတည်ပြု");
  });
});

describe("game top-up on the shop's Telegram bot", () => {
  beforeEach(() => {
    mocks.sent = []; mocks.owner = []; mocks.session = null; mocks.orders = [];
    mocks.cfg = { aiCustomers: false, pickupOnly: false };
    mocks.order = { id: "o1", orderNo: "ORD-00008", status: "NEW", note: "Game top-up", lines: [{ name: "ML 86 Diamonds" }] };
  });

  it("takes the game ID, reads it back, then sends the slip to the shop to check", async () => {
    await tap("s:tus");
    expect(last().buttons[0]).toContain("ML 86 Diamonds");
    await tap("s:tu:g1");
    await say("123");
    expect(last().text).toContain("မှန်အောင်");
    await say("12345678 (2001)");
    expect(last().text).toContain("12345678 (2001)");
    expect(last().text).toContain("ပြန်ယူလို့ မရပါ");
    await tap("s:tu_pay");
    expect(last().text).toContain("KBZPay 09123");
    await say("paid");
    expect(last().text).toContain("Screenshot");
    expect(mocks.orders).toEqual([]);
    await photo();
    expect(mocks.orders).toEqual([expect.objectContaining({ note: expect.stringContaining("ID 12345678 (2001)"), lines: [{ itemId: "g1", quantity: 1 }] })]);
    expect(last().text).toContain("ORD-00007");
    expect(mocks.owner[0].text).toContain("12345678 (2001)");
    expect(mocks.owner[0].data).toEqual(["tu:ok:o1:555", "tu:no:o1:555"]);
  });

  it("lets staff with sale rights mark it paid and then done, once each", async () => {
    const staff = { id: "u1", businessId: "b1", permissions: ["sale.create"] };
    await handleTopupDecision("999", { ...staff, permissions: [] }, "tu:ok:o1:555");
    expect(mocks.order.status).toBe("NEW");
    await handleTopupDecision("999", staff, "tu:ok:o1:555");
    expect(mocks.order.status).toBe("CONFIRMED");
    expect(last().text).toContain("ငွေရပါပြီ");
    expect(mocks.owner.at(-1)!.data).toEqual(["tu:done:o1:555"]);
    await handleTopupDecision("999", staff, "tu:no:o1:555");
    expect(mocks.order.status).toBe("CONFIRMED");
    await handleTopupDecision("999", staff, "tu:done:o1:555");
    expect(last().text).toContain("ဖြည့်ပြီးပါပြီ");
    expect(mocks.owner.at(-1)!.text).toContain("POS");
    const told = mocks.sent.length;
    await handleTopupDecision("999", staff, "tu:done:o1:555");
    expect(mocks.sent.length).toBe(told);
  });
});

describe("AI answers on the shop's Telegram bot", () => {
  beforeEach(() => {
    mocks.sent = []; mocks.owner = []; mocks.session = null;
    mocks.cfg = { aiCustomers: true, pickupOnly: false };
    mocks.aiKey = { provider: "OPENAI", key: "k" };
  });

  it("answers from the tools and shows the cart it filled for the customer to confirm", async () => {
    mocks.ai = async (run) => {
      const found = (await run("search_products", { query: "charger" })) as { item_id: string; price: string }[];
      expect(found[0].price).toContain("15,000");
      await run("add_to_cart", { item_id: found[0].item_id, quantity: 5 });
      return "Charger 15,000 ကျပ်ပါ။";
    };
    await say("charger ရှိလား");
    expect(mocks.sent.at(-2)!.text).toContain("15,000");
    expect(last().text).toContain("ခြင်းတောင်း");
    expect(last().buttons.join(" ")).toContain("မှာယူမည်");
    expect(cart()).toEqual({ i1: 2 });
  });

  it("cannot put a game top-up in the cart, and hands the chat to staff when asked", async () => {
    mocks.ai = async (run) => {
      expect(await run("add_to_cart", { item_id: "g1" })).toEqual({ error: expect.stringContaining("start_topup") });
      await run("call_staff", { reason: "wants a person" });
      return "ဝန်ထမ်းက ပြန်ဖြေပေးပါမယ်။";
    };
    await say("လူနဲ့ ပြောချင်တယ်");
    expect(mocks.owner.at(-1)!.text).toContain("wants a person");
    // Staff can answer through the bot whether or not the customer has a username.
    expect(mocks.owner.at(-1)!.data).toContain("rep:555");
    expect(mocks.owner.at(-1)!.buttons.join(" ")).toContain("Telegram မှာ ဖွင့်ရန်");
    mocks.ai = async () => { throw new Error("the AI must keep out while staff have the chat"); };
    await say("ဟယ်လို");
    expect(mocks.owner.at(-1)!.text).toContain("ဟယ်လို");
    expect(last().text).toContain("ဆိုင်ကို ပို့ထားပါတယ်");
  });

  it("sends a staff member's typed answer to the customer, and hands their reply back to staff", async () => {
    await staffReply("owner", "b1", "Aung", "555", "ရှိပါတယ်ခင်ဗျ");
    expect(last().text).toBe("💬 ဆိုင်မှ: ရှိပါတယ်ခင်ဗျ");
    expect(JSON.parse(mocks.session!.data).humanUntil).toBeGreaterThan(Date.now());
    mocks.ai = async () => { throw new Error("the AI must keep out while staff have the chat"); };
    await say("ဘယ်လောက်လဲ");
    expect(mocks.owner.at(-1)!.text).toContain("ဘယ်လောက်လဲ");
    expect(mocks.owner.at(-1)!.data).toContain("rep:555");
  });

  it("falls back to the buttons' answer with no AI key", async () => {
    mocks.aiKey = null;
    await say("iphone");
    expect(last().buttons[0]).toContain("iPhone 13");
  });

  it("checks a voucher typed straight in, and says where the shop is when asked", async () => {
    await say("MS0012");
    expect(last().text).toContain("၄ လုံး");
    await say("3456");
    expect(last().text).toContain("MS0012");
    await say("ဆိုင်လိပ်စာ ဘယ်မှာလဲ");
    expect(last().text).toContain("09123");
  });

  it("answers a part question typed straight in, without the AI", async () => {
    await say("Iphone 11 မှန်ရှိလား");
    expect(mocks.sent.map((m) => m.text).join(" ")).toContain("iPhone 11 LCD");
    mocks.sent = [];
    await say("charger");
    expect(last().buttons.join(" ")).toContain("Type-C Charger");
  });

  it("logs each exchange to the reports bot: what was typed or tapped and what the bot said", async () => {
    mocks.logs = [];
    await say("/start");
    expect(mocks.logs).toHaveLength(1);
    expect(mocks.logs[0]).toContain("Customer Bot · Ko @koaung");
    expect(mocks.logs[0]).toContain("👤 /start");
    expect(mocks.logs[0]).toContain("🤖 🙏 Mahar Shwe");
    const tapped = conversationLog({ update_id: 1, callback_query: { id: "q", from, data: "s:rv", message: { message_id: 1, chat, reply_markup: { inline_keyboard: [[{ text: "🔧 စစ်ရန်", callback_data: "s:rv" }]] } } } }, ["a key ss://abc@1.2.3.4:5/?x"]);
    expect(tapped).toContain("👆 🔧 စစ်ရန်");
    expect(tapped).not.toContain("abc@");
    expect(tapped).toContain("VPN Key");
  });
});
