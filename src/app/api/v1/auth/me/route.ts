import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { parseModuleAccess } from "@/lib/modules";
import { appEdition } from "@/lib/edition";
import { loadRewardSettings } from "@/services/mspRewardService";
import { walletBalance } from "@/services/mspWalletService";

export const GET = withAuth(null, async ({ user }) => {
  // The shop's own details, so a printed slip can carry them. Anyone signed in already
  // belongs to this business, so there is nothing here they may not see.
  const [business, branches, moduleSetting, mspRewards, mspBalance] = await Promise.all([
    prisma.business.findUnique({
      where: { id: user.businessId },
      select: { name: true, phone: true, address: true, currency: true, logoUrl: true },
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
    loadRewardSettings(user.businessId),
    walletBalance(prisma, user.businessId),
  ]);

  let modules = parseModuleAccess({ miniMartEnabled: true });
  if (moduleSetting) {
    try {
      modules = parseModuleAccess(JSON.parse(moduleSetting.value));
    } catch {
      modules = parseModuleAccess({ miniMartEnabled: true });
    }
  }

  // The MSP Wallet shows while the shop has MSP switched on, or still holds MSP in it.
  const msp = mspRewards.on || mspBalance > 0n;
  return json({ user, business, branches, modules, msp, edition: appEdition() });
});
