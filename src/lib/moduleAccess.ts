import { prisma } from "@/lib/prisma";
import { parseModuleAccess, type ModuleAccess } from "@/lib/modules";

/** The shop's stored menu switches and type. A missing or unreadable setting reads the way
 *  /auth/me reads it, so the server and the screen agree. */
export async function loadModuleAccess(businessId: string): Promise<ModuleAccess> {
  const row = await prisma.systemSetting.findUnique({
    where: { businessId_key: { businessId, key: "modules" } },
    select: { value: true },
  });
  try {
    if (row) return parseModuleAccess(JSON.parse(row.value));
  } catch {
    // Unreadable: fall through to the defaults.
  }
  return parseModuleAccess({ miniMartEnabled: true });
}
