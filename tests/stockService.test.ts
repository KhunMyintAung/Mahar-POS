import { describe, expect, it, vi } from "vitest";
import type { Tx } from "@/lib/prisma";
import { moveStock } from "@/services/stockService";

const opts = { businessId: "b", itemId: "i", branchId: "br", type: "SALE", quantity: -3, createdById: "u" };

function fakeTx(item: Record<string, unknown>, onShelf = 1) {
  return {
    item: { findUnique: vi.fn().mockResolvedValue({ id: "i", businessId: "b", name: "Fee", active: true, deletedAt: null, ...item }) },
    branch: { findFirst: vi.fn().mockResolvedValue({ id: "br" }) },
    stockLevel: {
      upsert: vi.fn().mockResolvedValue({ id: "l" }),
      update: vi.fn().mockResolvedValue({ quantity: onShelf - 3 }),
    },
    stockMovement: { create: vi.fn().mockResolvedValue({ id: "m" }) },
  };
}

describe("moveStock and unlimited quantity", () => {
  it("moves nothing for an item with no stock count, however many are sold", async () => {
    const tx = fakeTx({ trackStock: false });
    const out = await moveStock(tx as unknown as Tx, opts);
    expect(out.movement).toBeNull();
    expect(tx.stockLevel.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("still refuses to oversell a counted item", async () => {
    const tx = fakeTx({ trackStock: true });
    await expect(moveStock(tx as unknown as Tx, opts)).rejects.toThrow(/Insufficient stock/);
  });
});
