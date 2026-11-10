import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { CURRENCIES } from "@/lib/currency";
import { booksAreEmpty, businessCurrency } from "@/services/currencyService";

/** The shop's main currency, and whether it may still change (only while the books are empty). */
export const GET = withAuth(null, async ({ user }) =>
  json({ currency: await businessCurrency(user.businessId), canChange: await booksAreEmpty(user.businessId) }));

const schema = z.object({ currency: z.enum(CURRENCIES) });

/** Changes the main currency of a shop with nothing recorded yet. Its wallets in the old
 *  currency (the starting cash wallet) move to the new one, renamed to match. Owner only. */
export const PUT = withAuth("settings.manage", async ({ req, user }) => {
  const { currency } = await parseBody(req, schema);
  const from = await businessCurrency(user.businessId);
  if (from === currency) return json({ currency, canChange: true });
  if (!(await booksAreEmpty(user.businessId))) {
    throw new ApiError(422, "The main currency cannot change once money has been recorded");
  }
  await prisma.$transaction(async (tx) => {
    await tx.business.update({ where: { id: user.businessId }, data: { currency } });
    const wallets = await tx.wallet.findMany({ where: { businessId: user.businessId, currency: from }, select: { id: true, name: true, code: true } });
    for (const w of wallets) {
      await tx.wallet.update({
        where: { id: w.id },
        data: { currency, name: w.name.replace(from, currency), code: w.code.replace(from, currency) },
      });
    }
    await audit(tx, {
      businessId: user.businessId, userId: user.id, action: "UPDATE", module: "settings",
      resourceType: "Business", resourceId: user.businessId, before: { currency: from }, after: { currency },
    });
  });
  return json({ currency, canChange: true });
});
