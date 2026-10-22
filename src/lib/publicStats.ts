import { prisma } from "./prisma";
import { adminUsers } from "./adminAccess";
import { parseModuleAccess } from "./modules";

/** Figures and shop lists for the public landing page (maharpos.shop), in the same shape the
 *  old app served, so the page needs no change. Only what a shop already shows the public
 *  (its name, town, logo, kind of shop) is listed; nothing about its money or customers.
 *  Locked shops (every account switched off) are left out. Results are kept for a minute. */

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, make: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.value as T;
  const value = await make();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const TYPE_LABEL: Record<string, string> = {
  MOBILE_SHOP: "Phone Shop", MINI_MART: "Mini Mart", ALL_IN_ONE: "All-in-one Shop", PERSONAL: "Personal", CUSTOM: "Shop",
};

interface ShopRow {
  id: string; slug: string; name: string; logo: string; location: string; businessType: string;
  description: string; verified: boolean; status: "active"; createdAt: Date;
}

/** Every shop with at least one account switched on, newest first. */
async function activeShops(): Promise<ShopRow[]> {
  return cached("shops", async () => {
    const [businesses, users, modules, items, sales] = await Promise.all([
      prisma.business.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, city: true, address: true, logoUrl: true, createdAt: true } }),
      prisma.user.findMany({ where: { deletedAt: null }, select: { businessId: true, active: true, email: true } }),
      prisma.systemSetting.findMany({ where: { key: "modules" }, select: { businessId: true, value: true } }),
      prisma.item.groupBy({ by: ["businessId"], where: { deletedAt: null }, _count: true }),
      prisma.sale.groupBy({ by: ["businessId"], where: { deletedAt: null, status: "COMPLETED" }, _count: true }),
    ]);
    const admins = new Set(adminUsers());
    const kind = new Map(modules.map((m) => {
      try { return [m.businessId, parseModuleAccess(JSON.parse(m.value)).category] as const; } catch { return [m.businessId, "CUSTOM"] as const; }
    }));
    const itemCount = new Map(items.map((i) => [i.businessId, i._count]));
    const saleCount = new Map(sales.map((s) => [s.businessId, s._count]));
    return businesses
      .filter((b) => users.some((u) => u.businessId === b.id && u.active))
      .map((b) => ({
        id: b.id,
        slug: b.id.slice(0, 8),
        name: b.name,
        logo: b.logoUrl ? `${(process.env.APP_URL ?? "").replace(/\/+$/, "")}/api/public/shop-logo/${b.id}` : "",
        location: b.city ?? "",
        businessType: TYPE_LABEL[kind.get(b.id) ?? "CUSTOM"] ?? "Shop",
        description: `${itemCount.get(b.id) ?? 0} products · ${saleCount.get(b.id) ?? 0} sales records`,
        // The platform owner's own shop carries the badge.
        verified: users.some((u) => u.businessId === b.id && u.email && admins.has(u.email.toLowerCase())),
        status: "active" as const,
        createdAt: b.createdAt,
      }));
  });
}

export async function publicStats() {
  return cached("stats", async () => {
    const shops = await activeShops();
    const monthAgo = new Date(Date.now() - 30 * 86400_000);
    const [registeredShops, users, products, sales, repairs, dailyClosings] = await Promise.all([
      prisma.business.count(),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.item.count({ where: { deletedAt: null } }),
      prisma.sale.count({ where: { deletedAt: null, status: "COMPLETED" } }),
      prisma.repairJob.count({ where: { deletedAt: null } }),
      prisma.dailyClose.count().catch(() => 0),
    ]);
    return {
      ok: true,
      activeShops: shops.length,
      // No paid plans yet: shops in their first month count as on trial.
      trialShops: shops.filter((s) => s.createdAt >= monthAgo).length,
      paidShops: 0,
      registeredShops, users, products, sales, repairs, dailyClosings,
      locations: new Set(shops.map((s) => s.location.trim().toLowerCase()).filter(Boolean)).size,
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function publicShops(opts: { page: number; limit: number; search: string; location: string; businessType: string }) {
  const all = await activeShops();
  const q = opts.search.trim().toLowerCase();
  const filtered = all.filter((s) =>
    (!q || s.name.toLowerCase().includes(q) || s.location.toLowerCase().includes(q)) &&
    (!opts.location || s.location === opts.location) &&
    (!opts.businessType || s.businessType === opts.businessType));
  const start = (opts.page - 1) * opts.limit;
  return {
    ok: true, page: opts.page, limit: opts.limit, total: filtered.length,
    shops: filtered.slice(start, start + opts.limit).map((s) => ({ id: s.id, slug: s.slug, name: s.name, logo: s.logo, location: s.location, businessType: s.businessType, description: s.description, verified: s.verified, status: s.status })),
  };
}

/** Shops by how often they signed in over the last 30 days. */
export async function publicActiveUsers(limit: number) {
  return cached(`active-${limit}`, async () => {
    const since = new Date(Date.now() - 30 * 86400_000);
    const shops = await activeShops();
    const names = new Map(shops.map((s) => [s.id, s.name]));
    const [logins, last] = await Promise.all([
      prisma.auditLog.groupBy({ by: ["businessId"], where: { action: "LOGIN", createdAt: { gte: since } }, _count: true }),
      prisma.auditLog.groupBy({ by: ["businessId"], where: { createdAt: { gte: since } }, _max: { createdAt: true } }),
    ]);
    const lastAt = new Map(last.map((l) => [l.businessId, l._max.createdAt]));
    const rows = shops.map((s) => ({
      shopId: s.id,
      displayName: names.get(s.id)!,
      loginCount: logins.find((l) => l.businessId === s.id)?._count ?? 0,
      lastActiveAt: (lastAt.get(s.id) ?? s.createdAt).toISOString(),
    }));
    rows.sort((a, b) => b.loginCount - a.loginCount || b.lastActiveAt.localeCompare(a.lastActiveAt));
    return { ok: true, periodDays: 30, updatedAt: new Date().toISOString(), users: rows.slice(0, limit) };
  });
}
