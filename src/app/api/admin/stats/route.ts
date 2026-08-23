import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

/** The counts are public; the lists are not.
 *
 *  How many accounts exist is a fact about this service and gives nothing away about
 *  anyone. Who they are does: the user list and the activity feed carry other businesses'
 *  names, their staff's names and usernames, and what those people did and when. That is
 *  231 third parties' data, and the privacy policy this service publishes says it is not
 *  shared. So the panel opens straight away with the figures, and fills in the detail for
 *  an admin who is signed in.
 */
export async function GET() {
  const detailed = await isAdminRequest();
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const [
      registeredAccounts,
      registeredUsers,
      enabledUsers,
      activeSessions,
      registeredToday,
      registrationAuditRecords,
      users,
      activityLogs,
    ] = await Promise.all([
      prisma.business.count(),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { active: true, deletedAt: null } }),
      prisma.authSession.findMany({
        where: {
          revokedAt: null,
          expiresAt: { gt: now },
          user: { active: true, deletedAt: null },
        },
        distinct: ["userId"],
        select: { userId: true },
      }),
      prisma.user.count({ where: { createdAt: { gte: today }, deletedAt: null } }),
      prisma.auditLog.count({ where: { action: "REGISTER", module: "auth" } }),
      detailed ? prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          id: true,
          name: true,
          username: true,
          active: true,
          createdAt: true,
          business: { select: { name: true } },
          sessions: {
            where: { revokedAt: null, expiresAt: { gt: now } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true, expiresAt: true },
          },
        },
      }) : Promise.resolve([]),
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          id: true,
          businessId: true,
          action: true,
          module: true,
          resourceType: true,
          reason: true,
          createdAt: true,
          user: {
            select: {
              name: true,
              username: true,
            },
          },
        },
      }),
    ]);

    const activityBusinessIds = detailed ? [...new Set(activityLogs.map((log) => log.businessId))] : [];
    const activityBusinesses = await prisma.business.findMany({
      where: { id: { in: activityBusinessIds } },
      select: { id: true, name: true },
    });
    const activityBusinessNames = new Map(activityBusinesses.map((business) => [business.id, business.name]));

    return NextResponse.json(
      {
        ok: true,
        data: {
          registeredAccounts,
          registeredUsers,
          enabledUsers,
          activeUsers: activeSessions.length,
          registeredToday,
          registrationAuditRecords,
          detailed,
          users: users.map((user) => ({
            id: user.id,
            name: user.name,
            username: user.username,
            businessName: user.business.name,
            active: user.active,
            registeredToday: user.createdAt >= today,
            hasValidSession: user.sessions.length > 0,
            lastSessionAt: user.sessions[0]?.createdAt ?? null,
            createdAt: user.createdAt,
          })),
          // What happened is public; who it happened to is not. Without a signed-in
          // admin the names are simply never put in the response — not hidden by the
          // page, which would still have shipped them to the browser.
          activityLogs: activityLogs.map((log) => ({
            id: log.id,
            businessName: detailed ? (activityBusinessNames.get(log.businessId) ?? "Unknown business") : null,
            userDisplayName: detailed ? (log.user?.name ?? "System") : null,
            username: detailed ? (log.user?.username ?? "system") : null,
            action: log.action,
            module: log.module,
            resourceType: log.resourceType,
            // Free text a person typed; it can name anyone or anything.
            reason: detailed ? log.reason : null,
            createdAt: log.createdAt,
          })),
          updatedAt: now.toISOString(),
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Statistics are temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
