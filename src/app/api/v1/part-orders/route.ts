import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { autoCorrectName } from "@/lib/autoCorrect";

/** The order list: parts customers asked the shop to get. ?done=1 lists the handed-over
 *  ones; otherwise those still to get or to hand over, oldest first, so nothing waits long. */
export const GET = withAuth("repair.view", async ({ req, user }) => {
  // ?count=1: just how many are open, for the tab's badge.
  if (req.nextUrl.searchParams.get("count") === "1") {
    return json({ open: await prisma.partOrder.count({ where: { businessId: user.businessId, status: { in: ["WAITING", "GOT"] } } }) });
  }
  const done = req.nextUrl.searchParams.get("done") === "1";
  const [orders, open] = await Promise.all([
    prisma.partOrder.findMany({
      where: { businessId: user.businessId, status: done ? "DONE" : { in: ["WAITING", "GOT"] } },
      orderBy: { createdAt: done ? "desc" : "asc" },
      take: done ? 100 : 500,
    }),
    prisma.partOrder.count({ where: { businessId: user.businessId, status: { in: ["WAITING", "GOT"] } } }),
  ]);
  return json({ orders, open });
});

const line = z.object({
  item: z.string().trim().min(1).max(200).transform(autoCorrectName),
  quantity: z.number().int().min(1).max(999).default(1),
});

/** One order, or a whole pasted list at once ("Vivo Y17s TL 3" per line, read in the browser):
 *  every line its own order, sharing the customer, deposit and note given. */
const schema = z.object({
  lines: z.array(line).min(1, "What to order?").max(100),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  deposit: z.string().regex(/^\d+(\.\d+)?$/).default("0"),
  note: z.string().trim().max(1000).optional(),
});

export const POST = withAuth("repair.create", async ({ req, user }) => {
  const body = await parseBody(req, schema);
  const shared = {
    businessId: user.businessId, createdById: user.id,
    customerName: body.customerName || null, customerPhone: body.customerPhone || null, note: body.note || null,
  };
  const deposit = toMinor(body.deposit);
  // One after another, so the list keeps the pasted order (oldest first).
  const created = [];
  for (const [i, l] of body.lines.entries()) {
    created.push(await prisma.partOrder.create({
      // A deposit is for the customer's order as a whole: it goes on the first line only.
      data: { ...shared, item: l.item, quantity: l.quantity, deposit: i === 0 ? deposit : 0n },
    }));
  }
  return json({ created: created.length }, { status: 201 });
});
