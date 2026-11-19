import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { gateProFeatures, parseModuleAccess } from "@/lib/modules";
import { planOf, proDaysLeft, tierOf, PRO_PRICE_MMK, TIER_PRICE_MMK, TERM_SAVING_MMK, TIER_PRICE_THB, TERM_SAVING_THB } from "@/lib/plan";
import { proPayInfo } from "@/lib/proPay";
import { appEdition, EDITION_COOKIE } from "@/lib/edition";
import { cloudPrintEnabled } from "@/lib/cloudPrint";

export const GET = withAuth(null, async ({ req, user }) => {
  // The shop's own details, so a printed slip can carry them. Anyone signed in already
  // belongs to this business, so there is nothing here they may not see.
  const [business, branches, moduleSetting] = await Promise.all([
    prisma.business.findUnique({
      where: { id: user.businessId },
      select: { name: true, phone: true, address: true, city: true, currency: true, timezone: true, logoUrl: true, proUntil: true, proTier: true },
    }),
    prisma.branch.findMany({
      where: {
        businessId: user.businessId,
        active: true,
        ...(user.allBranches ? {} : { id: { in: user.branchIds } }),
      },
      select: { id: true, name: true, code: true },
    }),
    prisma.systemSetting.findUnique({
      where: { businessId_key: { businessId: user.businessId, key: "modules" } },
      select: { value: true },
    }),
  ]);

  let modules = parseModuleAccess({ miniMartEnabled: true });
  if (moduleSetting) {
    try {
      modules = parseModuleAccess(JSON.parse(moduleSetting.value));
    } catch {
      modules = parseModuleAccess({ miniMartEnabled: true });
    }
  }

  // Freemium: Pro while proUntil is in the future (a paid period or the free trial). On Free,
  // the Pro-only features are turned off so the app hides them.
  const planName = planOf(business?.proUntil);
  const plan = {
    plan: planName,
    proUntil: business?.proUntil ?? null,
    daysLeft: proDaysLeft(business?.proUntil),
    priceMMK: PRO_PRICE_MMK,
    // The paid level the shop is on (Pro unless it bought Fully Access), and the price list.
    tier: tierOf(business?.proTier),
    tierPriceMMK: TIER_PRICE_MMK,
    termSavingMMK: TERM_SAVING_MMK,
    // Thai shops pay in baht on their own price list.
    tierPriceTHB: TIER_PRICE_THB,
    termSavingTHB: TERM_SAVING_THB,
    // The operator's KBZ Pay account and PromptPay code the shop pays into, from the server (never
    // hardcoded). Empty name/phone means the operator has not set it up yet; the screen says so.
    pay: proPayInfo(),
  };
  modules = { ...modules, features: gateProFeatures(modules.features, planName === "PRO") };

  // Whether this shop may send phone slips to its counter printer (CLOUD_PRINT_BUSINESS_IDS).
  return json({ user, business, branches, modules, plan, edition: appEdition(req.cookies.get(EDITION_COOKIE)?.value), cloudPrint: cloudPrintEnabled(user.businessId) });
});
