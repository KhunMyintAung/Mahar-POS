import { beforeEach, describe, expect, it, vi } from "vitest";

// The bot's replies, its session row and the shop are stand-ins: the test walks a customer
// from the first message to a placed order and checks what they were sent.
const mocks = vi.hoisted(() => ({
  sent: [] as { text: string; buttons: string[] }[],
  session: null as null | { step: string; data: string },
  orders: [] as unknown[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: async () => ({ business: { shopSlug: "mahar" } }) },
    telegramSession: {
      findUnique: async () => mocks.session,
      upsert: async ({ create }: { create: { step: string; data: string } }) => { mocks.session = { step: create.step, data: create.data }; },
    },
  },
}));

vi.mock("@/lib/telegram", async (orig) => {
  const record = (text: string, opts?: { replyMarkup?: { inline_keyboard: { text: string }[][] }; caption?: string }) => {
    mocks.sent.push({ text, buttons: (opts?.replyMarkup?.inline_keyboard ?? []).flat().map((b) => b.text) });
  };
  return {
    ...(await orig<typeof import("@/lib/telegram")>()),
    sendMessage: async (_chat: string, text: string, opts?: Parameters<typeof record>[1]) => record(text, opts),
    sendPhoto: async (_chat: string, _photo: string, opts?: { caption?: string } & Parameters<typeof record>[1]) => record(opts?.caption ?? "", opts),
    answerCallbackQuery: async () => {},
  };
});

const items = [
  { id: "i1", name: "Type-C Charger", description: "Fast", category: "Accessories", model: "", variant: "", price: 1_500_000n, stock: 2, images: [] },
  { id: "i2", name: "iPhone 13", description: "", category: "Phone New", model: "iPhone 13", variant: "128GB", price: 150_000_000n, stock: 0, images: [] },
];
vi.mock("@/lib/onlineShop", () => ({
  publicShop: async () => ({ business: { id: "b1", name: "Mahar Shwe", phone: "09123", address: "", currency: "MMK" }, cfg: {}, items }),
  allowOrder: () => true,
}));
vi.mock("@/lib/onlineOrder", () => ({
  placeOnlineOrder: async (_shop: unknown, input: { lines: { quantity: number }[] }) => {
    mocks.orders.push(input);
    return { ok: true, orderNo: "ORD-00007", createdAt: new Date(), total: 3_000_000n, lines: [] };
  },
}));

import { handleCustomerUpdate } from "@/lib/telegramShop";

const chat = { id: 555, type: "private" };
const say = (text: string) => handleCustomerUpdate({ update_id: 1, message: { message_id: 1, chat, text } }, "owner", "555");
const tap = (data: string) => handleCustomerUpdate({ update_id: 1, callback_query: { id: "q", from: { id: 555, first_name: "Ko", username: "koaung" }, message: { message_id: 1, chat }, data } }, "owner", "555");
const last = () => mocks.sent[mocks.sent.length - 1];

describe("customer ordering on the shop's Telegram bot", () => {
  beforeEach(() => { mocks.sent = []; mocks.session = null; mocks.orders = []; });

  it("greets with the shop and its menu", async () => {
    await say("/start");
    expect(last().text).toContain("Mahar Shwe");
    expect(last().buttons.join(" ")).toContain("ခြင်းတောင်း (0)");
  });

  it("finds items by the words typed and marks what is sold out", async () => {
    await say("iphone");
    expect(last().buttons[0]).toContain("iPhone 13 · 128GB");
    expect(last().buttons[0]).toContain("(ကုန်)");
  });

  it("never puts more in the cart than is on the shelf", async () => {
    await tap("s:add:i1");
    await tap("s:add:i1");
    await tap("s:add:i1");
    expect(JSON.parse(mocks.session!.data).cart).toEqual({ i1: 2 });
    await tap("s:add:i2");
    expect(JSON.parse(mocks.session!.data).cart).toEqual({ i1: 2 });
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
});
