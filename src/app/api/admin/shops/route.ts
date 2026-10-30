import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/adminAccess";
import { MSP_REWARD_KEY, parseRewardSettings } from "@/lib/mspRewards";

export const dynamic = "force-dynamic";

/** Every shop on the service with its owner and how much it is used. Admin only: these
 *  are other businesses' names and contacts. */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const [businesses, users, sales, repairs, lastLogins, rewardRows] = await Promise.all([
    prisma.business.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, phone: true, city: true, createdAt: true } }),
    prisma.user.findMany({ where: { deletedAt: null }, select: { businessId: true, name: true, email: true, username: true, active: true, role: { select: { name: true } }, createdAt: true } }),
    prisma.sale.groupBy({ by: ["businessId"], where: { deletedAt: null, status: "COMPLETED" }, _count: true }),
    prisma.repairJob.groupBy({ by: ["businessId"], where: { deletedAt: null }, _count: true }),
    prisma.authSession.findMany({ orderBy: { createdAt: "desc" }, take: 5000, select: { createdAt: true, user: { select: { businessId: true } } } }),
    prisma.systemSetting.findMany({ where: { key: MSP_REWARD_KEY }, select: { businessId: true, value: true } }),
  ]);
  const rewardOf = new Map(rewardRows.map((r) => [r.businessId, parseRewardSettings(JSON.parse(r.value))]));
  const last = new Map<string, Date>();
  for (const s of lastLogins) if (!last.has(s.user.businessId)) last.set(s.user.businessId, s.createdAt);
  const saleCount = new Map(sales.map((s) => [s.businessId, s._count]));
  const repairCount = new Map(repairs.map((r) => [r.businessId, r._count]));
  const shops = businesses.map((b) => {
    const staff = users.filter((u) => u.businessId === b.id);
    const owner = staff.find((u) => u.role.name === "Owner") ?? [...staff].sort((x, y) => +x.createdAt - +y.createdAt)[0];
    return {
      id: b.id, name: b.name, phone: b.phone, city: b.city, createdAt: b.createdAt,
      owner: owner ? { name: owner.name, email: owner.email, username: owner.username } : null,
      users: staff.length,
      locked: staff.length > 0 && staff.every((u) => !u.active),
      lastLoginAt: last.get(b.id) ?? null,
      sales: saleCount.get(b.id) ?? 0,
      repairs: repairCount.get(b.id) ?? 0,
      mspOn: Boolean(rewardOf.get(b.id)?.on && rewardOf.get(b.id)?.wallet),
    };
  });
  return NextResponse.json({ ok: true, data: { shops } });
}
