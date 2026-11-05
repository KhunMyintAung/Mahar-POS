import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { cardCountKey } from "@/lib/billerCards";

const schema = z.object({ counts: z.record(z.string().regex(/^\d+$/), z.number().int().min(0).max(100000)) });

/** Sets the cards a biller has on hand now, after counting them; cards bought and sold from
 *  here on are added and taken off. Money and float balance are not touched. */
export const PUT = withAuth("biller.manage", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const biller = await prisma.biller.findFirst({ where: { id: params.id, businessId: user.businessId }, select: { id: true, name: true } });
  if (!biller) throw new ApiError(404, "Biller not found");
  const counts = Object.fromEntries(Object.entries(body.counts).filter(([, n]) => n > 0));
  const value = JSON.stringify({ counts, at: new Date().toISOString() });
  const key = cardCountKey(biller.id);
  await prisma.systemSetting.upsert({
    where: { businessId_key: { businessId: user.businessId, key } },
    create: { businessId: user.businessId, key, value },
    update: { value },
  });
  await audit(prisma, { businessId: user.businessId, userId: user.id, action: "UPDATE", module: "biller", resourceType: "Biller", resourceId: biller.id, after: { cardsCounted: counts } });
  return json({ counts });
});
