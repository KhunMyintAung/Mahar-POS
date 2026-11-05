import { prisma, type Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { createIncomeExpenseEntry, reverseIncomeExpense } from "@/services/incomeExpenseService";
import { technicianPerformance } from "@/services/technicianService";

/** Salaries and advances are filed under this expense category, so Reports count them. */
export const STAFF_SALARY_CATEGORY = "Staff Salary";
export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "HALF", "LEAVE"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Days off that cost pay: an absence is a whole day, a half day half; paid leave is free. */
export function unpaidDays(statuses: string[]): number {
  return statuses.reduce((n, s) => n + (s === "ABSENT" ? 1 : s === "HALF" ? 0.5 : 0), 0);
}

/** What the days off take off a monthly salary: the salary over the month's days, per day,
 *  rounded to whole kyat. */
export function absentDeduction(salary: bigint, days: number, monthDays: number): bigint {
  if (days <= 0 || salary <= 0n) return 0n;
  const tenths = BigInt(Math.round(days * 10));
  const exact = (salary * tenths) / BigInt(monthDays * 10);
  return ((exact + 50n) / 100n) * 100n;
}

/** The month's pay for each active member of staff (and anyone already paid that month):
 *  salary, days off and what they cost, advances not yet taken off, the repair commission a
 *  linked Service Tech login earned, and the payment if the month was paid. */
export async function payroll(businessId: string, month: string) {
  const [staff, attendance, advances, payments] = await Promise.all([
    prisma.staff.findMany({ where: { businessId }, orderBy: { name: "asc" } }),
    prisma.staffAttendance.findMany({
      where: { businessId, date: { gte: `${month}-01`, lte: `${month}-31` } },
      select: { staffId: true, status: true },
    }),
    prisma.staffAdvance.findMany({
      where: { businessId, voidedAt: null, salaryPaymentId: null },
      select: { staffId: true, amount: true },
    }),
    prisma.staffSalaryPayment.findMany({ where: { businessId, month, voidedAt: null } }),
  ]);
  const linked = staff.some((s) => s.userId);
  const techs = linked ? (await technicianPerformance(businessId, month)).technicians : [];
  const monthDays = daysInMonth(month);

  return staff
    .filter((s) => s.active || payments.some((p) => p.staffId === s.id))
    .map((s) => {
      const days = attendance.filter((a) => a.staffId === s.id);
      const off = unpaidDays(days.map((d) => d.status));
      const advance = advances.filter((a) => a.staffId === s.id).reduce((n, a) => n + a.amount, 0n);
      const commission = s.userId ? techs.find((t) => t.userId === s.userId)?.commission ?? 0n : 0n;
      const deduction = absentDeduction(s.salary, off, monthDays);
      return {
        staff: s,
        present: days.filter((d) => d.status === "PRESENT").length,
        absent: days.filter((d) => d.status === "ABSENT").length,
        half: days.filter((d) => d.status === "HALF").length,
        leave: days.filter((d) => d.status === "LEAVE").length,
        absentDays: off,
        absentDeduction: deduction,
        advance,
        commission,
        net: s.salary - deduction - advance + commission,
        payment: payments.find((p) => p.staffId === s.id) ?? null,
      };
    });
}

async function walletBranch(tx: Tx, businessId: string, walletId: string): Promise<string> {
  const wallet = await tx.wallet.findFirst({ where: { id: walletId, businessId, deletedAt: null }, select: { branchId: true } });
  if (!wallet) throw new ApiError(404, "Wallet not found");
  if (!wallet.branchId) throw new ApiError(422, "Pick a branch wallet");
  return wallet.branchId;
}

async function activeStaff(tx: Tx, businessId: string, staffId: string) {
  const s = await tx.staff.findFirst({ where: { id: staffId, businessId } });
  if (!s) throw new ApiError(404, "Staff not found");
  return s;
}

/** Money given before payday: paid out of a wallet now (a Staff Salary expense) and taken
 *  off the next salary. */
export async function giveAdvance(tx: Tx, opts: {
  businessId: string; userId: string; staffId: string; amount: bigint; walletId: string; date: string; note?: string;
}) {
  if (opts.amount <= 0n) throw new ApiError(422, "Amount must be greater than zero");
  const s = await activeStaff(tx, opts.businessId, opts.staffId);
  if (!s.active) throw new ApiError(422, "This staff member is switched off");
  const branchId = await walletBranch(tx, opts.businessId, opts.walletId);
  const expense = await createIncomeExpenseEntry(tx, {
    businessId: opts.businessId, branchId, userId: opts.userId, type: "EXPENSE",
    categoryName: STAFF_SALARY_CATEGORY, amount: opts.amount, walletId: opts.walletId, date: opts.date,
    description: `Advance · ${s.name}${opts.note ? ` · ${opts.note}` : ""}`,
  });
  return tx.staffAdvance.create({
    data: {
      businessId: opts.businessId, staffId: s.id, amount: opts.amount, date: opts.date,
      walletId: opts.walletId, expenseId: expense.id, note: opts.note, createdById: opts.userId,
    },
  });
}

/** Undoes an advance not yet taken off a salary: the money goes back into its wallet. */
export async function voidAdvance(tx: Tx, opts: { businessId: string; userId: string; id: string; reason: string }) {
  const a = await tx.staffAdvance.findFirst({ where: { id: opts.id, businessId: opts.businessId } });
  if (!a || a.voidedAt) throw new ApiError(404, "Advance not found");
  if (a.salaryPaymentId) throw new ApiError(422, "This advance was taken off a salary; cancel that salary first");
  await reverseIncomeExpense(tx, { id: a.expenseId, reason: opts.reason || "Advance cancelled", userId: opts.userId, businessId: opts.businessId });
  await tx.staffAdvance.update({ where: { id: a.id }, data: { voidedAt: new Date() } });
}

/** Pays a month's salary: salary less days off and open advances, plus commission and bonus,
 *  less any other deduction. What is paid is a Staff Salary expense from the wallet; the
 *  advances are marked as taken off. One payment per person per month. */
export async function paySalary(tx: Tx, opts: {
  businessId: string; userId: string; staffId: string; month: string; walletId: string; date: string;
  commission: bigint; bonus: bigint; otherDeduction: bigint; absentDays?: number; note?: string;
}) {
  const s = await activeStaff(tx, opts.businessId, opts.staffId);
  const paid = await tx.staffSalaryPayment.findFirst({ where: { staffId: s.id, month: opts.month, voidedAt: null } });
  if (paid) throw new ApiError(409, `${s.name} was already paid for ${opts.month}`);
  if (opts.commission < 0n || opts.bonus < 0n || opts.otherDeduction < 0n) throw new ApiError(422, "Amounts cannot be negative");

  const days = await tx.staffAttendance.findMany({
    where: { staffId: s.id, date: { gte: `${opts.month}-01`, lte: `${opts.month}-31` } },
    select: { status: true },
  });
  const off = opts.absentDays ?? unpaidDays(days.map((d) => d.status));
  if (off < 0 || off > 31) throw new ApiError(422, "Days off must be between 0 and 31");
  const deduction = absentDeduction(s.salary, off, daysInMonth(opts.month));
  const advances = await tx.staffAdvance.findMany({ where: { staffId: s.id, businessId: opts.businessId, voidedAt: null, salaryPaymentId: null } });
  const advance = advances.reduce((n, a) => n + a.amount, 0n);
  const net = s.salary - deduction - advance + opts.commission + opts.bonus - opts.otherDeduction;
  if (net < 0n) throw new ApiError(422, "Deductions and advances are more than the pay");

  const branchId = await walletBranch(tx, opts.businessId, opts.walletId);
  const expense = net > 0n
    ? await createIncomeExpenseEntry(tx, {
        businessId: opts.businessId, branchId, userId: opts.userId, type: "EXPENSE",
        categoryName: STAFF_SALARY_CATEGORY, amount: net, walletId: opts.walletId, date: opts.date,
        reference: opts.month, description: `Salary ${opts.month} · ${s.name}`,
      })
    : null;
  const payment = await tx.staffSalaryPayment.create({
    data: {
      businessId: opts.businessId, staffId: s.id, month: opts.month, baseSalary: s.salary,
      absentDays: off, absentDeduction: deduction, advanceDeduction: advance,
      commission: opts.commission, bonus: opts.bonus, otherDeduction: opts.otherDeduction, net,
      walletId: opts.walletId, expenseId: expense?.id, note: opts.note, createdById: opts.userId,
    },
  });
  if (advances.length) {
    await tx.staffAdvance.updateMany({ where: { id: { in: advances.map((a) => a.id) } }, data: { salaryPaymentId: payment.id } });
  }
  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId, action: "CREATE", module: "staff",
    resourceType: "StaffSalaryPayment", resourceId: payment.id,
    after: { staff: s.name, month: opts.month, net, advance, deduction },
  });
  return payment;
}

/** Cancels a salary payment: its expense is reversed and its advances are open again. */
export async function voidSalary(tx: Tx, opts: { businessId: string; userId: string; id: string; reason: string }) {
  const p = await tx.staffSalaryPayment.findFirst({ where: { id: opts.id, businessId: opts.businessId } });
  if (!p || p.voidedAt) throw new ApiError(404, "Salary payment not found");
  if (p.expenseId) await reverseIncomeExpense(tx, { id: p.expenseId, reason: opts.reason || "Salary cancelled", userId: opts.userId, businessId: opts.businessId });
  await tx.staffAdvance.updateMany({ where: { salaryPaymentId: p.id }, data: { salaryPaymentId: null } });
  await tx.staffSalaryPayment.update({ where: { id: p.id }, data: { voidedAt: new Date() } });
  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, action: "VOID", module: "staff",
    resourceType: "StaffSalaryPayment", resourceId: p.id, reason: opts.reason,
  });
}
