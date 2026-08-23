import { describe, expect, it, vi } from "vitest";
import { postLedger, reverseLedgerEntries, reverseTransfer } from "../src/services/walletService";
import { moveStock } from "../src/services/stockService";
import { reverseIncomeExpense } from "../src/services/incomeExpenseService";
import type { Tx } from "../src/lib/prisma";

describe("tenant isolation", () => {
  it("rejects a wallet owned by another business", async () => {
    const tx = {
      wallet: {
        findUnique: vi.fn().mockResolvedValue({
          id: "wallet-b",
          businessId: "business-b",
          deletedAt: null,
          active: true,
        }),
      },
    } as unknown as Tx;

    await expect(postLedger(tx, {
      businessId: "business-a",
      walletId: "wallet-b",
      direction: "DEBIT",
      amount: 100n,
      refType: "TEST",
      createdById: "user-a",
    })).rejects.toThrow("Wallet not found");
  });

  it("rejects a branch owned by another business before moving stock", async () => {
    const tx = {
      item: {
        findUnique: vi.fn().mockResolvedValue({
          id: "item-a",
          businessId: "business-a",
          deletedAt: null,
          active: true,
          name: "Item A",
        }),
      },
      branch: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as Tx;

    await expect(moveStock(tx, {
      businessId: "business-a",
      itemId: "item-a",
      branchId: "branch-b",
      type: "ADJUSTMENT",
      quantity: 1,
      createdById: "user-a",
    })).rejects.toThrow("Branch not found");
  });

  it("scopes ledger reversals to the current business", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const tx = { walletLedgerEntry: { findMany } } as unknown as Tx;

    await reverseLedgerEntries(tx, "business-a", "TEST", "record-a", "user-a", "test");
    expect(findMany).toHaveBeenCalledWith({
      where: { businessId: "business-a", refType: "TEST", refId: "record-a" },
    });
  });

  it("rejects reversing a transfer owned by another business", async () => {
    const tx = {
      walletTransfer: {
        findUnique: vi.fn().mockResolvedValue({
          id: "transfer-b",
          businessId: "business-b",
          status: "COMPLETED",
        }),
      },
    } as unknown as Tx;

    await expect(reverseTransfer(tx, {
      transferId: "transfer-b",
      reason: "test",
      userId: "user-a",
      businessId: "business-a",
    })).rejects.toThrow("Transfer not found");
  });

  it("rejects reversing an income/expense entry owned by another business", async () => {
    const tx = {
      incomeExpense: {
        findUnique: vi.fn().mockResolvedValue({
          id: "ie-b",
          businessId: "business-b",
          status: "COMPLETED",
          deletedAt: null,
        }),
      },
    } as unknown as Tx;

    await expect(reverseIncomeExpense(tx, {
      id: "ie-b",
      reason: "test",
      userId: "user-a",
      businessId: "business-a",
    })).rejects.toThrow("Record not found");
  });
});
