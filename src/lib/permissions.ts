// Granular permission keys and default role permission sets.

export const ALL_PERMISSIONS = [
  "dashboard.view",
  "wallet.view", "wallet.create", "wallet.adjust", "wallet.transfer", "wallet.withdraw", "wallet.reconcile", "wallet.reverse",
  "credit.view", "credit.create", "credit.collect",
  "payable.view", "payable.create", "payable.pay",
  "income_expense.view", "income_expense.create",
  "customer.view", "customer.manage",
  "report.view", "report.export",
  "daily_close.view", "daily_close.create", "daily_close.approve", "daily_close.reopen",
  "settings.manage",
  "users.manage",
  "audit.view",
  "item.view", "item.manage",
  "stock.view", "stock.adjust",
  "purchase.view", "purchase.create", "purchase.cancel",
  "sale.view", "sale.create", "sale.cancel",
  "repair.view", "repair.create", "repair.update",
  "biller.view", "biller.trade", "biller.manage",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

const CASHIER_PERMS: Permission[] = [
  "dashboard.view",
  "item.view", "stock.view", "sale.view", "sale.create",
  "repair.view", "repair.create", "repair.update",
  "biller.view", "biller.trade",
  "wallet.view", "wallet.transfer", "wallet.withdraw",
  "income_expense.view", "income_expense.create",
  "credit.view", "credit.collect",
  "payable.view", "payable.pay",
  "customer.view",
];

const ACCOUNTANT_PERMS: Permission[] = [
  "dashboard.view",
  "item.view", "stock.view", "purchase.view", "sale.view",
  "repair.view",
  "biller.view",
  "wallet.view", "wallet.reconcile", "wallet.withdraw",
  "credit.view", "credit.create", "credit.collect",
  "payable.view", "payable.create", "payable.pay",
  "income_expense.view", "income_expense.create",
  "customer.view", "customer.manage",
  "report.view", "report.export",
  "daily_close.view", "daily_close.create", "daily_close.approve",
  "audit.view",
];

/** A technician at the repair bench: repairs, the parts in stock (and taking one out for a
 *  repair), and the customer it is for. No money: no wallets, sales, reports or settings. */
export const SERVICE_TECH_PERMS: Permission[] = [
  "repair.view", "repair.create", "repair.update",
  "item.view", "stock.view", "stock.adjust",
  "customer.view",
];

const ADMIN_PERMS: Permission[] = ALL_PERMISSIONS.filter(
  (p) => p !== "settings.manage"
) as Permission[];

export const DEFAULT_ROLES: { name: string; description: string; permissions: Permission[] }[] = [
  { name: "Owner", description: "Full system access", permissions: [...ALL_PERMISSIONS] },
  { name: "Admin", description: "Daily operations management", permissions: ADMIN_PERMS },
  { name: "Cashier", description: "Cash and wallet operations", permissions: CASHIER_PERMS },
  { name: "Accountant", description: "Accounting and reports", permissions: ACCOUNTANT_PERMS },
  { name: "Service Tech", description: "Repairs and their parts, no money", permissions: SERVICE_TECH_PERMS },
  { name: "Viewer", description: "Read-only access", permissions: ["dashboard.view", "wallet.view", "credit.view", "payable.view", "income_expense.view", "customer.view", "report.view", "daily_close.view"] },
];

export function hasPermission(userPerms: string[], required: Permission): boolean {
  return userPerms.includes(required);
}
