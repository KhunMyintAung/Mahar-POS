import { z } from "zod";
import { withAuth, json, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/money";
import { autoCorrectName } from "@/lib/autoCorrect";

const OPEN = ["TODO", "ORDERED"];

/** The order list: parts still to order, and those ordered and awaited, oldest first so
 *  nothing waits long. ?done=1 lists the received ones instead. Also the suppliers used
 *  before, to pick from when sending. */
export const GET = withAuth("repair.view", async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const businessId = user.businessId;
  // ?count=1: just how many are open, for the tab's badge.
  if (sp.get("count") === "1") {
    return json({ open: await prisma.partOrder.count({ where: { businessId, status: { in: OPEN } } }) });
  }
  const done = sp.get("done") === "1";
  const [orders, open, suppliers] = await Promise.all([
    prisma.partOrder.findMany({
      where: { businessId, status: done ? "RECEIVED" : { in: OPEN } },
      orderBy: done ? { updatedAt: "desc" } : { createdAt: "asc" },
      take: done ? 200 : 500,
    }),
    prisma.partOrder.count({ where: { businessId, status: { in: OPEN } } }),
    prisma.partOrder.groupBy({ by: ["supplier"], where: { businessId, supplier: { not: null } }, _max: { orderedAt: true } }),
  ]);
  const recent = suppliers
    .filter((s): s is typeof s & { supplier: string } => Boolean(s.supplier))
    .sort((a, b) => (b._max.orderedAt?.getTime() ?? 0) - (a._max.orderedAt?.getTime() ?? 0))
    .map((s) => s.supplier)
    .slice(0, 20);
  return json({ orders, open, suppliers: recent });
});

const line = z.object({
  item: z.string().trim().min(1).max(200).transform(autoCorrectName),
  quantity: z.number().int().min(1).max(999).default(1),
});

/** One part, or a whole pasted list at once ("Vivo Y17s TL 3" per line, read in the browser):
 *  every line its own part to order, sharing the customer, deposit and note given. */
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
  let created = 0;
  for (const [i, l] of body.lines.entries()) {
    // A deposit is for the customer's order as a whole: it goes on the first line only.
    await prisma.partOrder.create({ data: { ...shared, item: l.item, quantity: l.quantity, deposit: i === 0 ? deposit : 0n } });
    created++;
  }
  return json({ created }, { status: 201 });
});
