import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// VPN keys sold on the bot, apart from the POS: plans typed in the bot, the key made only after
// staff say the money came, a renewal that extends the same key, and the hourly expiry check.
// The Outline server, the database and Telegram are stand-ins. Chat "999" is staff, "555" a customer.
type Sent = { chat: string; text: string; data: string[] };
type Key = { id: string; businessId: string; chatId: string; ownerUserId: string; outlineKeyId: string; planName: string; expiresAt: Date; disabledAt: Date | null; remindedAt: Date | null; dataLimitBytes: bigint | null };
type Order = { id: string; orderNo: string; businessId: string; ownerUserId: string; chatId: string; planName: string; days: number; limitBytes: bigint | null; price: bigint; status: string; renewKeyId: string | null; keySent: boolean };
const m = vi.hoisted(() => ({
  sent: [] as Sent[],
  outline: [] as string[],
  keys: [] as Key[],
  plans: [] as { name: string; days: number; price: bigint; limitBytes: bigint | null }[],
  order: null as null | Order,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vpnOrder: {
      findFirst: async () => m.order,
      update: async ({ data }: { data: object }) => Object.assign(m.order!, data),
      aggregate: async () => ({ _sum: { price: null }, _count: 0 }),
      count: async () => 0,
    },
    vpnPlan: {
      create: async ({ data }: { data: (typeof m.plans)[number] }) => { m.plans.push(data); return { id: "p1", ...data }; },
      findMany: async () => m.plans.map((p, i) => ({ id: `p${i}`, ...p })),
    },
    vpnKey: {
      findFirst: async ({ where }: { where: { id: string; chatId: string } }) => m.keys.find((k) => k.id === where.id && k.chatId === where.chatId) ?? null,
      findMany: async () => m.keys,
      count: async () => m.keys.length,
      create: async ({ data }: { data: Key }) => { m.keys.push({ ...data, id: "k-new", disabledAt: null, remindedAt: null }); },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Key> }) => Object.assign(m.keys.find((k) => k.id === where.id)!, data),
    },
    business: { findUnique: async () => ({ currency: "MMK" }) },
    user: { findUnique: async () => ({ telegramBotToken: "tok" }) },
  },
}));
vi.mock("@/lib/audit", () => ({ audit: async () => {} }));
vi.mock("@/lib/outline", () => ({
  OutlineError: class extends Error {},
  outlineConfigured: () => true,
  createOutlineKey: async (name: string, limit: bigint | null) => { m.outline.push(`create ${name} ${limit}`); return { id: "42", name, accessUrl: "ss://key42" }; },
  setOutlineLimit: async (id: string, b: bigint) => { m.outline.push(`limit ${id} ${b}`); },
  removeOutlineLimit: async (id: string) => { m.outline.push(`unlimit ${id}`); },
  deleteOutlineKey: async (id: string) => { m.outline.push(`delete ${id}`); },
  outlineAccessUrls: async () => new Map(),
  outlineUsage: async () => new Map(),
}));
vi.mock("@/lib/telegram", async (orig) => ({
  ...(await orig<typeof import("@/lib/telegram")>()),
  sendMessage: async (chat: string, text: string, opts?: { replyMarkup?: { inline_keyboard: { callback_data?: string }[][] } }) => {
    m.sent.push({ chat, text, data: (opts?.replyMarkup?.inline_keyboard ?? []).flat().map((b) => b.callback_data ?? "") });
  },
  sendMessageWith: async (_t: string, chat: string, text: string) => { m.sent.push({ chat, text, data: [] }); },
}));

import { handleVpnDecision, parsePlan, parsePlanLine, runDueVpnChecks, vpnAddPlanText, vpnEnabled } from "@/lib/vpnShop";

const staff = { id: "u1", businessId: "b1", permissions: ["sale.create", "settings.manage"] };
const DAY = 86_400_000;
const toCustomer = () => m.sent.filter((s) => s.chat === "555").map((s) => s.text).join("\n");
const toStaff = () => m.sent.filter((s) => s.chat === "999").map((s) => s.text).join("\n");

describe("VPN keys on the shop's bot", () => {
  const env = process.env.VPN_BUSINESS_ID;
  afterAll(() => { process.env.VPN_BUSINESS_ID = env; });
  beforeEach(() => {
    process.env.VPN_BUSINESS_ID = "b1";
    m.sent = []; m.outline = []; m.keys = []; m.plans = [];
    m.order = {
      id: "o1", orderNo: "VPN-00020", businessId: "b1", ownerUserId: "u1", chatId: "555", planName: "1 Month 50GB",
      days: 30, limitBytes: 50_000_000_000n, price: 500_000n, status: "NEW", renewKeyId: null, keySent: false,
    };
  });

  it("is for the one shop named on the server only", () => {
    expect(vpnEnabled("b1")).toBe(true);
    expect(vpnEnabled("b2")).toBe(false);
    process.env.VPN_BUSINESS_ID = "";
    expect(vpnEnabled("")).toBe(false);
  });

  it("reads how long and how much from the plan's name", () => {
    expect(parsePlan("VPN 1 Month 50GB")).toEqual({ days: 30, limitBytes: 50_000_000_000n });
    expect(parsePlan("VPN 7 Days 10 GB")).toEqual({ days: 7, limitBytes: 10_000_000_000n });
    expect(parsePlan("VPN ၃ လ Unlimited")).toEqual({ days: 90, limitBytes: null });
    expect(parsePlan("VPN 1 Year")).toEqual({ days: 365, limitBytes: null });
    expect(parsePlan("VPN Basic")).toEqual({ days: 30, limitBytes: null });
  });

  it("reads a plan staff type: the name, then the price", () => {
    expect(parsePlanLine("1 Month 50GB = 5000")).toEqual({ name: "1 Month 50GB", price: 500_000n, days: 30, limitBytes: 50_000_000_000n });
    expect(parsePlanLine("7 Days 10GB 1,500")).toMatchObject({ name: "7 Days 10GB", price: 150_000n, days: 7 });
    expect(parsePlanLine("3 Month Unlimited = ၁၅၀၀၀ ကျပ်")).toMatchObject({ name: "3 Month Unlimited", price: 1_500_000n, limitBytes: null });
    expect(parsePlanLine("just a name")).toBeNull();
    expect(parsePlanLine("= 5000")).toBeNull();
  });

  it("adds a typed plan and shows the VPN menu, and asks again when it cannot read the line", async () => {
    expect(await vpnAddPlanText("999", staff, "hello")).toBe(false);
    expect(m.plans).toHaveLength(0);
    expect(await vpnAddPlanText("999", staff, "1 Month 50GB = 5000")).toBe(true);
    expect(m.plans[0]).toMatchObject({ name: "1 Month 50GB", price: 500_000n });
    expect(toStaff()).toContain("POS နဲ့ သီးသန့်");
    expect(toStaff()).toContain("1 Month 50GB · 30 ရက်");
  });

  it("makes the key only after staff say the money came, and only once", async () => {
    await handleVpnDecision("999", staff, "vp:ok:o1");
    expect(m.order!.status).toBe("PAID");
    expect(m.outline).toEqual(["create VPN-00020 tg555 50000000000"]);
    expect(m.keys).toHaveLength(1);
    expect(m.keys[0].expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
    expect(toCustomer()).toContain("ss://key42");
    expect(toStaff()).not.toContain("POS");
    m.sent = [];
    await handleVpnDecision("999", staff, "vp:retry:o1");
    expect(m.outline).toHaveLength(1);
    expect(toCustomer()).toBe("");
  });

  it("cancels when the money did not come, and staff without the right cannot decide", async () => {
    await handleVpnDecision("999", { ...staff, permissions: [] }, "vp:ok:o1");
    expect(m.order!.status).toBe("NEW");
    await handleVpnDecision("999", staff, "vp:no:o1");
    expect(m.order!.status).toBe("CANCELLED");
    expect(m.outline).toEqual([]);
    expect(toCustomer()).toContain("မတွေ့ပါ");
  });

  it("extends the same key from its old end on a renewal", async () => {
    const end = new Date(Date.now() + 2 * DAY);
    m.keys.push({ id: "k7", businessId: "b1", chatId: "555", ownerUserId: "u1", outlineKeyId: "7", planName: "1 Month 50GB", expiresAt: end, disabledAt: null, remindedAt: new Date(), dataLimitBytes: 1n });
    m.order!.renewKeyId = "k7";
    await handleVpnDecision("999", staff, "vp:ok:o1");
    expect(m.outline).toEqual(["limit 7 50000000000"]);
    expect(m.keys).toHaveLength(1);
    expect(m.keys[0].expiresAt.getTime()).toBe(end.getTime() + 30 * DAY);
    expect(m.keys[0].remindedAt).toBeNull();
    expect(toCustomer()).toContain("သက်တမ်း တိုးပြီး");
  });

  it("reminds before the end, holds the key at no data at the end, and removes it a week later", async () => {
    const now = new Date();
    const base = { businessId: "b1", chatId: "555", ownerUserId: "u1", planName: "VPN", dataLimitBytes: null, remindedAt: null };
    m.keys.push(
      { ...base, id: "a", outlineKeyId: "1", expiresAt: new Date(now.getTime() + DAY), disabledAt: null },
      { ...base, id: "b", outlineKeyId: "2", expiresAt: new Date(now.getTime() - 1000), disabledAt: null },
      { ...base, id: "c", outlineKeyId: "3", expiresAt: new Date(now.getTime() - 9 * DAY), disabledAt: new Date(now.getTime() - 8 * DAY) },
    );
    await runDueVpnChecks(now);
    expect(m.keys[0].remindedAt).toEqual(now);
    expect(m.keys[1].disabledAt).toEqual(now);
    expect(m.outline).toEqual(["limit 2 0", "delete 3"]);
    expect(toCustomer()).toContain("ကုန်ပါမယ်");
    expect(toCustomer()).toContain("ကုန်သွားပါပြီ");
  });
});
