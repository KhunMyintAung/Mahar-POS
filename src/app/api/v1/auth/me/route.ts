import { withAuth, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { parseModuleAccess } from "@/lib/modules";
import { appEdition, EDITION_COOKIE } from "@/lib/edition";
import { cloudPrintEnabled } from "@/lib/cloudPrint";

export const GET = withAuth(null, async ({ req, user }) => {
  // The shop's own details, so a printed slip can carry them. Anyone signed in already
  // belongs to this business, so there is nothing here they may not see.
  const [business, branches, moduleSetting] = await Promise.all([
    prisma.business.findUnique({
      where: { id: user.businessId },
      select: { name: true, phone: true, address: true, currency: true, timezone: true, logoUrl: true },
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

  // Whether this shop may send phone slips to its counter printer (CLOUD_PRINT_BUSINESS_IDS).
  return json({ user, business, branches, modules, edition: appEdition(req.cookies.get(EDITION_COOKIE)?.value), cloudPrint: cloudPrintEnabled(user.businessId) });
});
