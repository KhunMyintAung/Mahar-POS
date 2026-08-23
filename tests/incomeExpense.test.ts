import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  nextNumber: vi.fn(),
  postLedger: vi.fn(),
  assertDateOpen: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/sequence", () => ({ nextNumber: mocks.nextNumber }));
vi.mock("@/services/walletService", () => ({ postLedger: mocks.postLedger }));
vi.mock("@/services/closeGuard", () => ({ assertDateOpen: mocks.assertDateOpen }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));

import { createIncomeExpenseEntry } from "@/services/incomeExpenseService";

function fakeTx() {
  return {
    wallet: {
      findUnique: vi.fn().mockResolvedValue({
        id: "wallet-1",
        name: "Cash",
        businessId: "business-1",
        branchId: "branch-1",
        currency: "MMK",
        active: true,
        deletedAt: null,
      }),
    },
    incomeExpense: {
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: "entry-1", ...data })
      ),
    },
  };
}

const base = {
  businessId: "business-1",
  branchId: "branch-1",
  userId: "user-1",
  amount: 50_000n,
  walletId: "wallet-1",
  date: "2026-07-26",
};

describe("income, expense, and withdrawal entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.nextNumber.mockResolvedValue("TXN-000001");
    mocks.postLedger.mockResolvedValue({});
    mocks.assertDateOpen.mockResolvedValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
  });

  it("records a withdrawal as money out without requiring a category", async () => {
    const tx = fakeTx();
    const result = await createIncomeExpenseEntry(tx as never, {
      ...base,
      type: "WITHDRAW",
    });

    expect(result.categoryName).toBe("Withdrawal");
    expect(mocks.nextNumber).toHaveBeenCalledWith(tx, "business-1", "WITHDRAW");
    expect(mocks.postLedger).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ direction: "CREDIT", refType: "WITHDRAW" })
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ module: "wallet" })
    );
  });

  it("requires a category for income and expense", async () => {
    await expect(
      createIncomeExpenseEntry(fakeTx() as never, {
        ...base,
        type: "EXPENSE",
      })
    ).rejects.toThrow("A category is required");
  });

  it.each([
    ["INCOME", "DEBIT"],
    ["EXPENSE", "CREDIT"],
  ] as const)("posts %s with the correct wallet direction", async (type, direction) => {
    const tx = fakeTx();
    await createIncomeExpenseEntry(tx as never, {
      ...base,
      type,
      categoryName: type === "INCOME" ? "Sales" : "Rent",
    });

    expect(mocks.postLedger).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ direction, refType: type })
    );
  });

  it("rejects a wallet from another branch", async () => {
    const tx = fakeTx();
    tx.wallet.findUnique.mockResolvedValue({
      id: "wallet-1",
      name: "Cash",
      businessId: "business-1",
      branchId: "branch-2",
      currency: "MMK",
      active: true,
      deletedAt: null,
    });

    await expect(
      createIncomeExpenseEntry(tx as never, {
        ...base,
        type: "WITHDRAW",
      })
    ).rejects.toThrow("Wallet not found");
  });
});
