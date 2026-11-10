import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tx } from "@/lib/prisma";

const moveStock = vi.fn();
vi.mock("@/services/stockService", () => ({ moveStock: (...a: unknown[]) => moveStock(...a) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/sequence", () => ({ nextNumber: vi.fn().mockResolvedValue("STR-000001") }));

import { cancelStockTransfer, createStockTransfer } from "@/services/stockTransferService";

const branches = [{ id: "A", name: "Main" }, { id: "B", name: "Branch 2" }];

function fakeTx(over: { serial?: Record<string, unknown> | null; tracked?: boolean; trackStock?: boolean; transfer?: Record<string, unknown> } = {}) {
  return {
    branch: { findMany: vi.fn().mockResolvedValue(branches) },
    item: {
      findMany: vi.fn(async (args: { where: { trackSerial?: boolean } }) =>
        args.where.trackSerial ? (over.tracked ? [{ id: "i1" }] : []) : [{ id: "i1", name: "LCD A52", costPrice: 2500000n, trackStock: over.trackStock ?? true }]),
    },
    itemSerial: {
      findUnique: vi.fn().mockResolvedValue(over.serial === undefined ? null : over.serial),
      update: vi.fn(),
    },
    stockTransfer: {
      create: vi.fn().mockResolvedValue({ id: "t1" }),
      findFirst: vi.fn().mockResolvedValue(over.transfer ?? null),
      update: vi.fn(),
    },
    stockTransferLine: { create: vi.fn() },
  };
}

const base = { businessId: "b", userId: "u", fromBranchId: "A", toBranchId: "B", date: "2026-11-10" };

describe("stock transfer between branches", () => {
  beforeEach(() => moveStock.mockReset());

  it("takes stock out of the sender and puts the same into the receiver", async () => {
    const tx = fakeTx();
    const r = await createStockTransfer(tx as unknown as Tx, { ...base, lines: [{ itemId: "i1", quantity: 3 }] });
    expect(r.txnNo).toBe("STR-000001");
    expect(moveStock).toHaveBeenCalledTimes(2);
    expect(moveStock.mock.calls[0][1]).toMatchObject({ branchId: "A", type: "TRANSFER_OUT", quantity: -3, refType: "STOCK_TRANSFER", refId: "t1" });
    expect(moveStock.mock.calls[1][1]).toMatchObject({ branchId: "B", type: "TRANSFER_IN", quantity: 3 });
    expect(tx.stockTransferLine.create).toHaveBeenCalledWith({ data: expect.objectContaining({ quantity: 3, unitCost: 2500000n }) });
  });

  it("refuses the same branch at both ends", async () => {
    await expect(createStockTransfer(fakeTx() as unknown as Tx, { ...base, toBranchId: "A", lines: [{ itemId: "i1", quantity: 1 }] }))
      .rejects.toThrow(/two different branches/);
  });

  it("refuses an item with unlimited quantity", async () => {
    await expect(createStockTransfer(fakeTx({ trackStock: false }) as unknown as Tx, { ...base, lines: [{ itemId: "i1", quantity: 1 }] }))
      .rejects.toThrow(/unlimited/);
  });

  it("moves a tracked phone's IMEI to the receiving branch", async () => {
    const tx = fakeTx({ tracked: true, serial: { id: "s1", itemId: "i1", branchId: "A", status: "IN_STOCK" } });
    await createStockTransfer(tx as unknown as Tx, { ...base, lines: [{ itemId: "i1", quantity: 1, imeis: ["356990112200031"] }] });
    expect(tx.itemSerial.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { branchId: "B" } });
  });

  it("refuses an IMEI that is not on the sending branch's shelf", async () => {
    const tx = fakeTx({ tracked: true, serial: { id: "s1", itemId: "i1", branchId: "B", status: "IN_STOCK" } });
    await expect(createStockTransfer(tx as unknown as Tx, { ...base, lines: [{ itemId: "i1", quantity: 1, imeis: ["356990112200031"] }] }))
      .rejects.toThrow(/not on the shelf/);
  });

  it("cancelling sends the stock back and marks the voucher cancelled", async () => {
    const tx = fakeTx({ transfer: { id: "t1", txnNo: "STR-000001", status: "COMPLETED", fromBranchId: "A", toBranchId: "B", lines: [{ itemId: "i1", quantity: 2, imeis: null }] } });
    await cancelStockTransfer(tx as unknown as Tx, { businessId: "b", userId: "u", id: "t1", reason: "wrong branch" });
    expect(moveStock.mock.calls[0][1]).toMatchObject({ branchId: "B", type: "TRANSFER_OUT", quantity: -2 });
    expect(moveStock.mock.calls[1][1]).toMatchObject({ branchId: "A", type: "TRANSFER_IN", quantity: 2 });
    expect(tx.stockTransfer.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) }));
  });
});
