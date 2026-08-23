import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { collectReceivable } from "@/services/creditService";
import { todayBusinessDate } from "@/lib/dates";

const schema = z.object({
  amount: z.string().min(1),
  walletId: z.string().min(1),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withAuth("credit.collect", async ({ req, user, params }) => {
  const body = await parseBody(req, schema);
  const payment = await prisma.$transaction(async (tx) =>
    collectReceivable(tx, {
      receivableId: params.id,
      amount: toMinor(body.amount),
      walletId: body.walletId,
      date: body.date ?? todayBusinessDate(),
      notes: body.notes,
      userId: user.id,
      businessId: user.businessId,
    })
  );
  return json(payment, { status: 201 });
});
