import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant";
import { toMinor } from "@/lib/money";
import { BILLER_TYPES, createBiller } from "@/services/billerService";

export const GET = withAuth("biller.view", async ({ req, user }) => {
  const includeOff = req.nextUrl.searchParams.get("all") === "1";
  const billers = await prisma.biller.findMany({
    where: {
      businessId: user.businessId,
      deletedAt: null,
      ...(includeOff ? {} : { active: true }),
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  // What the shop is holding in total, which is the figure an owner checks first.
  const totalFloat = billers.reduce((sum, b) => sum + b.currentBalance, 0n);
  return json({ billers, totalFloat: totalFloat.toString() });
});

const createSchema = z.object({
  branchId: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  type: z.enum(BILLER_TYPES),
  openingBalance: z.string().regex(/^-?\d+(\.\d+)?$/).default("0"),
  notes: z.string().trim().max(300).optional(),
});

export const POST = withAuth("biller.manage", async ({ req, user }) => {
  const body = await parseBody(req, createSchema);

  // Same branch resolution as repair jobs: an owner holds every branch rather than a list,
  // so the branch is looked up when the caller did not name one.
  let branchId = body.branchId;
  if (branchId) {
    await assertBranchAccess(user, branchId);
  } else {
    const branch = await prisma.branch.findFirst({
      where: { businessId: user.businessId, active: true, ...branchScope(user) },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!branch) throw new ApiError(422, "This business has no branch set up yet.");
    branchId = branch.id;
  }

  const biller = await prisma.$transaction((tx) =>
    createBiller(tx, {
      businessId: user.businessId,
      userId: user.id,
      branchId,
      name: body.name,
      type: body.type,
      openingBalance: toMinor(body.openingBalance),
      notes: body.notes,
    })
  );

  return json(biller, { status: 201 });
});
