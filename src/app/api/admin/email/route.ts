import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/adminAccess";
import { mailEnabled } from "@/lib/mail";
import { audienceEmails, resendDomains } from "@/lib/emailAdmin";

export const dynamic = "force-dynamic";

const deny = () => NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });

/** Everything the Email tab shows: setup, counts, the log (paged, searchable) and the
 *  broadcasts. Admin only. ?page=&q=&kind=&status= */
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) return deny();
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = 25;
  const q = (sp.get("q") ?? "").trim();
  const kind = sp.get("kind") ?? "";
  const status = sp.get("status") ?? "";
  const where = {
    ...(q ? { OR: [{ to: { contains: q, mode: "insensitive" as const } }, { subject: { contains: q, mode: "insensitive" as const } }] } : {}),
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
  };
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const [domains, items, total, today, week, byStatus, broadcasts, owners, users] = await Promise.all([
    resendDomains(),
    prisma.emailLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.emailLog.count({ where }),
    prisma.emailLog.count({ where: { createdAt: { gte: dayStart } } }),
    prisma.emailLog.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.emailLog.groupBy({ by: ["status"], where: { createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } }, _count: true }),
    prisma.emailBroadcast.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    audienceEmails("owners"),
    audienceEmails("users"),
  ]);
  return NextResponse.json({
    ok: true,
    data: {
      configured: mailEnabled(),
      from: process.env.RESEND_FROM ?? null,
      domains,
      counts: { today, week, last30: Object.fromEntries(byStatus.map((s) => [s.status, s._count])) },
      audiences: { owners: owners.length, users: users.length },
      logs: { items, total, page, pageSize },
      broadcasts,
    },
  });
}
