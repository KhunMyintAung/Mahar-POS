import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tx } from "@/lib/prisma";

const moveStock = vi.fn();
const receiveSerials = vi.fn();
const removeSerials = vi.fn();
vi.mock("@/services/stockService", () => ({ moveStock: (...a: unknown[]) => moveStock(...a) }));
vi.mock("@/services/serialService", async (orig) => ({
  ...(await orig<typeof import("@/services/serialService")>()),
  receiveSerials: (...a: unknown[]) => receiveSerials(...a),
  removeSerials: (...a: unknown[]) => removeSerials(...a),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/sequence", () => ({ nextNumber: vi.fn().mockResolvedValue("STC-000001") }));

import { completeStockCount, saveCountEntries, startStockCount } from "@/services/stockCountService";

const count = { id: "c1", txnNo: "STC-000001", status: "OPEN", branchId: "A", businessId: "b" };

interface FakeLine { id: string; itemId: string; countedQty: number | null; countedImeis?: string | null; item: Record<string, unknown> }

function fakeTx(opts: { lines?: FakeLine[]; books?: Record<string, number>; held?: string[]; heldElsewhere?: Record<string, unknown> | null; open?: Record<string, unknown> | null } = {}) {
  return {
    branch: { findFirst: vi.fn().mockResolvedValue({ id: "A", name: "Main" }) },
    itemCategory: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    item: {
      findMany: vi.fn().mockResolvedValue([
        { id: "glass", stockLevels: [{ quantity: 5 }] },
        { id: "case", stockLevels: [] },
      ]),
    },
    stockCount: {
      findFirst: vi.fn(async (args: { where: { status?: string; id?: string } }) => (args.where.id ? count : opts.open ?? null)),
      create: vi.fn().mockResolvedValue({ id: "c1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(),
    },
    stockCountLine: {
      createMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue(opts.lines ?? []),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    stockLevel: { findUnique: vi.fn(async (a: { where: { itemId_branchId: { itemId: string } } }) => ({ quantity: opts.books?.[a.where.itemId_branchId.itemId] ?? 0 })) },
    itemSerial: {
      findMany: vi.fn().mockResolvedValue((opts.held ?? []).map((imei) => ({ imei }))),
      findFirst: vi.fn().mockResolvedValue(opts.heldElsewhere ?? null),
    },
  };
}

const plain = (id: string, name: string) => ({ id, name, costPrice: 1000n, trackSerial: false, active: true, deletedAt: null });

describe("stock count", () => {
  beforeEach(() => { moveStock.mockReset(); receiveSerials.mockReset(); removeSerials.mockReset(); });

  it("starts with every item the books hold, including ones at 0", async () => {
    const tx = fakeTx();
    const r = await startStockCount(tx as unknown as Tx, { businessId: "b", userId: "u", branchId: "A" });
    expect(r.txnNo).toBe("STC-000001");
    expect(tx.stockCountLine.createMany).toHaveBeenCalledWith({
      data: [{ countId: "c1", itemId: "glass", expectedQty: 5 }, { countId: "c1", itemId: "case", expectedQty: 0 }],
    });
  });

  it("refuses a second open count for the same branch", async () => {
    const tx = fakeTx({ open: { txnNo: "STC-000009" } });
    await expect(startStockCount(tx as unknown as Tx, { businessId: "b", userId: "u", branchId: "A" })).rejects.toThrow(/STC-000009 is still open/);
  });

  it("corrects each counted item against the books as they stand now, and skips uncounted ones", async () => {
    const tx = fakeTx({
      // A sale while counting took the books from 5 to 4; 3 were found, so 1 is short — not 2.
      lines: [
        { id: "l1", itemId: "glass", countedQty: 3, item: plain("glass", "Glass") },
        { id: "l2", itemId: "case", countedQty: 2, item: plain("case", "Case") },
      ],
      books: { glass: 4, case: 2 },
    });
    const r = await completeStockCount(tx as unknown as Tx, { businessId: "b", userId: "u", id: "c1" });
    expect(moveStock).toHaveBeenCalledTimes(1);
    expect(moveStock.mock.calls[0][1]).toMatchObject({ itemId: "glass", quantity: -1, type: "STOCK_COUNT", refType: "STOCK_COUNT", refId: "c1" });
    expect(r).toMatchObject({ short: 1, over: 0, shortValue: 1000n, counted: 2 });
    expect(tx.stockCountLine.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { expectedQty: 4, adjustment: -1, unitCost: 1000n } });
    // Only counted lines are read; the query leaves the others alone.
    expect(tx.stockCountLine.findMany.mock.calls[0][0].where).toMatchObject({ countedQty: { not: null } });
  });

  it("takes out phones not found and puts in ones found but not in the books", async () => {
    const tx = fakeTx({
      lines: [{ id: "l1", itemId: "ip13", countedQty: 2, countedImeis: "111111111111111,333333333333333", item: { ...plain("ip13", "iPhone 13"), trackSerial: true } }],
      books: { ip13: 2 },
      held: ["111111111111111", "222222222222222"],
    });
    await completeStockCount(tx as unknown as Tx, { businessId: "b", userId: "u", id: "c1" });
    expect(removeSerials.mock.calls[0][1]).toMatchObject({ imeis: ["222222222222222"] });
    expect(receiveSerials.mock.calls[0][1]).toMatchObject({ imeis: ["333333333333333"] });
    expect(moveStock).not.toHaveBeenCalled(); // 2 counted, 2 in the books
  });

  it("refuses a found phone the shop holds as another item", async () => {
    const tx = fakeTx({
      lines: [{ id: "l1", itemId: "ip13", countedQty: 1, countedImeis: "333333333333333", item: { ...plain("ip13", "iPhone 13"), trackSerial: true } }],
      books: { ip13: 0 },
      heldElsewhere: { imei: "333333333333333", branchId: "A", item: { name: "iPhone 12" } },
    });
    await expect(completeStockCount(tx as unknown as Tx, { businessId: "b", userId: "u", id: "c1" })).rejects.toThrow(/in stock as iPhone 12/);
  });

  it("refuses to finish twice", async () => {
    const tx = fakeTx({ lines: [] });
    tx.stockCount.updateMany.mockResolvedValue({ count: 0 });
    await expect(completeStockCount(tx as unknown as Tx, { businessId: "b", userId: "u", id: "c1" })).rejects.toThrow(/already finished/);
  });

  it("saves an IMEI phone's count as the number of phones found", async () => {
    const tx = fakeTx();
    tx.stockCountLine.findMany.mockResolvedValue([{ id: "l1", itemId: "ip13", item: { name: "iPhone 13", trackSerial: true } }]);
    await saveCountEntries(tx as unknown as Tx, { businessId: "b", id: "c1", entries: [{ itemId: "ip13", countedQty: 0, imeis: ["111 111 111 111 111", "222222222222222"] }] });
    expect(tx.stockCountLine.update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: expect.objectContaining({ countedQty: 2, countedImeis: "111111111111111,222222222222222" }),
    });
  });
});
