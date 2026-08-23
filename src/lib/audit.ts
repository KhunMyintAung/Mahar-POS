import { prisma, Tx } from "./prisma";

function safeJson(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val));
}

export async function audit(
  db: Tx | typeof prisma,
  entry: {
    businessId: string;
    userId?: string;
    branchId?: string | null;
    action: string;
    module: string;
    resourceType?: string;
    resourceId?: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
    ip?: string;
    userAgent?: string;
  }
) {
  await db.auditLog.create({
    data: {
      businessId: entry.businessId,
      userId: entry.userId,
      branchId: entry.branchId ?? undefined,
      action: entry.action,
      module: entry.module,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      before: safeJson(entry.before),
      after: safeJson(entry.after),
      reason: entry.reason,
      ip: entry.ip,
      userAgent: entry.userAgent?.slice(0, 300),
    },
  });
}
