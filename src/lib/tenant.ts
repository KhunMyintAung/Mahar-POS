import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { DEFAULT_ROLES } from "@/lib/permissions";
import { addItemCategoryPresets, itemCategoryPresets } from "@/lib/itemCategoryPresets";
import type { AuthUser } from "@/lib/auth";
import {
  moduleSetting,
  moduleSettingForCategory,
  type BusinessCategory,
  type ModuleMode,
} from "@/lib/modules";

export interface TenantRegistration {
  businessName: string;
  ownerName?: string;
  username: string;
  email: string;
  phone?: string;
  password: string;
  currency: "MMK" | "THB";
  timezone: string;
  businessCategory?: BusinessCategory;
  moduleMode?: ModuleMode;
}

export async function assertBranchAccess(user: AuthUser, branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      businessId: user.businessId,
      active: true,
    },
    select: { id: true },
  });
  if (!branch) throw new ApiError(404, "Branch not found");
  if (!user.allBranches && !user.branchIds.includes(branchId)) {
    throw new ApiError(403, "No access to this branch");
  }
}

export async function registerTenant(input: TenantRegistration) {
  const username = input.username.toLowerCase();
  const email = input.email.toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    return await prisma.$transaction(async (tx) => {
      const duplicate = await tx.user.findFirst({
        where: {
          OR: [
            { username },
            { email: username },
            { username: email },
            { email },
          ],
        },
        select: { username: true, email: true },
      });
      if (duplicate) throw new ApiError(409, "Username or email is already registered");

      const business = await tx.business.create({
        data: {
          name: input.businessName,
          phone: input.phone,
          currency: input.currency,
          timezone: input.timezone,
        },
      });
      const branch = await tx.branch.create({
        data: {
          businessId: business.id,
          name: "Main Branch",
          code: "MAIN",
          phone: input.phone,
        },
      });

      const roles = new Map<string, string>();
      for (const role of DEFAULT_ROLES) {
        const created = await tx.role.create({
          data: {
            businessId: business.id,
            name: role.name,
            description: role.description,
            permissions: JSON.stringify(role.permissions),
            isSystem: true,
          },
        });
        roles.set(role.name, created.id);
      }

      const ownerRoleId = roles.get("Owner");
      if (!ownerRoleId) throw new Error("Owner role was not created");
      const owner = await tx.user.create({
        data: {
          businessId: business.id,
          name: input.ownerName?.trim() || username,
          username,
          email,
          phone: input.phone,
          passwordHash,
          roleId: ownerRoleId,
          allBranches: true,
        },
      });

      await tx.wallet.create({
        data: {
          businessId: business.id,
          branchId: branch.id,
          name: `Main ${input.currency} Cash`,
          code: `${input.currency}-CASH`,
          type: "CASH",
          currency: input.currency,
        },
      });
      await tx.unit.createMany({
        data: [
          { businessId: business.id, name: "pcs" },
          { businessId: business.id, name: "box" },
        ],
      });
      // A phone shop opens its item list with phone shop categories ready to pick.
      await addItemCategoryPresets(tx, business.id, itemCategoryPresets(input.businessCategory));
      await tx.category.createMany({
        data: [
          { businessId: business.id, type: "INCOME", name: "Other Income" },
          { businessId: business.id, type: "EXPENSE", name: "Salary" },
          { businessId: business.id, type: "EXPENSE", name: "Rent" },
          { businessId: business.id, type: "EXPENSE", name: "Utilities" },
          { businessId: business.id, type: "EXPENSE", name: "Other Expense" },
        ],
      });
      await tx.systemSetting.create({
        data: {
          businessId: business.id,
          key: "modules",
          value: JSON.stringify(
            input.businessCategory
              ? moduleSettingForCategory(input.businessCategory)
              : moduleSetting(input.moduleMode ?? "WALLET_ONLY")
          ),
        },
      });
      await tx.auditLog.create({
        data: {
          businessId: business.id,
          userId: owner.id,
          branchId: branch.id,
          action: "REGISTER",
          module: "auth",
          resourceType: "Business",
          resourceId: business.id,
          after: JSON.stringify({
            businessName: business.name,
            username,
            businessCategory: input.businessCategory ?? "LEGACY",
          }),
        },
      });

      return { business, branch, owner };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "Username or email is already registered");
    }
    throw error;
  }
}
