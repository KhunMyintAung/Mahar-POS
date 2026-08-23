import { beforeEach, describe, expect, it, vi } from "vitest";

import { purgeBusiness } from "@/services/accountDeletionService";

/** Records the order tables are emptied in, so the dependency order is asserted rather
 *  than assumed. Every delegate returns a count like Prisma's deleteMany does. */
function fakeTx(order: string[]) {
  const del = (label: string) => ({
    deleteMany: vi.fn(async () => { order.push(label); return { count: 1 }; }),
    findMany: vi.fn(async () => [{ id: `${label}-1` }]),
  });
  return {
    business: {
      // Typed as nullable so a test can make the business missing.
      findUnique: vi.fn(async (): Promise<{ id: string; name: string } | null> => ({ id: "biz-1", name: "Test Shop" })),
      delete: vi.fn(async () => { order.push("business"); return { id: "biz-1" }; }),
    },
    user: del("user"),
    branch: del("branch"),
    item: del("item"),
    sale: del("sale"),
    purchase: del("purchase"),
    receivable: del("receivable"),
    payable: del("payable"),
    saleLine: del("saleLine"),
    purchaseLine: del("purchaseLine"),
    receivablePayment: del("receivablePayment"),
    payablePayment: del("payablePayment"),
    stockLevel: del("stockLevel"),
    telegramSession: del("telegramSession"),
    authSession: del("authSession"),
    userBranch: del("userBranch"),
    stockMovement: del("stockMovement"),
    incomeExpense: del("incomeExpense"),
    walletLedgerEntry: del("walletLedgerEntry"),
    walletTransfer: del("walletTransfer"),
    walletReconciliation: del("walletReconciliation"),
    wallet: del("wallet"),
    itemCategory: del("itemCategory"),
    unit: del("unit"),
    category: del("category"),
    dailyClose: del("dailyClose"),
    notification: del("notification"),
    auditLog: del("auditLog"),
    contact: del("contact"),
    systemSetting: del("systemSetting"),
    numberSequence: del("numberSequence"),
    role: del("role"),
  };
}

describe("purgeBusiness", () => {
  let order: string[];
  let tx: ReturnType<typeof fakeTx>;

  beforeEach(() => {
    order = [];
    tx = fakeTx(order);
  });

  const before = (a: string, b: string) => {
    expect(order.indexOf(a), `${a} must be deleted before ${b}`).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(b), `${b} missing`).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(a)).toBeLessThan(order.indexOf(b));
  };

  it("deletes children before the rows they reference", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await purgeBusiness(tx as any, "biz-1");

    before("saleLine", "sale");
    before("purchaseLine", "purchase");
    before("receivablePayment", "receivable");
    before("payablePayment", "payable");
    before("stockLevel", "item");
    // Documents reference receivables/payables/wallets, so they go first.
    before("sale", "receivable");
    before("purchase", "payable");
    before("sale", "wallet");
    before("walletLedgerEntry", "wallet");
    before("item", "itemCategory");
    before("item", "unit");

    // Users and branches are referenced by nearly everything, so they go last.
    before("auditLog", "user");
    before("contact", "user");
    before("user", "role");
    before("user", "branch");
    before("branch", "business");
  });

  it("removes the business row itself, last", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await purgeBusiness(tx as any, "biz-1");
    expect(order[order.length - 1]).toBe("business");
    expect(tx.business.delete).toHaveBeenCalledWith({ where: { id: "biz-1" } });
  });


  it("refuses when the business does not exist", async () => {
    tx.business.findUnique = vi.fn(async () => null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(purgeBusiness(tx as any, "missing")).rejects.toThrow();
    expect(order).toHaveLength(0);
  });
});
