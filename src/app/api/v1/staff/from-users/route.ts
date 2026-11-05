import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

/** Users (Users & Roles) not yet on the staff list: GET lists them, POST adds them all, each
 *  linked to their login, with their role as the position and salary still to fill in. */
async function missing(businessId: string) {
  const [users, staff] = await Promise.all([
    prisma.user.findMany({
      where: { businessId, deletedAt: null, active: true },
      select: { id: true, name: true, phone: true, role: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.staff.findMany({ where: { businessId }, select: { userId: true, name: true } }),
  ]);
  const linked = new Set(staff.map((s) => s.userId).filter(Boolean));
  const names = new Set(staff.map((s) => s.name.trim().toLowerCase()));
  return users.filter((u) => !linked.has(u.id) && !names.has(u.name.trim().toLowerCase()));
}

export const GET = withAuth("users.manage", async ({ user }) => json(await missing(user.businessId)));

export const POST = withAuth("users.manage", async ({ user }) => {
  const list = await missing(user.businessId);
  if (list.length) {
    await prisma.staff.createMany({
      data: list.map((u) => ({ businessId: user.businessId, name: u.name, phone: u.phone, position: u.role?.name ?? null, userId: u.id })),
    });
    await audit(prisma, {
      businessId: user.businessId, userId: user.id, action: "CREATE", module: "staff", resourceType: "Staff",
      after: { fromUsers: list.map((u) => u.name) },
    });
  }
  return json({ added: list.length });
});
