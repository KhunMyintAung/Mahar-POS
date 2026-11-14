import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// System pop-ups (Web Push): the settings card's subscribe route, and sendPush choosing who
// gets a notice and dropping devices the push service no longer knows. The database, the
// signed-in person and the push service are stand-ins.
type Sub = { id: string; businessId: string; userId: string; endpoint: string; p256dh: string; auth: string; userAgent: string | null; createdAt: Date; lastOkAt: Date | null };
const m = vi.hoisted(() => ({
  subs: [] as Sub[],
  users: [] as { id: string; businessId: string; active: boolean; deletedAt: Date | null; role: { name: string; permissions: string } }[],
  me: null as null | { id: string; businessId: string; roleName: string; permissions: string[] },
  sent: [] as { endpoint: string; payload: string }[],
  fail: new Map<string, number>(),
  n: 0,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: {
      findMany: async ({ where, orderBy }: { where: { businessId?: string; userId?: string }; orderBy?: { createdAt: "desc" } }) => {
        const found = m.subs.filter((s) => (!where.businessId || s.businessId === where.businessId) && (!where.userId || s.userId === where.userId));
        return orderBy ? [...found].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) : found;
      },
      upsert: async ({ where, create, update }: { where: { endpoint: string }; create: Omit<Sub, "id" | "createdAt" | "lastOkAt">; update: Partial<Sub> }) => {
        const found = m.subs.find((s) => s.endpoint === where.endpoint);
        if (found) return Object.assign(found, update);
        const s = { ...create, id: `s${++m.n}`, createdAt: new Date(Date.now() + m.n), lastOkAt: null } as Sub;
        m.subs.push(s);
        return s;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Sub> }) => Object.assign(m.subs.find((s) => s.id === where.id)!, data),
      deleteMany: async ({ where }: { where: { id?: string | { in: string[] }; endpoint?: string; businessId?: string } }) => {
        const ids = typeof where.id === "string" ? [where.id] : where.id?.in;
        const before = m.subs.length;
        m.subs = m.subs.filter((s) => !((ids ? ids.includes(s.id) : true) && (!where.endpoint || s.endpoint === where.endpoint) && (!where.businessId || s.businessId === where.businessId)));
        return { count: before - m.subs.length };
      },
    },
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] }; businessId: string } }) =>
        m.users.filter((u) => where.id.in.includes(u.id) && u.businessId === where.businessId && u.active && !u.deletedAt),
    },
  },
}));
vi.mock("@/lib/auth", () => ({
  getAuthUser: async () => m.me,
  can: (u: { permissions: string[] }, p: string) => u.permissions.includes(p),
}));
vi.mock("@/lib/shopZone", () => ({ inShopZone: (_b: string, f: () => unknown) => f() }));
vi.mock("web-push", () => ({
  default: {
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      const status = m.fail.get(sub.endpoint);
      if (status) throw Object.assign(new Error("push failed"), { statusCode: status });
      m.sent.push({ endpoint: sub.endpoint, payload });
      return { statusCode: 201 };
    },
  },
}));

import { GET, POST, DELETE } from "@/app/api/v1/push/subscribe/route";
import { noticeToPush, sendPush } from "@/lib/pushSend";

const ctx = { params: Promise.resolve({}) };
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/v1/push/subscribe", {
    method, headers: { "content-type": "application/json", "user-agent": "Test Browser" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
const subBody = (endpoint: string) => ({ endpoint, keys: { p256dh: "BPkey", auth: "authkey" } });

const role = (name: string, perms: string[]) => ({ name, permissions: JSON.stringify(perms) });
function sub(id: string, userId: string, businessId = "b1"): Sub {
  return { id, businessId, userId, endpoint: `https://push.example/${id}`, p256dh: "k", auth: "a", userAgent: null, createdAt: new Date(), lastOkAt: null };
}

beforeEach(() => {
  m.subs = [];
  m.sent = [];
  m.fail.clear();
  m.n = 0;
  m.me = { id: "u1", businessId: "b1", roleName: "Owner", permissions: [] };
  m.users = [];
  process.env.VAPID_PUBLIC_KEY = "BPublicKeyForTests";
  process.env.VAPID_PRIVATE_KEY = "private";
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
});

describe("push subscribe route", () => {
  it("gives the public key, and null when push is not set up", async () => {
    expect(await (await GET(req("GET"), ctx)).json()).toEqual({ ok: true, data: { publicKey: "BPublicKeyForTests" } });
    delete process.env.VAPID_PUBLIC_KEY;
    expect(await (await GET(req("GET"), ctx)).json()).toEqual({ ok: true, data: { publicKey: null } });
  });

  it("needs a signed-in person", async () => {
    m.me = null;
    expect((await POST(req("POST", subBody("https://push.example/1")), ctx)).status).toBe(401);
    expect(m.subs).toHaveLength(0);
  });

  it("keeps the device under the person signed in, once per endpoint", async () => {
    expect((await POST(req("POST", subBody("https://push.example/1")), ctx)).status).toBe(200);
    expect(m.subs).toMatchObject([{ businessId: "b1", userId: "u1", endpoint: "https://push.example/1", p256dh: "BPkey", auth: "authkey", userAgent: "Test Browser" }]);
    // The same browser, now signed in as someone else.
    m.me = { id: "u2", businessId: "b1", roleName: "Cashier", permissions: [] };
    await POST(req("POST", subBody("https://push.example/1")), ctx);
    expect(m.subs).toHaveLength(1);
    expect(m.subs[0].userId).toBe("u2");
  });

  it("refuses an address that is not https, and when push is not set up", async () => {
    expect((await POST(req("POST", subBody("http://push.example/1")), ctx)).status).toBe(422);
    delete process.env.VAPID_PRIVATE_KEY;
    expect((await POST(req("POST", subBody("https://push.example/1")), ctx)).status).toBe(503);
    expect(m.subs).toHaveLength(0);
  });

  it("keeps at most ten devices a person, dropping the oldest", async () => {
    for (let i = 1; i <= 12; i++) await POST(req("POST", subBody(`https://push.example/${i}`)), ctx);
    expect(m.subs).toHaveLength(10);
    expect(m.subs.map((s) => s.endpoint)).not.toContain("https://push.example/1");
    expect(m.subs.map((s) => s.endpoint)).toContain("https://push.example/12");
  });

  it("removes this device, only within the shop", async () => {
    m.subs = [sub("a", "u1"), { ...sub("b", "x", "b2"), endpoint: "https://push.example/a" }];
    expect((await DELETE(req("DELETE", { endpoint: "https://push.example/a" }), ctx)).status).toBe(200);
    expect(m.subs.map((s) => s.businessId)).toEqual(["b2"]);
  });
});

describe("sendPush", () => {
  beforeEach(() => {
    m.users = [
      { id: "owner", businessId: "b1", active: true, deletedAt: null, role: role("Owner", []) },
      { id: "tech", businessId: "b1", active: true, deletedAt: null, role: role("Service Tech", ["repair.view"]) },
      { id: "cash", businessId: "b1", active: true, deletedAt: null, role: role("Cashier", ["sale.view"]) },
      { id: "gone", businessId: "b1", active: false, deletedAt: null, role: role("Owner", []) },
    ];
    m.subs = [sub("o", "owner"), sub("t", "tech"), sub("c", "cash"), sub("g", "gone"), sub("other", "owner", "b2")];
  });
  const to = () => m.sent.map((s) => s.endpoint.split("/").pop()).sort();

  it("sends to those with the permission, never to the one who did it", async () => {
    const r = await sendPush("b1", { title: "New repair", body: "iPhone 12", url: "/repairs" }, { perm: "repair.view", exceptUserId: "tech" });
    expect(to()).toEqual(["o"]);
    expect(r).toEqual({ sent: 1, removed: 0 });
    expect(JSON.parse(m.sent[0].payload)).toEqual({ title: "New repair", body: "iPhone 12", url: "/repairs" });
    expect(m.subs.find((s) => s.id === "o")!.lastOkAt).toBeInstanceOf(Date);
  });

  it("sends to owners only when asked", async () => {
    await sendPush("b1", { title: "VPN", body: "waiting" }, { ownersOnly: true });
    expect(to()).toEqual(["o"]);
  });

  it("removes a device the push service says is gone (404, 410) and keeps one that failed otherwise", async () => {
    m.fail.set("https://push.example/t", 410);
    m.fail.set("https://push.example/c", 404);
    m.fail.set("https://push.example/o", 500);
    const r = await sendPush("b1", { title: "Sale", body: "" });
    expect(r).toEqual({ sent: 0, removed: 2 });
    expect(m.subs.map((s) => s.id).sort()).toEqual(["g", "o", "other"]);
  });

  it("sends nothing when push is not set up", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect(await sendPush("b1", { title: "x", body: "y" })).toEqual({ sent: 0, removed: 0 });
    expect(m.sent).toHaveLength(0);
  });

  it("opens only a path on this site", async () => {
    await sendPush("b1", { title: "x", body: "y", url: "https://evil.example" }, { onlyUserId: "owner" });
    expect(JSON.parse(m.sent[0].payload).url).toBe("/");
  });

  it("turns a notice's first line into the title", () => {
    expect(noticeToPush("🆕 Repair R-1\n📱 iPhone 12\n\n👤 Ko Ko", "/repairs")).toEqual({ title: "🆕 Repair R-1", body: "📱 iPhone 12\n👤 Ko Ko", url: "/repairs" });
  });
});
