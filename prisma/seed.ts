import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_ROLES = [
  { name: "Owner", description: "Full system access", perms: "ALL" },
  { name: "Admin", description: "Daily operations management", perms: "ADMIN" },
  { name: "Cashier", description: "Cash and wallet operations", perms: "CASHIER" },
  { name: "Accountant", description: "Accounting and reports", perms: "ACCOUNTANT" },
  { name: "Viewer", description: "Read-only access", perms: "VIEWER" },
];

// Keep in sync with src/lib/permissions.ts
const ALL = [
  "dashboard.view",
  "wallet.view","wallet.create","wallet.adjust","wallet.transfer","wallet.withdraw","wallet.reconcile","wallet.reverse",
  "credit.view","credit.create","credit.collect",
  "payable.view","payable.create","payable.pay",
  "income_expense.view","income_expense.create",
  "customer.view","customer.manage",
  "report.view","report.export",
  "daily_close.view","daily_close.create","daily_close.approve","daily_close.reopen",
  "settings.manage","users.manage","audit.view",
  "item.view","item.manage","stock.view","stock.adjust",
  "purchase.view","purchase.create","purchase.cancel",
  "sale.view","sale.create","sale.cancel",
];
const PERM_SETS: Record<string, string[]> = {
  ALL,
  ADMIN: ALL.filter((p) => p !== "settings.manage"),
  CASHIER: ["dashboard.view","wallet.view","wallet.transfer","wallet.withdraw","income_expense.view","income_expense.create","credit.view","credit.collect","payable.view","payable.pay","customer.view"],
  ACCOUNTANT: ["dashboard.view","wallet.view","wallet.reconcile","wallet.withdraw","credit.view","credit.create","credit.collect","payable.view","payable.create","payable.pay","income_expense.view","income_expense.create","customer.view","customer.manage","report.view","report.export","daily_close.view","daily_close.create","daily_close.approve","audit.view"],
  VIEWER: ["dashboard.view","wallet.view","credit.view","payable.view","income_expense.view","customer.view","report.view","daily_close.view"],
};

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon" }).format(new Date());
}

async function main() {
  const existing = await prisma.business.findFirst();
  if (existing) {
    console.log("Seed skipped: business already exists");
    return;
  }

  const business = await prisma.business.create({
    data: {
      name: "Mahar Mini POS Demo Business",
      phone: "09-000000000",
      currency: "MMK",
      timezone: "Asia/Yangon",
    },
  });

  const main_ = await prisma.branch.create({
    data: { businessId: business.id, name: "Main Branch", code: "MAIN" },
  });
  await prisma.branch.create({
    data: { businessId: business.id, name: "Branch 2", code: "BR2" },
  });

  const roles: Record<string, string> = {};
  for (const r of DEFAULT_ROLES) {
    const role = await prisma.role.create({
      data: {
        businessId: business.id,
        name: r.name,
        description: r.description,
        permissions: JSON.stringify(PERM_SETS[r.perms]),
        isSystem: true,
      },
    });
    roles[r.name] = role.id;
  }

  const pw = await bcrypt.hash("Password123!", 10);
  const users: Record<string, string> = {};
  for (const [name, username, role, all] of [
    ["Owner User", "owner", "Owner", true],
    ["Admin User", "admin", "Admin", true],
    ["Cashier One", "cashier", "Cashier", false],
    ["Accountant User", "accountant", "Accountant", true],
  ] as const) {
    const u = await prisma.user.create({
      data: {
        businessId: business.id,
        name,
        username,
        passwordHash: pw,
        roleId: roles[role],
        allBranches: all,
        commissionRate: "0",
      },
    });
    users[username] = u.id;
    if (!all) {
      await prisma.userBranch.create({ data: { userId: u.id, branchId: main_.id } });
    }
  }

  // Wallets (balances are BigInt minor units: 1,000,000 MMK = 100000000n)
  const wallets: Record<string, string> = {};
  for (const [name, code, type, currency, opening] of [
    ["Main MMK Cash", "MMK-CASH", "CASH", "MMK", 5_000_000_00n],
    ["Main THB Cash", "THB-CASH", "CASH", "THB", 50_000_00n],
    ["KBZPay", "KBZPAY", "MOBILE", "MMK", 2_000_000_00n],
    ["WavePay", "WAVEPAY", "MOBILE", "MMK", 1_000_000_00n],
    ["Bank Account", "BANK-1", "BANK", "MMK", 10_000_000_00n],
  ] as const) {
    const w = await prisma.wallet.create({
      data: {
        businessId: business.id,
        branchId: main_.id,
        name, code, type, currency,
        openingBalance: opening,
        currentBalance: opening,
        minBalance: 100_000_00n,
      },
    });
    wallets[code] = w.id;
    await prisma.walletLedgerEntry.create({
      data: {
        walletId: w.id,
        businessId: business.id,
        branchId: main_.id,
        direction: "DEBIT",
        amount: opening,
        balanceAfter: opening,
        refType: "OPENING",
        description: "Opening balance",
        createdById: users.owner,
      },
    });
  }

  const customers: string[] = [];
  for (const [name, phone, type] of [
    ["U Kyaw Kyaw", "09-111111111", "CUSTOMER"],
    ["Daw Mya Mya", "09-222222222", "CUSTOMER"],
    ["Ko Zaw Min", "09-333333333", "CUSTOMER"],
    ["Golden Land Supplier", "09-444444444", "SUPPLIER"],
  ] as const) {
    const c = await prisma.contact.create({
      data: { businessId: business.id, branchId: main_.id, name, phone, type, creditLimit: 1_000_000_00n },
    });
    customers.push(c.id);
  }

  for (const [type, name] of [
    ["INCOME", "Service Fee"], ["INCOME", "Sales Income"], ["INCOME", "Other Income"],
    ["EXPENSE", "Salary"], ["EXPENSE", "Rent"], ["EXPENSE", "Utilities"], ["EXPENSE", "Transport"], ["EXPENSE", "Office Expense"],
  ] as const) {
    await prisma.category.create({ data: { businessId: business.id, type, name } });
  }

  // Sample receivable and payable
  await prisma.receivable.create({
    data: {
      txnNo: "CRD-000001",
      businessId: business.id,
      branchId: main_.id,
      customerId: customers[0],
      originalAmount: 500_000_00n,
      remainingAmount: 500_000_00n,
      creditDate: today(),
      dueDate: today(),
      status: "UNPAID",
      createdById: users.admin,
    },
  });
  await prisma.numberSequence.create({ data: { businessId: business.id, key: "CREDIT", prefix: "CRD", next: 2 } });

  await prisma.payable.create({
    data: {
      txnNo: "PAY-000001",
      businessId: business.id,
      branchId: main_.id,
      supplierId: customers[3],
      originalAmount: 300_000_00n,
      remainingAmount: 300_000_00n,
      payableDate: today(),
      dueDate: today(),
      category: "Rent",
      status: "UNPAID",
      createdById: users.admin,
    },
  });
  await prisma.numberSequence.create({ data: { businessId: business.id, key: "PAYABLE", prefix: "PAY", next: 2 } });

  // System settings (About Us etc.)
  await prisma.systemSetting.create({
    data: {
      businessId: business.id,
      key: "about",
      value: JSON.stringify({
        appName: "Mahar Mini POS",
        version: "1.0.0",
        description: "Internal business management and accounting application",
        developer: "Mahar Mini POS Team",
        phone: "09-000000000",
        telegram: "@walletnote",
        website: "",
        copyright: `© ${new Date().getFullYear()} Mahar Mini POS`,
      }),
    },
  });
  // POS & inventory samples
  const unitPcs = await prisma.unit.create({ data: { businessId: business.id, name: "pcs" } });
  const unitBox = await prisma.unit.create({ data: { businessId: business.id, name: "box" } });
  const catDrinks = await prisma.itemCategory.create({ data: { businessId: business.id, name: "Drinks" } });
  const catSnacks = await prisma.itemCategory.create({ data: { businessId: business.id, name: "Snacks" } });
  const items = [
    ["Cola 330ml", "DRK-001", catDrinks.id, unitPcs.id, 50_000n, 70_000n, 100],
    ["Water 1L", "DRK-002", catDrinks.id, unitPcs.id, 25_000n, 40_000n, 200],
    ["Potato Chips", "SNK-001", catSnacks.id, unitPcs.id, 80_000n, 120_000n, 50],
    ["Biscuit Box", "SNK-002", catSnacks.id, unitBox.id, 300_000n, 420_000n, 20],
  ] as const;
  for (const [name, sku, categoryId, unitId, cost, price, qty] of items) {
    const item = await prisma.item.create({
      data: {
        businessId: business.id, name, sku, categoryId, unitId,
        costPrice: cost, sellingPrice: price, minStock: 10,
      },
    });
    await prisma.stockLevel.create({ data: { itemId: item.id, branchId: main_.id, quantity: qty } });
    await prisma.stockMovement.create({
      data: {
        businessId: business.id, itemId: item.id, branchId: main_.id,
        type: "ADJUSTMENT", quantity: qty, qtyAfter: qty,
        notes: "Opening stock", createdById: users.owner,
      },
    });
  }

  console.log("Seed complete.");
  console.log("Logins (password for all: Password123!): owner, admin, cashier, accountant");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
