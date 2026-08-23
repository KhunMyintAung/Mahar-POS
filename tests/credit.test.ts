import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  nextNumber: vi.fn(),
  postLedger: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/sequence", () => ({ nextNumber: mocks.nextNumber }));
vi.mock("@/services/walletService", () => ({ postLedger: mocks.postLedger }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));

import { createReceivable } from "@/services/creditService";

function fakeTx() {
  return {
    contact: {
      findUnique: vi.fn().mockResolvedValue({
        id: "customer-1",
        name: "Khun Myint Aung",
        businessId: "business-1",
        deletedAt: null,
      }),
    },
    receivable: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "rec-1", ...data })),
    },
  };
}

const base = {
  businessId: "business-1",
  branchId: "branch-1",
  userId: "user-1",
  customerId: "customer-1",
  amount: 500_000_00n,
  currency: "MMK",
  creditDate: "2026-07-28",
};

describe("createReceivable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.nextNumber.mockResolvedValue("CRD-000001");
  });

  it("moves no money for a plain credit sale", async () => {
    const tx = fakeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createReceivable(tx as any, base);
    expect(mocks.postLedger).not.toHaveBeenCalled();
  });

  it("posts the amount out of the chosen wallet for a cash advance", async () => {
    const tx = fakeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createReceivable(tx as any, { ...base, walletId: "kpay-1" });

    expect(mocks.postLedger).toHaveBeenCalledTimes(1);
    expect(mocks.postLedger.mock.calls[0][1]).toMatchObject({
      businessId: "business-1",
      walletId: "kpay-1",
      direction: "CREDIT",
      amount: 500_000_00n,
      refType: "CREDIT_DISBURSE",
      refId: "rec-1",
      description: "Cash given for CRD-000001 (Khun Myint Aung)",
    });
  });

  it("records the receivable at its full amount either way", async () => {
    const tx = fakeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createReceivable(tx as any, { ...base, walletId: "kpay-1" });
    expect(tx.receivable.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          txnNo: "CRD-000001",
          originalAmount: 500_000_00n,
          remainingAmount: 500_000_00n,
        }),
      })
    );
  });

  it("rejects a zero or negative amount", async () => {
    const tx = fakeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(createReceivable(tx as any, { ...base, amount: 0n })).rejects.toThrow();
    expect(mocks.postLedger).not.toHaveBeenCalled();
  });
});
