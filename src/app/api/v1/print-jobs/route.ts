import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { cloudPrintEnabled, JOB_TTL_MS, MAX_JOB_HTML } from "@/lib/cloudPrint";

const sendSchema = z.object({
  title: z.string().trim().min(1).max(120),
  html: z.string().min(1).max(MAX_JOB_HTML),
});

/** A phone sends a slip to the shop's counter printer. Anyone signed in to the shop may
 *  print, as they may at the counter; the shop is always the sender's own. */
export const POST = withAuth(null, async ({ req, user }) => {
  if (!cloudPrintEnabled(user.businessId)) throw new ApiError(404, "Not found");
  const body = await parseBody(req, sendSchema);
  await prisma.printJob.deleteMany({
    where: { businessId: user.businessId, createdAt: { lt: new Date(Date.now() - JOB_TTL_MS) } },
  });
  const job = await prisma.printJob.create({
    data: { businessId: user.businessId, userId: user.id, title: body.title, html: body.html },
    select: { id: true, status: true, createdAt: true },
  });
  return json(job, { status: 201 });
});

/** The station's list: the shop's latest jobs, without their slips. */
export const GET = withAuth("settings.manage", async ({ user }) => {
  if (!cloudPrintEnabled(user.businessId)) throw new ApiError(404, "Not found");
  const jobs = await prisma.printJob.findMany({
    where: { businessId: user.businessId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, title: true, status: true, error: true, createdAt: true, printedAt: true, userId: true },
  });
  const users = await prisma.user.findMany({
    where: { businessId: user.businessId, id: { in: [...new Set(jobs.map((j) => j.userId))] } },
    select: { id: true, name: true },
  });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return json(jobs.map(({ userId, ...job }) => ({ ...job, sentBy: names.get(userId) ?? "" })));
});
