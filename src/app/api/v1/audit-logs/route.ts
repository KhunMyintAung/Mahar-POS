import { withAuth, json, pagination } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = withAuth("audit.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const { skip, take, page, pageSize } = pagination(req, 50);
  const where = {
    businessId: user.businessId,
    ...(sp.get("module") ? { module: sp.get("module")! } : {}),
    ...(sp.get("action") ? { action: sp.get("action")! } : {}),
    ...(sp.get("userId") ? { userId: sp.get("userId")! } : {}),
  };
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, username: true } } },
      skip, take,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return json({ logs, total, page, pageSize });
});
