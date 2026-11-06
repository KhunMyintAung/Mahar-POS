import { prisma, type Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { createIncomeExpenseEntry, reverseIncomeExpense } from "@/services/incomeExpenseService";
import { postLedger, reverseLedgerEntries } from "@/services/walletService";
import { technicianPerformance } from "@/services/technicianService";

/** Salaries and advances are filed under this expense category, so Reports count them. */
export const STAFF_SALARY_CATEGORY = "Staff Salary";
export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "HALF", "LEAVE"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** A deposit can be paid back once this many months of it were kept. */
export const DEPOSIT_MONTHS = 6;
/** Withdrawals of a profit bonus (profit already counted, so not an expense) are filed here. */
export const STAFF_PROFIT_BONUS = "Staff Profit Bonus";
/** A month's Boss Share taken out, filed as a withdrawal under this name. */
export const BOSS_SHARE_CATEGORY = "Boss Share";

/** The month's attendance bonus: the staff member's amount when no day was taken off
 *  (absent, half day or leave), nothing otherwise. */
export function attendanceBonusFor(amount: bigint, statuses: string[]): bigint {
  return statuses.some((st) => st === "ABSENT" || st === "HALF" || st === "LEAVE") ? 0n : amount;
}

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
      const attendanceBonus = attendanceBonusFor(s.attendanceBonus, days.map((d) => d.status));
      const deposit = s.deposit;
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
        attendanceBonus,
        deposit,
        // The no days off bonus and the deposit go into the held balance, not the pay.
        net: s.salary - deduction - advance + commission - deposit,
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

/** Money given before payday: it leaves the wallet now but is not an expense — the staff
 *  member owes it back, and it comes off the next salary, which is then the expense in full. */
export async function giveAdvance(tx: Tx, opts: {
  businessId: string; userId: string; staffId: string; amount: bigint; walletId: string; date: string; note?: string;
}) {
  if (opts.amount <= 0n) throw new ApiError(422, "Amount must be greater than zero");
  const s = await activeStaff(tx, opts.businessId, opts.staffId);
  if (!s.active) throw new ApiError(422, "This staff member is switched off");
  const branchId = await walletBranch(tx, opts.businessId, opts.walletId);
  const a = await tx.staffAdvance.create({
    data: {
      businessId: opts.businessId, staffId: s.id, amount: opts.amount, date: opts.date,
      walletId: opts.walletId, note: opts.note, createdById: opts.userId,
    },
  });
  await postLedger(tx, {
    businessId: opts.businessId, walletId: opts.walletId, direction: "CREDIT", amount: opts.amount,
    refType: "STAFF_ADVANCE", refId: a.id, description: `Advance · ${s.name}${opts.note ? ` · ${opts.note}` : ""}`,
    createdById: opts.userId,
  });
  await audit(tx, {
    businessId: opts.businessId, userId: opts.userId, branchId, action: "CREATE", module: "staff",
    resourceType: "StaffAdvance", resourceId: a.id, after: { staff: s.name, amount: opts.amount, date: opts.date },
  });
  return a;
}

/** Undoes an advance not yet taken off a salary: the money goes back into its wallet. */
export async function voidAdvance(tx: Tx, opts: { businessId: string; userId: string; id: string; reason: string }) {
  const a = await tx.staffAdvance.findFirst({ where: { id: opts.id, businessId: opts.businessId } });
  if (!a || a.voidedAt) throw new ApiError(404, "Advance not found");
  if (a.salaryPaymentId) throw new ApiError(422, "This advance was taken off a salary; cancel that salary first");
  if (a.expenseId) await reverseIncomeExpense(tx, { id: a.expenseId, reason: opts.reason || "Advance cancelled", userId: opts.userId, businessId: opts.businessId });
  else await reverseLedgerEntries(tx, opts.businessId, "STAFF_ADVANCE", a.id, opts.userId, opts.reason || "Advance cancelled");
  await tx.staffAdvance.update({ where: { id: a.id }, data: { voidedAt: new Date() } });
}

/** Pays a month's salary: salary less days off and open advances, plus commission and bonus,
 *  less any other deduction and the deposit. The no days off bonus and the deposit go into the
 *  staff member's held balance. The Staff Salary expense is what is paid plus the advances
 *  taken off (they left the wallet earlier, as money owed); the advances are marked as taken
 *  off. One payment per person per month. */
export async function paySalary(tx: Tx, opts: {
  businessId: string; userId: string; staffId: string; month: string; walletId: string; date: string;
  commission: bigint; bonus: bigint; otherDeduction: bigint; absentDays?: number; note?: string;
  /** Left out: worked out from attendance (the staff member's amount when no day was off). */
  attendanceBonus?: bigint;
  /** Left out: the staff member's monthly deposit. */
  deposit?: bigint;
}) {
  const s = await activeStaff(tx, opts.businessId, opts.staffId);
  const paid = await tx.staffSalaryPayment.findFirst({ where: { staffId: s.id, month: opts.month, voidedAt: null } });
  if (paid) throw new ApiError(409, `${s.name} was already paid for ${opts.month}`);
  if (opts.commission < 0n || opts.bonus < 0n || opts.otherDeduction < 0n || (opts.attendanceBonus ?? 0n) < 0n || (opts.deposit ?? 0n) < 0n) {
    throw new ApiError(422, "Amounts cannot be negative");
  }

  const days = await tx.staffAttendance.findMany({
    where: { staffId: s.id, date: { gte: `${opts.month}-01`, lte: `${opts.month}-31` } },
    select: { status: true },
  });
  const off = opts.absentDays ?? unpaidDays(days.map((d) => d.status));
  if (off < 0 || off > 31) throw new ApiError(422, "Days off must be between 0 and 31");
  const deduction = absentDeduction(s.salary, off, daysInMonth(opts.month));
  const advances = await tx.staffAdvance.findMany({ where: { staffId: s.id, businessId: opts.businessId, voidedAt: null, salaryPaymentId: null } });
  const advance = advances.reduce((n, a) => n + a.amount, 0n);
  const attendanceBonus = opts.attendanceBonus ?? attendanceBonusFor(s.attendanceBonus, days.map((d) => d.status));
  const deposit = opts.deposit ?? s.deposit;
  const net = s.salary - deduction - advance + opts.commission + opts.bonus - opts.otherDeduction - deposit;
  if (net < 0n) throw new ApiError(422, "Deductions and advances are more than the pay");
  // Advances given the new way were not expenses: they count now, with the salary.
  const owedBack = advances.filter((a) => !a.expenseId).reduce((n, a) => n + a.amount, 0n);

  const branchId = await walletBranch(tx, opts.businessId, opts.walletId);
  const expense = net + owedBack > 0n
    ? await createIncomeExpenseEntry(tx, {
        businessId: opts.businessId, branchId, userId: opts.userId, type: "EXPENSE",
        categoryName: STAFF_SALARY_CATEGORY, amount: net + owedBack, moneyOut: net, walletId: opts.walletId, date: opts.date,
        reference: opts.month, description: `Salary ${opts.month} · ${s.name}${owedBack > 0n ? " (advance taken off)" : ""}`,
      })
    : null;
  const payment = await tx.staffSalaryPayment.create({
    data: {
      businessId: opts.businessId, staffId: s.id, month: opts.month, baseSalary: s.salary,
      absentDays: off, absentDeduction: deduction, advanceDeduction: advance,
      commission: opts.commission, bonus: opts.bonus, attendanceBonus, bonusHeld: attendanceBonus, otherDeduction: opts.otherDeduction, deposit, net,
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

/** A bonus paid on its own (year end, Thingyan…): a Staff Salary expense from the wallet. */
export async function giveBonus(tx: Tx, opts: {
  businessId: string; userId: string; staffId: string; amount: bigint; walletId: string; date: string; note?: string;
}) {
  if (opts.amount <= 0n) throw new ApiError(422, "Amount must be greater than zero");
  const s = await activeStaff(tx, opts.businessId, opts.staffId);
  const branchId = await walletBranch(tx, opts.businessId, opts.walletId);
  const expense = await createIncomeExpenseEntry(tx, {
    businessId: opts.businessId, branchId, userId: opts.userId, type: "EXPENSE",
    categoryName: STAFF_SALARY_CATEGORY, amount: opts.amount, walletId: opts.walletId, date: opts.date,
    description: `Bonus · ${s.name}${opts.note ? ` · ${opts.note}` : ""}`,
  });
  return tx.staffBonus.create({
    data: {
      businessId: opts.businessId, staffId: s.id, amount: opts.amount, date: opts.date,
      walletId: opts.walletId, expenseId: expense.id, note: opts.note, createdById: opts.userId,
    },
  });
}

/** A month's profit left after Boss Share, given to staff: kept in each one's held balance
 *  (no money moves until they withdraw). Only once that month's share was taken, and never
 *  more than what was left. */
export async function giveProfitBonus(tx: Tx, opts: {
  businessId: string; userId: string; month: string; date: string; left: bigint; amounts: { staffId: string; amount: bigint }[];
}) {
  const taken = await tx.bossShareTake.findFirst({ where: { businessId: opts.businessId, month: opts.month, voidedAt: null } });
  if (!taken) throw new ApiError(422, "Take this month's Boss Share first, then give the bonus");
  const list = opts.amounts.filter((a) => a.amount > 0n);
  if (list.some((a) => a.amount < 0n)) throw new ApiError(422, "Amounts cannot be negative");
  if (list.length === 0) throw new ApiError(422, "Enter an amount for someone");
  const given = await tx.staffBonus.aggregate({ where: { businessId: opts.businessId, month: opts.month, held: true, voidedAt: null }, _sum: { amount: true } });
  const total = list.reduce((n, a) => n + a.amount, 0n);
  if ((given._sum.amount ?? 0n) + total > opts.left) throw new ApiError(422, "More than the profit left after Boss Share");
  for (const a of list) {
    const st = await activeStaff(tx, opts.businessId, a.staffId);
    const b = await tx.staffBonus.create({
      data: { businessId: opts.businessId, staffId: st.id, amount: a.amount, date: opts.date, held: true, month: opts.month, note: `Profit bonus ${opts.month}`, createdById: opts.userId },
    });
    await audit(tx, {
      businessId: opts.businessId, userId: opts.userId, action: "CREATE", module: "staff",
      resourceType: "StaffBonus", resourceId: b.id, after: { staff: st.name, amount: a.amount, month: opts.month, held: true },
    });
  }
}

export async function voidBonus(tx: Tx, opts: { businessId: string; userId: string; id: string; reason: string }) {
  const b = await tx.staffBonus.findFirst({ where: { id: opts.id, businessId: opts.businessId } });
  if (!b || b.voidedAt) throw new ApiError(404, "Bonus not found");
  if (b.held) {
    const bal = (await heldBalances(tx, opts.businessId)).get(b.staffId);
    if (!bal || bal.profitHeld < b.amount) throw new ApiError(422, "This bonus was already withdrawn; cancel that withdrawal first");
  } else if (b.expenseId) {
    await reverseIncomeExpense(tx, { id: b.expenseId, reason: opts.reason || "Bonus cancelled", userId: opts.userId, businessId: opts.businessId });
  }
  await tx.staffBonus.update({ where: { id: b.id }, data: { voidedAt: new Date() } });
}

export interface HeldBalance {
  /** Deposit kept from salaries. */
  kept: bigint;
  /** No days off bonuses held at payday. */
  bonus: bigint;
  /** Profit bonuses (left after Boss Share). */
  profit: bigint;
  /** Withdrawn in all, and of that from profit bonuses. */
  returned: bigint;
  returnedProfit: bigint;
  /** Still held, and of that from profit bonuses. */
  held: bigint;
  profitHeld: bigint;
  /** What can be withdrawn before the deposit months are up: everything but the deposit. */
  free: bigint;
  months: number;
  firstMonth: string | null;
}

/** Each staff member's held balance: the deposit kept from salaries, the no days off bonus
 *  held at payday and profit bonuses, less what was withdrawn. A withdrawal takes profit
 *  bonus first, then the no days off bonus, then the deposit. */
export async function heldBalances(db: Tx | typeof prisma, businessId: string) {
  const [kept, back, profit] = await Promise.all([
    db.staffSalaryPayment.findMany({
      where: { businessId, voidedAt: null, OR: [{ deposit: { gt: 0 } }, { bonusHeld: { gt: 0 } }] },
      select: { staffId: true, deposit: true, bonusHeld: true, month: true },
    }),
    db.staffDepositReturn.findMany({ where: { businessId, voidedAt: null }, select: { staffId: true, amount: true, profitAmount: true } }),
    db.staffBonus.findMany({ where: { businessId, voidedAt: null, held: true }, select: { staffId: true, amount: true } }),
  ]);
  const out = new Map<string, HeldBalance>();
  const get = (id: string) => out.get(id) ?? (out.set(id, {
    kept: 0n, bonus: 0n, profit: 0n, returned: 0n, returnedProfit: 0n, held: 0n, profitHeld: 0n, free: 0n, months: 0, firstMonth: null,
  }), out.get(id)!);
  for (const k of kept) {
    const r = get(k.staffId);
    r.kept += k.deposit; r.bonus += k.bonusHeld;
    if (k.deposit > 0n) {
      r.months += 1;
      if (!r.firstMonth || k.month < r.firstMonth) r.firstMonth = k.month;
    }
  }
  for (const p of profit) get(p.staffId).profit += p.amount;
  for (const b of back) { const r = get(b.staffId); r.returned += b.amount; r.returnedProfit += b.profitAmount; }
  for (const r of out.values()) {
    r.held = r.kept + r.bonus + r.profit - r.returned;
    r.profitHeld = r.profit - r.returnedProfit;
    const salaryOut = r.returned - r.returnedProfit;
    r.free = r.profitHeld + (r.bonus > salaryOut ? r.bonus - salaryOut : 0n);
  }
  return out;
}
/** Kept for older callers: the held balances. */
export const depositBalances = heldBalances;

/** Withdraws from the held balance. The profit bonus part is a withdrawal (that profit was
 *  counted already); the rest — no days off bonus, then deposit — is a Staff Salary expense,
 *  since it is pay held back. The deposit can come out once DEPOSIT_MONTHS months of it were
 *  kept, or earlier when said so (someone leaving). */
export async function returnDeposit(tx: Tx, opts: {
  businessId: string; userId: string; staffId: string; amount: bigint; walletId: string; date: string; note?: string; early?: boolean;
}) {
  if (opts.amount <= 0n) throw new ApiError(422, "Amount must be greater than zero");
  const s = await activeStaff(tx, opts.businessId, opts.staffId);
  const bal = (await heldBalances(tx, opts.businessId)).get(s.id);
  if (!bal || opts.amount > bal.held) throw new ApiError(422, "More than the balance held");
  if (opts.amount > bal.free && bal.months < DEPOSIT_MONTHS && !opts.early) {
    throw new ApiError(422, `Only ${bal.months} month(s) of deposit kept; the deposit can come out after ${DEPOSIT_MONTHS}`);
  }
  const branchId = await walletBranch(tx, opts.businessId, opts.walletId);
  const profitPart = opts.amount < bal.profitHeld ? opts.amount : bal.profitHeld;
  const salaryPart = opts.amount - profitPart;
  const label = `${s.name}${opts.note ? ` · ${opts.note}` : ""}`;
  const withdraw = profitPart > 0n
    ? await createIncomeExpenseEntry(tx, {
        businessId: opts.businessId, branchId, userId: opts.userId, type: "WITHDRAW",
        categoryName: STAFF_PROFIT_BONUS, amount: profitPart, walletId: opts.walletId, date: opts.date,
        description: `Profit bonus withdrawn · ${label}`,
      })
    : null;
  const expense = salaryPart > 0n
    ? await createIncomeExpenseEntry(tx, {
        businessId: opts.businessId, branchId, userId: opts.userId, type: "EXPENSE",
        categoryName: STAFF_SALARY_CATEGORY, amount: salaryPart, walletId: opts.walletId, date: opts.date,
        description: `Held balance withdrawn · ${label}`,
      })
    : null;
  return tx.staffDepositReturn.create({
    data: {
      businessId: opts.businessId, staffId: s.id, amount: opts.amount, profitAmount: profitPart, date: opts.date,
      walletId: opts.walletId, expenseId: expense?.id, withdrawId: withdraw?.id, note: opts.note, createdById: opts.userId,
    },
  });
}

export async function voidDepositReturn(tx: Tx, opts: { businessId: string; userId: string; id: string; reason: string }) {
  const d = await tx.staffDepositReturn.findFirst({ where: { id: opts.id, businessId: opts.businessId } });
  if (!d || d.voidedAt) throw new ApiError(404, "Not found");
  const reason = opts.reason || "Withdrawal cancelled";
  if (d.expenseId) await reverseIncomeExpense(tx, { id: d.expenseId, reason, userId: opts.userId, businessId: opts.businessId });
  if (d.withdrawId) await reverseIncomeExpense(tx, { id: d.withdrawId, reason, userId: opts.userId, businessId: opts.businessId });
  await tx.staffDepositReturn.update({ where: { id: d.id }, data: { voidedAt: new Date() } });
}

/** Takes a month's Boss Share out of a wallet: every partner's share as one withdrawal, so
 *  the profit is not lowered. Once per month (cancel to take it again). */
export async function takeBossShare(tx: Tx, opts: {
  businessId: string; userId: string; month: string; walletId: string; date: string;
  shares: { name: string; percent: number; amount: bigint }[];
}) {
  const open = await tx.bossShareTake.findFirst({ where: { businessId: opts.businessId, month: opts.month, voidedAt: null } });
  if (open) throw new ApiError(409, `The Boss Share for ${opts.month} was already taken`);
  const amount = opts.shares.reduce((n, p) => n + p.amount, 0n);
  if (amount <= 0n) throw new ApiError(422, "Nothing to take: no profit to share that month");
  const branchId = await walletBranch(tx, opts.businessId, opts.walletId);
  const withdraw = await createIncomeExpenseEntry(tx, {
    businessId: opts.businessId, branchId, userId: opts.userId, type: "WITHDRAW",
    categoryName: BOSS_SHARE_CATEGORY, amount, walletId: opts.walletId, date: opts.date, reference: opts.month,
    description: `Boss Share ${opts.month} · ${opts.shares.filter((p) => p.amount > 0n).map((p) => p.name).join(", ")}`,
  });
  return tx.bossShareTake.create({
    data: {
      businessId: opts.businessId, month: opts.month, amount, walletId: opts.walletId, withdrawId: withdraw.id, createdById: opts.userId,
      shares: opts.shares.map((p) => ({ name: p.name, percent: p.percent, amount: p.amount.toString() })),
    },
  });
}

/** Puts a taken Boss Share back into its wallet — not once staff were given that month's
 *  profit bonus (cancel those first). */
export async function voidBossShare(tx: Tx, opts: { businessId: string; userId: string; id: string; reason: string }) {
  const t = await tx.bossShareTake.findFirst({ where: { id: opts.id, businessId: opts.businessId } });
  if (!t || t.voidedAt) throw new ApiError(404, "Not found");
  const bonus = await tx.staffBonus.findFirst({ where: { businessId: opts.businessId, month: t.month, held: true, voidedAt: null } });
  if (bonus) throw new ApiError(422, "Staff were given this month's profit bonus; cancel those first");
  await reverseIncomeExpense(tx, { id: t.withdrawId, reason: opts.reason || "Boss Share cancelled", userId: opts.userId, businessId: opts.businessId });
  await tx.bossShareTake.update({ where: { id: t.id }, data: { voidedAt: new Date() } });
}

export interface EarnCell { salary: bigint; commission: bigint; bonus: bigint; total: bigint }
const zeroCell = (): EarnCell => ({ salary: 0n, commission: 0n, bonus: 0n, total: 0n });

/** What each member of staff earned, month by month for a year and in all: salary (less
 *  days off and other deductions, deposit included since it is theirs), commission, and
 *  bonuses (in the salary, for no days off, and paid on their own). Advances are not extra:
 *  they come off a salary. */
export async function earnings(businessId: string, year: string) {
  const [staff, payments, bonuses, deposits] = await Promise.all([
    prisma.staff.findMany({ where: { businessId }, orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, active: true } }),
    prisma.staffSalaryPayment.findMany({ where: { businessId, voidedAt: null } }),
    prisma.staffBonus.findMany({ where: { businessId, voidedAt: null } }),
    heldBalances(prisma, businessId),
  ]);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const rows = staff.map((st) => {
    const byMonth: Record<string, EarnCell> = Object.fromEntries(months.map((m) => [m, zeroCell()]));
    const yearCell = zeroCell();
    const all = zeroCell();
    const add = (month: string, part: Partial<EarnCell>) => {
      const cells = [all, ...(byMonth[month] ? [byMonth[month], yearCell] : [])];
      for (const c of cells) {
        c.salary += part.salary ?? 0n; c.commission += part.commission ?? 0n; c.bonus += part.bonus ?? 0n;
        c.total += (part.salary ?? 0n) + (part.commission ?? 0n) + (part.bonus ?? 0n);
      }
    };
    for (const p of payments.filter((x) => x.staffId === st.id)) {
      add(p.month, { salary: p.baseSalary - p.absentDeduction - p.otherDeduction, commission: p.commission, bonus: p.bonus + p.attendanceBonus });
    }
    for (const b of bonuses.filter((x) => x.staffId === st.id)) add(b.month ?? b.date.slice(0, 7), { bonus: b.amount });
    const dep = deposits.get(st.id);
    return { staff: st, months: byMonth, year: yearCell, allTime: all, depositHeld: dep?.held ?? 0n, depositMonths: dep?.months ?? 0 };
  }).filter((r) => r.staff.active || r.allTime.total !== 0n);
  return { year, months, rows };
}
