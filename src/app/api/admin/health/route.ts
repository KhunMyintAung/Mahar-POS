import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { adminPasscode, adminUsers, isAdminRequest } from "@/lib/adminAccess";
import { googleClientId } from "@/lib/googleAuth";
import { mailEnabled } from "@/lib/mail";

export const dynamic = "force-dynamic";

/** How the service is doing: database, server, which integrations are set up. Admin only.
 *  Reports whether settings exist, never their values. */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const started = Date.now();
  let dbOk = true;
  let dbSize: string | null = null;
  try {
    const rows = await prisma.$queryRaw<{ size: string }[]>`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`;
    dbSize = rows[0]?.size ?? null;
  } catch {
    dbOk = false;
  }
  const dbMs = Date.now() - started;
  let release = "dev";
  try { release = readFileSync(join(process.cwd(), "RELEASE"), "utf8").trim(); } catch { /* not a deployed build */ }
  const [businesses, users, items, sales, repairs, sessions, telegramBots, sheetBackups, emails24h] = await Promise.all([
    prisma.business.count(),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.item.count({ where: { deletedAt: null } }),
    prisma.sale.count({ where: { deletedAt: null } }),
    prisma.repairJob.count({ where: { deletedAt: null } }),
    prisma.authSession.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.systemSetting.count({ where: { key: "telegram_reports", value: { contains: '"enabled":true' } } }),
    prisma.systemSetting.count({ where: { key: "gsheet_backup", value: { contains: '"url":"https' } } }),
    prisma.emailLog.count({ where: { createdAt: { gte: new Date(Date.now() - 86400_000) } } }),
  ]);
  const mem = process.memoryUsage();
  return NextResponse.json({
    ok: true,
    data: {
      release,
      node: process.version,
      uptimeHours: Math.round((process.uptime() / 3600) * 10) / 10,
      memoryMb: Math.round(mem.rss / 1048576),
      db: { ok: dbOk, ms: dbMs, size: dbSize },
      totals: { businesses, users, items, sales, repairs, sessions },
      integrations: {
        googleLogin: Boolean(googleClientId()),
        email: mailEnabled(),
        emailsLast24h: emails24h,
        adminUsers: adminUsers().length,
        adminPasscode: Boolean(adminPasscode()),
        telegramReportBots: telegramBots,
        googleSheetBackups: sheetBackups,
      },
      time: new Date().toISOString(),
    },
  });
}
