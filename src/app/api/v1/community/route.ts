import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { loadDonations, topDonations } from "@/lib/community";
import { notifyFeedback } from "@/lib/mail";

/** What the About page shows every shop: the top donations, and the feedback the admin has
 *  chosen to show. */
export const GET = withAuth(null, async () => {
  const [donations, feedback] = await Promise.all([
    loadDonations(),
    prisma.feedback.findMany({
      where: { shown: true },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, shopName: true, userName: true, rating: true, message: true, createdAt: true },
    }),
  ]);
  return json({ donations: topDonations(donations).slice(0, 10), feedback });
});

const schema = z.object({
  rating: z.number().int().min(1).max(5).nullable().optional(),
  message: z.string().trim().min(3, "Write a few words").max(1000),
});

/** A shop sends feedback. It reaches the admin portal (and the admin's email), and shows on
 *  the About page only once the admin picks it. */
export const POST = withAuth(null, async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const since = new Date(Date.now() - 24 * 3600_000);
  const today = await prisma.feedback.count({ where: { userId: user.id, createdAt: { gte: since } } });
  if (today >= 5) throw new ApiError(429, "Thanks! You have sent a lot today, please try again tomorrow.");
  const business = await prisma.business.findUnique({ where: { id: user.businessId }, select: { name: true } });
  const row = await prisma.feedback.create({
    data: {
      businessId: user.businessId, userId: user.id,
      shopName: business?.name ?? "", userName: user.name,
      rating: body.rating ?? null, message: body.message,
    },
  });
  notifyFeedback({ shopName: row.shopName, userName: row.userName, rating: row.rating, message: row.message });
  return json({ id: row.id }, { status: 201 });
});
