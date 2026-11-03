import { prisma } from "./prisma";
import { branchScope } from "./auth";
import type { AuthUser } from "./auth";
import { toMinor, isValidDecimalString } from "./money";
import { fmtMoney } from "./format";
import { todayBusinessDate } from "./dates";
import { createIncomeExpenseEntry, recordFloatExpense } from "@/services/incomeExpenseService";
import { createTransfer } from "@/services/walletService";
import { collectReceivable, payPayable, createReceivable } from "@/services/creditService";
import { recordBillerTxn } from "@/services/billerService";
import { roundUpBillMinor } from "./billRound";
import { recordMoneyService } from "@/services/moneyService";
import { updateRepairDetails, updateRepairStatus } from "@/services/repairService";
import { technicianPerformance } from "@/services/technicianService";
import { findRepairJob, VOUCHER_LIKE } from "./repairLookup";
import { nextStatuses, REPAIR_STATUS_LABELS, REPAIR_STATUS_MM, type RepairStatus } from "./repairStatus";
import { ApiError } from "./api";
import {
  notifyAuditFeed, incomeExpenseNotice, transferNotice, moneyServiceNotice, creditPayableNotice, newCreditNotice,
  billerNotice, repairStatusNotice,
} from "./telegramNotify";
import {
  sendMessage, sendChatAction, answerCallbackQuery, deleteMessage,
  keyboard, btn, TgUpdate,
} from "./telegram";
import { providerCandidates, loadAiKey, removeAiKey, saveAiKey, PROVIDER_NAME, type AiProvider } from "./aiKey";
import { AiError, askShopAgent, checkAiKey } from "./aiAgent";
import { questionsNoticeGiven, recordAiQuestion } from "./aiQuestions";
import type { FeatureKey, FeatureVisibility } from "./modules";
import { loadModuleAccess } from "./moduleAccess";
import { hiddenStandardKeys } from "./incomeCategories";

// ---------------------------------------------------------------------------
// Session state: one row per (owner user, chat), tracking the guided-entry
// flow currently in progress (if any). "step" encodes "<flow>.<stage>".
// Keyed by owner user too: a Telegram private chat's id is the account's own
// id, so in principle the same person could message two different users'
// bots — each gets its own session.
// ---------------------------------------------------------------------------

async function getSession(ownerUserId: string, chatId: string) {
  const row = await prisma.telegramSession.findUnique({ where: { ownerUserId_chatId: { ownerUserId, chatId } } });
  if (!row) return null;
  return { step: row.step, data: JSON.parse(row.data) as Record<string, unknown> };
}

async function setSession(ownerUserId: string, chatId: string, step: string, data: Record<string, unknown>) {
  await prisma.telegramSession.upsert({
    where: { ownerUserId_chatId: { ownerUserId, chatId } },
    create: { ownerUserId, chatId, step, data: JSON.stringify(data) },
    update: { step, data: JSON.stringify(data) },
  });
}

async function clearSession(ownerUserId: string, chatId: string) {
  await prisma.telegramSession.deleteMany({ where: { ownerUserId, chatId } });
}

// ---------------------------------------------------------------------------
// Account resolution: each webhook URL belongs to exactly one Mahar Mini POS
// user (their own bot). The first chat to ever message that bot auto-binds
// as telegramChatId; anyone else gets turned away.
// ---------------------------------------------------------------------------

type ResolveResult =
  | { kind: "ok"; user: AuthUser; justLinked: boolean }
  | { kind: "not_found" }
  | { kind: "chat_mismatch" };

async function resolveOwner(ownerUserId: string, chatId: string): Promise<ResolveResult> {
  const row = await prisma.user.findUnique({
    where: { id: ownerUserId },
    include: { role: true, branches: true },
  });
  if (!row || !row.active || row.deletedAt) return { kind: "not_found" };

  let justLinked = false;
  if (!row.telegramChatId) {
    await prisma.user.update({ where: { id: ownerUserId }, data: { telegramChatId: chatId } });
    justLinked = true;
  } else if (row.telegramChatId !== chatId) {
    return { kind: "chat_mismatch" };
  }

  let permissions: string[];
  try {
    permissions = JSON.parse(row.role.permissions) as string[];
  } catch (e) {
    console.error(`[telegram] bad permissions JSON for role ${row.roleId}:`, e);
    return { kind: "not_found" };
  }

  return {
    kind: "ok",
    justLinked,
    user: {
      id: row.id,
      businessId: row.businessId,
      name: row.name,
      username: row.username,
      roleName: row.role.name,
      permissions,
      allBranches: row.allBranches,
      branchIds: row.branches.map((b) => b.branchId),
      commissionRate: row.commissionRate,
    },
  };
}

async function defaultBranchId(user: AuthUser): Promise<string | null> {
  const branch = await prisma.branch.findFirst({
    where: { businessId: user.businessId, active: true, ...branchScope(user) },
    orderBy: { createdAt: "asc" },
  });
  return branch?.id ?? null;
}

function can(user: AuthUser, perm: string): boolean {
  return user.permissions.includes(perm);
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

async function businessFeatures(businessId: string): Promise<FeatureVisibility> {
  return (await loadModuleAccess(businessId)).features;
}

function mainMenu(user: AuthUser, features: FeatureVisibility) {
  const row1 = [];
  if (features.incomeExpense && can(user, "income_expense.create")) row1.push(btn("💰 ဝင်ငွေ", "menu:income"));
  if (features.incomeExpense && can(user, "income_expense.create")) row1.push(btn("💸 ထွက်ငွေ", "menu:expense"));
  const row2 = [];
  if (features.transfers && can(user, "wallet.transfer")) row2.push(btn("🔁 ငွေလွှဲ", "menu:transfer"));
  if (features.withdraw && can(user, "wallet.withdraw")) row2.push(btn("➖ ငွေထုတ်", "menu:withdraw"));
  const row2b = [];
  if (features.transfers && can(user, "wallet.transfer")) row2b.push(btn("💸 ငွေလွဲ / ငွေထုတ် ပေး", "menu:money"));
  const row3 = [];
  if (features.credit && can(user, "credit.create")) row3.push(btn("🆕 အကြွေးသစ်", "menu:newcredit"));
  if (features.credit && can(user, "credit.collect")) row3.push(btn("🤝 အကြွေးကောက်", "menu:credit"));
  if (features.credit && can(user, "payable.pay")) row3.push(btn("📤 ပေးရန်ငွေ ချေ", "menu:payable"));
  const row4 = [];
  if (features.biller && can(user, "biller.trade")) row4.push(btn("📱 ဖုန်းဘေဖြည့်", "menu:topup"));
  const row5 = [];
  if (features.repair && can(user, "repair.update")) row5.push(btn("🔧 ပြင်ဆင်မှု အခြေအနေ", "menu:repair"));
  if (features.repair && can(user, "repair.view")) row5.push(btn("📊 ကျွန်ုပ်၏ ပြင်ဆင်မှုများ", "menu:myrepairs"));
  // Everyone can ask; what the answer may draw on is held to their own permissions.
  const row6 = [btn("🤖 AI ကို မေးရန်", "menu:ai")];
  const rows = [row1, row2, row2b, row3, row4, row5, row6].filter((r) => r.length > 0);
  return keyboard(rows);
}

async function showMenu(chatId: string, user: AuthUser, greeting?: string) {
  await clearSession(user.id, chatId);
  const features = await businessFeatures(user.businessId);
  const text = greeting ?? `${user.name} (${user.roleName})\nဘာကို မှတ်တမ်းတင်မလဲ ရွေးပါ:`;
  await sendMessage(chatId, text, { replyMarkup: mainMenu(user, features) });
}

const CANCEL_ROW = [btn("✕ မလုပ်တော့ပါ", "cancel")];
const SKIP_ROW = [btn("ကျော်မည် →", "skip")];

function money(n: string): string {
  return fmtMoney(toMinor(n).toString());
}

// ---------------------------------------------------------------------------
// Shared: wallet picker
// ---------------------------------------------------------------------------

async function walletButtons(businessId: string, branchId: string, currency?: string, walletType?: string) {
  const base = {
    businessId, active: true, deletedAt: null,
    OR: [{ branchId }, { branchId: null }],
    ...(currency ? { currency } : {}),
  };
  let wallets = await prisma.wallet.findMany({ where: { ...base, ...(walletType ? { type: walletType } : {}) }, orderBy: { name: "asc" } });
  if (walletType && wallets.length === 0) {
    // Fall back to any wallet if the business has no wallet of the preferred type yet.
    wallets = await prisma.wallet.findMany({ where: base, orderBy: { name: "asc" } });
  }
  return { wallets, rows: wallets.map((w) => [btn(`${w.name} (${fmtMoney(w.currentBalance)} ${w.currency})`, `w:${w.id}`)]) };
}

// ---------------------------------------------------------------------------
// Top-up biller flow — selling air-time off a float, or buying more of it.
//
// Both figures are asked for separately because they are rarely equal, and the
// difference is the shop's whole margin on air-time. See billerService.
// ---------------------------------------------------------------------------

async function startBiller(chatId: string, user: AuthUser) {
  const branchId = await defaultBranchId(user);
  if (!branchId) return sendMessage(chatId, "သင့်အကောင့်အတွက် ဆိုင်ခွဲ မရှိပါ။");
  const billers = await prisma.biller.findMany({
    where: { businessId: user.businessId, active: true, deletedAt: null },
    orderBy: { name: "asc" },
  });
  if (billers.length === 0) {
    return sendMessage(chatId, "ဖုန်းဘေ Biller မထည့်ရသေးပါ။ Mahar Mini POS ရဲ့ Top-up Billers မှာ ထည့်ပါ။");
  }
  const rows = billers.map((b) => [btn(`${b.name} (${fmtMoney(b.currentBalance)})`, `b:${b.id}`)]);
  await setSession(user.id, chatId, "bl.biller", { branchId });
  await sendMessage(chatId, "📱 ဖုန်းဘေဖြည့်\n\nဘယ် Operator လဲ?", { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function blStepBiller(chatId: string, user: AuthUser, data: Record<string, unknown>, billerId: string) {
  const biller = await prisma.biller.findFirst({
    where: { id: billerId, businessId: user.businessId, deletedAt: null },
  });
  if (!biller) return sendMessage(chatId, "Biller ကို မတွေ့ပါ။ /menu နှိပ်ပြီး ပြန်စပါ။");

  const rows = [[btn("📤 ဖောက်သည်ကို ရောင်း", "k:SALE")]];
  // Buying float moves money out of the shop, so it is offered only to whoever is
  // trusted with that on the web side too.
  if (can(user, "biller.manage")) rows.push([btn("📥 ဘေလက်ကျန် ဝယ်", "k:TOPUP")]);

  await setSession(user.id, chatId, "bl.kind", {
    ...data,
    billerId,
    billerName: biller.name,
    billerBalance: biller.currentBalance.toString(),
    sellPercent: biller.sellPercent,
  });
  await sendMessage(
    chatId,
    `${biller.name}\nလက်ရှိ ဘေလက်ကျန်: ${fmtMoney(biller.currentBalance)}\n\nဘာကို မှတ်မလဲ?`,
    { replyMarkup: keyboard([...rows, CANCEL_ROW]) }
  );
}

/** What the operator puts back into the balance on a sale, as the web page works it out
 *  (whole kyats of the amount × the biller's sell commission). */
function saleCommission(data: Record<string, unknown>): bigint {
  const pct = Number(data.sellPercent) || 0;
  if (data.kind !== "SALE" || pct <= 0) return 0n;
  const faceKs = Number(BigInt(String(data.face)) / 100n);
  return BigInt(Math.max(Math.round(faceKs * pct / 100), 0)) * 100n;
}

async function blStepKind(chatId: string, user: AuthUser, data: Record<string, unknown>, kind: string) {
  await setSession(user.id, chatId, "bl.face", { ...data, kind });
  const prompt = kind === "TOPUP"
    ? "Operator က ဘေ ဘယ်လောက် ပေးလဲ? (မျက်နှာစာ တန်ဖိုး)"
    : "ဖောက်သည် ဘေ ဘယ်လောက် ရလဲ? (မျက်နှာစာ တန်ဖိုး)";
  await sendMessage(chatId, `${data.billerName}\n\n${prompt}`, { replyMarkup: keyboard([CANCEL_ROW]) });
}

async function blStepFaceText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  if (!isValidDecimalString(text)) return sendMessage(chatId, "ဂဏန်း ရိုက်ထည့်ပါ၊ ဥပမာ 10000");
  const face = toMinor(text);
  if (face <= 0n) return sendMessage(chatId, "ပမာဏက သုညထက် များရပါမယ်။");
  await setSession(user.id, chatId, "bl.cash", { ...data, face: face.toString() });
  const prompt = data.kind === "TOPUP" ? "ငွေသား ဘယ်လောက် ပေးခဲ့လဲ?" : "ဖောက်သည် ငွေသား ဘယ်လောက် ပေးလဲ?";
  // A bill sells for a round sum: offered as a button, the next thousand up.
  const round = data.kind === "SALE" ? roundUpBillMinor(face) : 0n;
  await sendMessage(chatId, `${prompt}\n\nလျှော့ဈေး မရှိရင် ပမာဏ အတူတူ ပို့ပါ။`, {
    replyMarkup: keyboard([...(round > 0n ? [[btn(`💵 ${fmtMoney(round)}`, `c:${(round / 100n).toString()}`)]] : []), CANCEL_ROW]),
  });
}

async function blStepCashText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  if (!isValidDecimalString(text)) return sendMessage(chatId, "ဂဏန်း ရိုက်ထည့်ပါ၊ ဥပမာ 10000");
  const cash = toMinor(text);
  if (cash < 0n) return sendMessage(chatId, "ငွေသားက အနုတ် မဖြစ်ရပါ။");
  const { rows } = await walletButtons(user.businessId, String(data.branchId ?? ""), "MMK");
  if (rows.length === 0) return sendMessage(chatId, "MMK wallet မရှိပါ။ Mahar Mini POS မှာ အရင် ဖွင့်ပါ။");
  await setSession(user.id, chatId, "bl.wallet", { ...data, cash: cash.toString() });
  const prompt = data.kind === "TOPUP" ? "ငွေသား ဘယ် wallet ကနေ ထွက်လဲ?" : "ငွေသား ဘယ် wallet ထဲ ဝင်လဲ?";
  await sendMessage(chatId, prompt, { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function blStepWallet(chatId: string, user: AuthUser, data: Record<string, unknown>, walletId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return sendMessage(chatId, "Wallet မတွေ့ပါ။ /menu နှိပ်ပြီး ပြန်စပါ။");

  const kind = String(data.kind);
  const face = BigInt(String(data.face));
  const cash = BigInt(String(data.cash));
  const balance = BigInt(String(data.billerBalance));
  const commission = saleCommission(data);
  const margin = kind === "TOPUP" ? face - cash : cash - face + commission;
  const after = kind === "TOPUP" ? balance + face : balance - face + commission;

  await setSession(user.id, chatId, "bl.confirm", { ...data, walletId, walletName: wallet.name });
  const lines = [
    kind === "TOPUP" ? "📥 ဘေလက်ကျန် ဝယ်" : "📤 ဖောက်သည်ကို ရောင်း",
    `${data.billerName}`,
    `ဘေ: ${fmtMoney(face)}`,
    `ငွေသား: ${fmtMoney(cash)} (${wallet.name} ${kind === "TOPUP" ? "မှ ထွက်" : "ထဲ ဝင်"})`,
    ...(commission > 0n ? [`Commission ပြန်ရ: ${fmtMoney(commission)}`] : []),
    `အမြတ်: ${fmtMoney(margin)}${kind === "SALE" && margin > 0n ? " (ဝင်ငွေ Bill Profit ထဲ ထည့်မည်)" : ""}`,
    `ပြီးရင် ဘေလက်ကျန်: ${fmtMoney(after)}`,
  ];
  await sendMessage(chatId, lines.join("\n"), {
    replyMarkup: keyboard([[btn("✅ အတည်ပြု", "confirm:yes"), btn("✕ မလုပ်တော့ပါ", "confirm:no")]]),
  });
}

async function blConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  try {
    const txn = await prisma.$transaction((tx) =>
      recordBillerTxn(tx, {
        businessId: user.businessId,
        userId: user.id,
        branchId: String(data.branchId ?? "") || undefined,
        billerId: String(data.billerId),
        kind: String(data.kind) as "TOPUP" | "SALE",
        faceAmount: BigInt(String(data.face)),
        cashAmount: BigInt(String(data.cash)),
        commission: saleCommission(data),
        walletId: String(data.walletId),
      })
    );
    await clearSession(user.id, chatId);
    await sendMessage(chatId, `✅ သိမ်းပြီး — ${txn.txnNo}`);
    notifyAuditFeed(
      user.businessId,
      billerNotice({
        txnNo: txn.txnNo,
        kind: txn.kind,
        billerName: String(data.billerName),
        faceAmount: txn.faceAmount,
        cashAmount: txn.cashAmount,
        profit: txn.profit,
        balanceAfter: txn.balanceAfter,
        createdByName: user.name,
      }),
      chatId
    );
    // Bought float with cash: ask, as the web app does, whether the cash goes into expense.
    if (txn.kind === "TOPUP" && txn.cashAmount > 0n && txn.walletId) {
      await setSession(user.id, chatId, "bl.expense", { txnId: txn.id, txnNo: txn.txnNo, cash: txn.cashAmount.toString(), billerName: data.billerName });
      await sendMessage(
        chatId,
        `ဘေဝယ်ငွေ ${fmtMoney(txn.cashAmount)} ကို ထွက်ငွေ (Daily Bill Expense) ထဲ ထည့်မလား?\n\nငွေက ဒီဝယ်ယူမှုနဲ့ wallet ထဲက ထွက်ပြီးပါပြီ — ထွက်ငွေ စာရင်းမှာ မှတ်ရုံပဲ ဖြစ်လို့ နှစ်ခါ မနှုတ်ပါ။`,
        { replyMarkup: keyboard([[btn("✅ ထွက်ငွေထဲ ထည့်မည်", "fx:yes"), btn("မထည့်ပါ", "fx:no")]]) }
      );
      return;
    }
    await showMenu(chatId, user);
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "အမှားတစ်ခု ဖြစ်သွားပါတယ်။"}`);
  }
}

/** "Add to expense" after buying float: records the purchase as Daily Bill Expense, once. */
async function blAddExpense(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  if (!(await claimConfirm(user.id, chatId, "bl.expense"))) return sendMessage(chatId, "⏳ သိမ်းနေပြီးသားပါ၊ ခဏစောင့်ပါ…");
  try {
    await prisma.$transaction((tx) => recordFloatExpense(tx, { businessId: user.businessId, userId: user.id, billerTxnId: String(data.txnId) }));
    await clearSession(user.id, chatId);
    notifyAuditFeed(user.businessId, `💸 ထွက်ငွေ — ${fmtMoney(BigInt(String(data.cash)))} · Daily Bill Expense\nဘေဝယ် ${data.billerName ?? ""} (${data.txnNo})\n👤 ${user.name}`, chatId);
    await showMenu(chatId, user, `✅ ${fmtMoney(BigInt(String(data.cash)))} ကို ထွက်ငွေထဲ ထည့်ပြီးပါပြီ။`);
  } catch (e) {
    await prisma.telegramSession.updateMany({ where: { ownerUserId: user.id, chatId, step: "bl.saving" }, data: { step: "bl.expense" } });
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "အမှားတစ်ခု ဖြစ်သွားပါတယ်။"}`);
  }
}

// ---------------------------------------------------------------------------
// Income / Expense / Withdraw flow — shares one implementation; WITHDRAW
// skips the category step.
// ---------------------------------------------------------------------------

async function startIncomeExpense(chatId: string, user: AuthUser, type: "INCOME" | "EXPENSE" | "WITHDRAW") {
  const branchId = await defaultBranchId(user);
  if (!branchId) return sendMessage(chatId, "သင့်အကောင့်အတွက် ဆိုင်ခွဲ မရှိပါ။ Admin ကို ဆက်သွယ်ပါ။");
  const { rows } = await walletButtons(user.businessId, branchId, undefined, type === "WITHDRAW" ? "CASH" : undefined);
  if (rows.length === 0) return sendMessage(chatId, "Wallet မရှိပါ။ Mahar Mini POS မှာ အရင် ဖွင့်ပါ။");
  await setSession(user.id, chatId, `ie.wallet`, { type, branchId });
  const label = type === "INCOME" ? "💰 ဝင်ငွေ" : type === "EXPENSE" ? "💸 ထွက်ငွေ" : "➖ ငွေထုတ်";
  await sendMessage(chatId, `${label}\n\nဘယ် wallet လဲ?`, { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function ieStepWallet(chatId: string, user: AuthUser, data: Record<string, unknown>, walletId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return sendMessage(chatId, "Wallet မတွေ့ပါ။ /menu နှိပ်ပြီး ပြန်စပါ။");
  const type = data.type as string;
  if (type === "WITHDRAW") {
    await setSession(user.id, chatId, "ie.amount", { ...data, walletId, walletName: wallet.name, currency: wallet.currency });
    return sendMessage(chatId, `Wallet: ${wallet.name}\n\nထုတ်မယ့် ပမာဏ ရိုက်ထည့်ပါ (${wallet.currency}):`, {
      replyMarkup: keyboard([CANCEL_ROW]),
    });
  }
  const hidden: (string | null)[] = hiddenStandardKeys(await businessFeatures(user.businessId));
  const categories = (await prisma.category.findMany({
    where: { businessId: user.businessId, active: true, type },
    orderBy: { name: "asc" },
  })).filter((c) => !hidden.includes(c.systemKey));
  const rows = categories.map((c) => [btn(c.name, `cat:${c.name}`)]);
  rows.push([btn("+ အမျိုးအစားသစ်", "cat:__new__")]);
  await setSession(user.id, chatId, "ie.category", { ...data, walletId, walletName: wallet.name, currency: wallet.currency });
  await sendMessage(chatId, `Wallet: ${wallet.name}\n\nအမျိုးအစား ရွေးပါ:`, { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function ieStepCategoryPick(chatId: string, user: AuthUser, data: Record<string, unknown>, catData: string) {
  if (catData === "__new__") {
    await setSession(user.id, chatId, "ie.category_new", data);
    return sendMessage(chatId, "အမျိုးအစားသစ် နာမည် ရိုက်ထည့်ပါ:", { replyMarkup: keyboard([CANCEL_ROW]) });
  }
  await setSession(user.id, chatId, "ie.amount", { ...data, categoryName: catData });
  return sendMessage(chatId, `အမျိုးအစား: ${catData}\n\nပမာဏ ရိုက်ထည့်ပါ (${data.currency}):`, { replyMarkup: keyboard([CANCEL_ROW]) });
}

async function ieStepCategoryNewText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const name = text.trim();
  if (!name) return sendMessage(chatId, "အမျိုးအစား နာမည် ဗလာ မဖြစ်ရပါ။ ပြန်ရိုက်ပါ:");
  await prisma.category.upsert({
    where: { businessId_type_name: { businessId: user.businessId, type: data.type as string, name } },
    create: { businessId: user.businessId, type: data.type as string, name },
    update: { active: true },
  });
  await setSession(user.id, chatId, "ie.amount", { ...data, categoryName: name });
  return sendMessage(chatId, `အမျိုးအစား: ${name}\n\nပမာဏ ရိုက်ထည့်ပါ (${data.currency}):`, { replyMarkup: keyboard([CANCEL_ROW]) });
}

async function ieStepAmountText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const raw = text.trim().replace(/,/g, "");
  if (!isValidDecimalString(raw) || Number(raw) <= 0) return sendMessage(chatId, "မှန်ကန်တဲ့ ပမာဏ ရိုက်ထည့်ပါ၊ ဥပမာ 5000");
  const type = data.type as string;
  const nextData = { ...data, amount: raw };
  if (type === "WITHDRAW") {
    await setSession(user.id, chatId, "ie.description", nextData);
    return sendMessage(chatId, "အကြောင်းရင်း (မရှိရင် ကျော်ပါ):", { replyMarkup: keyboard([SKIP_ROW, CANCEL_ROW]) });
  }
  await setSession(user.id, chatId, "ie.description", nextData);
  return sendMessage(chatId, "မှတ်ချက် (မရှိရင် ကျော်ပါ):", { replyMarkup: keyboard([SKIP_ROW, CANCEL_ROW]) });
}

async function ieAskConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  const type = data.type as string;
  const label = type === "INCOME" ? "ဝင်ငွေ" : type === "EXPENSE" ? "ထွက်ငွေ" : "ငွေထုတ်";
  const lines = [
    `${label} အတည်ပြုပါ`,
    `Wallet: ${data.walletName}`,
    data.categoryName ? `အမျိုးအစား: ${data.categoryName}` : undefined,
    `ပမာဏ: ${money(data.amount as string)} ${data.currency}`,
    data.description ? `မှတ်ချက်: ${data.description}` : undefined,
  ].filter(Boolean);
  await setSession(user.id, chatId, "ie.confirm", data);
  await sendMessage(chatId, lines.join("\n"), { replyMarkup: keyboard([[btn("✅ အတည်ပြု", "confirm:yes"), btn("✕ မလုပ်တော့ပါ", "confirm:no")]]) });
}

async function ieStepDescriptionText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  await ieAskConfirm(chatId, user, { ...data, description: text.trim() });
}

async function ieStepDescriptionSkip(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  await ieAskConfirm(chatId, user, data);
}

async function ieConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  try {
    const item = await prisma.$transaction((tx) =>
      createIncomeExpenseEntry(tx, {
        businessId: user.businessId,
        branchId: data.branchId as string,
        userId: user.id,
        type: data.type as "INCOME" | "EXPENSE" | "WITHDRAW",
        categoryName: data.categoryName as string | undefined,
        amount: toMinor(data.amount as string),
        walletId: data.walletId as string,
        date: todayBusinessDate(),
        description: data.description as string | undefined,
      })
    );
    await clearSession(user.id, chatId);
    await sendMessage(chatId, `✅ သိမ်းပြီး — ${item.txnNo}`);
    notifyAuditFeed(user.businessId, incomeExpenseNotice({
      txnNo: item.txnNo, type: item.type, categoryName: item.categoryName ?? "—",
      amount: item.amount, currency: item.currency, createdByName: user.name,
      description: item.description,
    }), chatId);
    await showMenu(chatId, user);
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "အမှားတစ်ခု ဖြစ်သွားပါတယ်။"}`);
  }
}

// ---------------------------------------------------------------------------
// Transfer flow
// ---------------------------------------------------------------------------

async function startTransfer(chatId: string, user: AuthUser) {
  const branchId = await defaultBranchId(user);
  if (!branchId) return sendMessage(chatId, "သင့်အကောင့်အတွက် ဆိုင်ခွဲ မရှိပါ။");
  const { rows } = await walletButtons(user.businessId, branchId);
  if (rows.length < 2) return sendMessage(chatId, "ငွေလွှဲဖို့ wallet အနည်းဆုံး နှစ်ခု လိုပါတယ်။");
  await setSession(user.id, chatId, "tr.source", { branchId });
  await sendMessage(chatId, "🔁 ငွေလွှဲ\n\nဘယ် wallet ကနေ လွှဲမလဲ?", { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function trStepSource(chatId: string, user: AuthUser, data: Record<string, unknown>, walletId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return sendMessage(chatId, "Wallet မတွေ့ပါ။");
  const { rows } = await walletButtons(user.businessId, data.branchId as string);
  // Every wallet button carries a callback; the guard is for the type, since a button may
  // now carry a link instead.
  const filtered = rows.filter(
    (r) => !("callback_data" in r[0] && r[0].callback_data.endsWith(walletId))
  );
  await setSession(user.id, chatId, "tr.dest", { ...data, sourceWalletId: walletId, sourceName: wallet.name, sourceCurrency: wallet.currency });
  await sendMessage(chatId, `မှ: ${wallet.name}\n\nဘယ် wallet ကို လွှဲမလဲ?`, { replyMarkup: keyboard([...filtered, CANCEL_ROW]) });
}

async function trStepDest(chatId: string, user: AuthUser, data: Record<string, unknown>, walletId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return sendMessage(chatId, "Wallet မတွေ့ပါ။");
  await setSession(user.id, chatId, "tr.amount", { ...data, destWalletId: walletId, destName: wallet.name, destCurrency: wallet.currency });
  await sendMessage(chatId, `သို့: ${wallet.name}\n\nပမာဏ ရိုက်ထည့်ပါ (${data.sourceCurrency}):`, { replyMarkup: keyboard([CANCEL_ROW]) });
}

async function trStepAmountText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const raw = text.trim().replace(/,/g, "");
  if (!isValidDecimalString(raw) || Number(raw) <= 0) return sendMessage(chatId, "မှန်ကန်တဲ့ ပမာဏ ရိုက်ထည့်ပါ:");
  const nextData = { ...data, amount: raw };
  if (data.sourceCurrency !== data.destCurrency) {
    await setSession(user.id, chatId, "tr.rate", nextData);
    return sendMessage(chatId, `ငွေလဲနှုန်း (1 ${data.sourceCurrency} = ? ${data.destCurrency}):`, { replyMarkup: keyboard([CANCEL_ROW]) });
  }
  await setSession(user.id, chatId, "tr.fee", nextData);
  return sendMessage(chatId, "လွှဲခ (မရှိရင် ကျော်ပါ):", { replyMarkup: keyboard([SKIP_ROW, CANCEL_ROW]) });
}

async function trStepRateText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const raw = text.trim().replace(/,/g, "");
  if (!isValidDecimalString(raw) || Number(raw) <= 0) return sendMessage(chatId, "မှန်ကန်တဲ့ နှုန်း ရိုက်ထည့်ပါ:");
  await setSession(user.id, chatId, "tr.fee", { ...data, rate: raw });
  return sendMessage(chatId, "လွှဲခ (မရှိရင် ကျော်ပါ):", { replyMarkup: keyboard([SKIP_ROW, CANCEL_ROW]) });
}

async function trAskConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  const lines = [
    "ငွေလွှဲ အတည်ပြုပါ",
    `${data.sourceName} → ${data.destName}`,
    `ပမာဏ: ${money(data.amount as string)} ${data.sourceCurrency}`,
    data.rate ? `နှုန်း: ${data.rate}` : undefined,
    `လွှဲခ: ${money((data.fee as string) ?? "0")}`,
  ].filter(Boolean);
  await setSession(user.id, chatId, "tr.confirm", data);
  await sendMessage(chatId, lines.join("\n"), { replyMarkup: keyboard([[btn("✅ အတည်ပြု", "confirm:yes"), btn("✕ မလုပ်တော့ပါ", "confirm:no")]]) });
}

async function trStepFeeText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const raw = text.trim().replace(/,/g, "");
  if (!isValidDecimalString(raw)) return sendMessage(chatId, "မှန်ကန်တဲ့ လွှဲခ ရိုက်ထည့်ပါ (သို့) ကျော်ပါ:");
  await trAskConfirm(chatId, user, { ...data, fee: raw });
}

async function trStepFeeSkip(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  await trAskConfirm(chatId, user, { ...data, fee: "0" });
}

async function trConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  try {
    const transfer = await prisma.$transaction((tx) =>
      createTransfer(tx, {
        businessId: user.businessId,
        userId: user.id,
        sourceWalletId: data.sourceWalletId as string,
        destWalletId: data.destWalletId as string,
        amount: data.amount as string,
        rate: data.rate as string | undefined,
        fee: (data.fee as string) ?? "0",
      })
    );
    await clearSession(user.id, chatId);
    await sendMessage(chatId, `✅ လွှဲပြီး — ${transfer.txnNo}`);
    notifyAuditFeed(user.businessId, transferNotice({
      txnNo: transfer.txnNo,
      sourceName: data.sourceName as string, destName: data.destName as string,
      sourceAmount: transfer.sourceAmount, sourceCurrency: data.sourceCurrency as string,
      destAmount: transfer.destAmount, destCurrency: data.destCurrency as string,
      createdByName: user.name,
    }), chatId);
    await showMenu(chatId, user);
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "အမှားတစ်ခု ဖြစ်သွားပါတယ်။"}`);
  }
}

// ---------------------------------------------------------------------------
// Money transfer / cash-out for a customer through KBZPay / Wave, with the shop's fee.
// The fee goes into income by itself. See moneyService.
// ---------------------------------------------------------------------------

async function startMoneyService(chatId: string, user: AuthUser) {
  const branchId = await defaultBranchId(user);
  if (!branchId) return sendMessage(chatId, "သင့်အကောင့်အတွက် ဆိုင်ခွဲ မရှိပါ။");
  const { rows } = await walletButtons(user.businessId, branchId, "MMK");
  if (rows.length < 2) return sendMessage(chatId, "KBZPay / Wave wallet နဲ့ ငွေသား wallet နှစ်ခု လိုပါတယ်။");
  await setSession(user.id, chatId, "ms.kind", { branchId });
  await sendMessage(chatId, "💸 ငွေလွဲ / ငွေထုတ် ပေး\n\nဘာလုပ်ပေးမလဲ?", {
    replyMarkup: keyboard([[btn("💸 ငွေလွဲပေး", "mk:TRANSFER"), btn("💵 ငွေထုတ်ပေး", "mk:CASHOUT")], CANCEL_ROW]),
  });
}

async function msStepKind(chatId: string, user: AuthUser, data: Record<string, unknown>, kind: string) {
  if (kind !== "TRANSFER" && kind !== "CASHOUT") return;
  const { rows } = await walletButtons(user.businessId, String(data.branchId), "MMK", "MOBILE");
  await setSession(user.id, chatId, "ms.account", { ...data, kind });
  await sendMessage(chatId, kind === "TRANSFER" ? "ဘယ် KBZPay / Wave ကနေ လွဲပေးလဲ?" : "ဘယ် KBZPay / Wave ထဲ ဝင်လဲ?", { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function msStepAccount(chatId: string, user: AuthUser, data: Record<string, unknown>, walletId: string) {
  const wallet = await prisma.wallet.findFirst({ where: { id: walletId, businessId: user.businessId } });
  if (!wallet) return sendMessage(chatId, "Wallet မတွေ့ပါ။");
  const { rows } = await walletButtons(user.businessId, String(data.branchId), "MMK", "CASH");
  const others = rows.filter((r) => !("callback_data" in r[0] && r[0].callback_data.endsWith(walletId)));
  await setSession(user.id, chatId, "ms.cash", { ...data, accountWalletId: walletId, accountName: wallet.name });
  await sendMessage(chatId, data.kind === "TRANSFER" ? "ငွေသား ဘယ် wallet ထဲ ဝင်လဲ?" : "ငွေသား ဘယ် wallet ကနေ ပေးလဲ?", { replyMarkup: keyboard([...others, CANCEL_ROW]) });
}

async function msStepCash(chatId: string, user: AuthUser, data: Record<string, unknown>, walletId: string) {
  const wallet = await prisma.wallet.findFirst({ where: { id: walletId, businessId: user.businessId } });
  if (!wallet) return sendMessage(chatId, "Wallet မတွေ့ပါ။");
  await setSession(user.id, chatId, "ms.amount", { ...data, cashWalletId: walletId, cashName: wallet.name });
  await sendMessage(chatId, data.kind === "TRANSFER" ? "လွဲပေးမယ့် ပမာဏ ရိုက်ထည့်ပါ:" : "KBZPay / Wave ထဲ ဝင်တဲ့ ပမာဏ ရိုက်ထည့်ပါ:", { replyMarkup: keyboard([CANCEL_ROW]) });
}

async function msStepAmountText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const raw = text.trim().replace(/,/g, "");
  if (!isValidDecimalString(raw) || Number(raw) <= 0) return sendMessage(chatId, "မှန်ကန်တဲ့ ပမာဏ ရိုက်ထည့်ပါ:");
  await setSession(user.id, chatId, "ms.fee", { ...data, amount: raw });
  await sendMessage(chatId, "ခ ဘယ်လောက် ယူလဲ? (ဆိုင်ရဲ့ ဝင်ငွေ — မရှိရင် ကျော်ပါ)", { replyMarkup: keyboard([SKIP_ROW, CANCEL_ROW]) });
}

async function msAskConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>, feeRaw: string) {
  const raw = feeRaw.trim().replace(/,/g, "") || "0";
  if (!isValidDecimalString(raw) || Number(raw) < 0) return sendMessage(chatId, "မှန်ကန်တဲ့ ခ ရိုက်ထည့်ပါ (သို့) ကျော်ပါ:");
  const amount = toMinor(String(data.amount));
  const fee = toMinor(raw);
  const transfer = data.kind === "TRANSFER";
  if (!transfer && fee >= amount) return sendMessage(chatId, "ခ က ပမာဏထက် နည်းရပါမယ်။");
  const lines = transfer
    ? ["💸 ငွေလွဲပေး", `ပမာဏ: ${fmtMoney(amount)} (${data.accountName} မှ လွဲ)`, `ခ: ${fmtMoney(fee)}`, `ဖောက်သည် ငွေသား ပေးရ: ${fmtMoney(amount + fee)} (${data.cashName} ထဲ ဝင်)`]
    : ["💵 ငွေထုတ်ပေး", `ပမာဏ: ${fmtMoney(amount)} (${data.accountName} ထဲ ဝင်)`, `ခ: ${fmtMoney(fee)}`, `ဖောက်သည်ကို ငွေသား ပေး: ${fmtMoney(amount - fee)} (${data.cashName} မှ)`];
  if (fee > 0n) lines.push("ခ ကို ဝင်ငွေ (Transfer & Cash-out Fee) ထဲ အလိုလို ထည့်ပါမယ်။");
  await setSession(user.id, chatId, "ms.confirm", { ...data, fee: raw });
  await sendMessage(chatId, lines.join("\n"), { replyMarkup: keyboard([[btn("✅ အတည်ပြု", "confirm:yes"), btn("✕ မလုပ်တော့ပါ", "confirm:no")]]) });
}

async function msConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  try {
    const record = await prisma.$transaction((tx) =>
      recordMoneyService(tx, {
        businessId: user.businessId,
        userId: user.id,
        kind: data.kind === "CASHOUT" ? "CASHOUT" : "TRANSFER",
        accountWalletId: String(data.accountWalletId),
        cashWalletId: String(data.cashWalletId),
        amount: toMinor(String(data.amount)),
        fee: toMinor(String(data.fee ?? "0")),
      })
    );
    await clearSession(user.id, chatId);
    await sendMessage(chatId, `✅ သိမ်းပြီး — ${record.txnNo}`);
    notifyAuditFeed(user.businessId, moneyServiceNotice({
      kind: record.kind, txnNo: record.txnNo, accountName: record.accountName, cashName: record.cashName,
      amount: record.amount, fee: record.fee, createdByName: user.name,
    }), chatId);
    await showMenu(chatId, user);
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "အမှားတစ်ခု ဖြစ်သွားပါတယ်။"}`);
  }
}

// ---------------------------------------------------------------------------
// Credit / Payable flow — collect a payment against an existing receivable,
// or pay down an existing payable. Shares one implementation; "credit" and
// "payable" only differ in which model/party/service function they touch.
// ---------------------------------------------------------------------------

async function startCreditPayable(chatId: string, user: AuthUser, kind: "credit" | "payable") {
  const branchId = await defaultBranchId(user);
  if (!branchId) return sendMessage(chatId, "သင့်အကောင့်အတွက် ဆိုင်ခွဲ မရှိပါ။");

  const outstanding =
    kind === "credit"
      ? await prisma.receivable.findMany({
          where: { businessId: user.businessId, deletedAt: null, status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] } },
          include: { customer: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 15,
        })
      : await prisma.payable.findMany({
          where: { businessId: user.businessId, deletedAt: null, status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] } },
          include: { supplier: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 15,
        });
  if (outstanding.length === 0) {
    return sendMessage(chatId, kind === "credit" ? "ကောက်ရန် အကြွေး မရှိပါ။" : "ပေးရန်ငွေ မရှိပါ။");
  }

  const rows = outstanding.map((r) => {
    const partyName = kind === "credit"
      ? (r as typeof outstanding[number] & { customer: { name: string } }).customer.name
      : (r as typeof outstanding[number] & { supplier: { name: string } }).supplier.name;
    return [btn(`${partyName} — ${money(r.remainingAmount.toString())} ${r.currency} ကျန်`, `r:${r.id}`)];
  });
  await setSession(user.id, chatId, `cp.pick`, { kind, branchId });
  const label = kind === "credit" ? "🤝 အကြွေးကောက်" : "📤 ပေးရန်ငွေ ချေ";
  await sendMessage(chatId, `${label}\n\nဘယ်တစ်ခုလဲ?`, { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function cpStepPick(chatId: string, user: AuthUser, data: Record<string, unknown>, recordId: string) {
  const kind = data.kind as "credit" | "payable";
  const record = kind === "credit"
    ? await prisma.receivable.findUnique({ where: { id: recordId }, include: { customer: { select: { name: true } } } })
    : await prisma.payable.findUnique({ where: { id: recordId }, include: { supplier: { select: { name: true } } } });
  if (!record || record.businessId !== user.businessId) return sendMessage(chatId, "စာရင်း မတွေ့ပါ။ /menu နှိပ်ပြီး ပြန်စပါ။");
  const partyName = kind === "credit"
    ? (record as typeof record & { customer: { name: string } }).customer.name
    : (record as typeof record & { supplier: { name: string } }).supplier.name;

  await setSession(user.id, chatId, "cp.amount", {
    ...data, recordId, partyName, currency: record.currency, remaining: record.remainingAmount.toString(), txnNo: record.txnNo,
  });
  await sendMessage(
    chatId,
    `${partyName} — ${money(record.remainingAmount.toString())} ${record.currency} ကျန်\n\n${kind === "credit" ? "ဘယ်လောက် ကောက်ရလဲ" : "ဘယ်လောက် ပေးမလဲ"}?`,
    { replyMarkup: keyboard([CANCEL_ROW]) }
  );
}

async function cpStepAmountText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const raw = text.trim().replace(/,/g, "");
  if (!isValidDecimalString(raw) || Number(raw) <= 0) return sendMessage(chatId, "မှန်ကန်တဲ့ ပမာဏ ရိုက်ထည့်ပါ:");
  if (toMinor(raw) > BigInt(data.remaining as string)) return sendMessage(chatId, `ကျန်ငွေ ${money(data.remaining as string)} ${data.currency} ထက် များနေပါတယ်။ နည်းတဲ့ ပမာဏ ရိုက်ထည့်ပါ:`);
  const { rows } = await walletButtons(user.businessId, data.branchId as string, data.currency as string);
  if (rows.length === 0) return sendMessage(chatId, `${data.currency} wallet မရှိပါ။`);
  await setSession(user.id, chatId, "cp.wallet", { ...data, amount: raw });
  await sendMessage(chatId, "ဘယ် wallet လဲ?", { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function cpStepWallet(chatId: string, user: AuthUser, data: Record<string, unknown>, walletId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) return sendMessage(chatId, "Wallet မတွေ့ပါ။");
  const kind = data.kind as "credit" | "payable";
  const lines = [
    `${kind === "credit" ? "အကြွေးကောက်ခြင်း" : "ငွေပေးချေခြင်း"} အတည်ပြုပါ`,
    `${data.partyName} · ${data.txnNo}`,
    `ပမာဏ: ${money(data.amount as string)} ${data.currency}`,
    `Wallet: ${wallet.name}`,
  ];
  await setSession(user.id, chatId, "cp.confirm", { ...data, walletId, walletName: wallet.name });
  await sendMessage(chatId, lines.join("\n"), { replyMarkup: keyboard([[btn("✅ အတည်ပြု", "confirm:yes"), btn("✕ မလုပ်တော့ပါ", "confirm:no")]]) });
}

async function cpConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  try {
    const kind = data.kind as "credit" | "payable";
    const opts = {
      amount: toMinor(data.amount as string),
      walletId: data.walletId as string,
      date: todayBusinessDate(),
      userId: user.id,
      businessId: user.businessId,
    };
    if (kind === "credit") {
      await prisma.$transaction((tx) => collectReceivable(tx, { ...opts, receivableId: data.recordId as string }));
    } else {
      await prisma.$transaction((tx) => payPayable(tx, { ...opts, payableId: data.recordId as string }));
    }
    await clearSession(user.id, chatId);
    await sendMessage(chatId, `✅ သိမ်းပြီး — ${data.txnNo}`);
    notifyAuditFeed(user.businessId, creditPayableNotice({
      kind, txnNo: data.txnNo as string, partyName: data.partyName as string,
      amount: opts.amount, currency: data.currency as string, createdByName: user.name,
    }), chatId);
    await showMenu(chatId, user);
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "အမှားတစ်ခု ဖြစ်သွားပါတယ်။"}`);
  }
}

// ---------------------------------------------------------------------------
// New credit — record a new debt a customer now owes the business (as
// opposed to "Collect credit" above, which settles an existing one).
// ---------------------------------------------------------------------------

async function startNewCredit(chatId: string, user: AuthUser) {
  const branchId = await defaultBranchId(user);
  if (!branchId) return sendMessage(chatId, "သင့်အကောင့်အတွက် ဆိုင်ခွဲ မရှိပါ။");
  const customers = await prisma.contact.findMany({
    where: { businessId: user.businessId, type: "CUSTOMER", active: true, deletedAt: null },
    orderBy: { name: "asc" },
    take: 15,
  });
  const rows = customers.map((c) => [btn(c.name, `c:${c.id}`)]);
  rows.push([btn("+ ဖောက်သည်အသစ်", "c:__new__")]);
  await setSession(user.id, chatId, "nc.customer", { branchId });
  await sendMessage(chatId, "🆕 အကြွေးသစ်\n\nဘယ် ဖောက်သည်လဲ?", { replyMarkup: keyboard([...rows, CANCEL_ROW]) });
}

async function ncStepCustomerPick(chatId: string, user: AuthUser, data: Record<string, unknown>, customerId: string) {
  if (customerId === "__new__") {
    await setSession(user.id, chatId, "nc.customer_new", data);
    return sendMessage(chatId, "ဖောက်သည် နာမည် ရိုက်ထည့်ပါ:", { replyMarkup: keyboard([CANCEL_ROW]) });
  }
  const customer = await prisma.contact.findUnique({ where: { id: customerId } });
  if (!customer || customer.businessId !== user.businessId) return sendMessage(chatId, "ဖောက်သည် မတွေ့ပါ။ /menu နှိပ်ပြီး ပြန်စပါ။");
  await setSession(user.id, chatId, "nc.amount", { ...data, customerId, customerName: customer.name, currency: customer.currency });
  await sendMessage(chatId, `ဖောက်သည်: ${customer.name}\n\nအကြွေး ဘယ်လောက် ယူလဲ? (${customer.currency})`, {
    replyMarkup: keyboard([CANCEL_ROW]),
  });
}

async function ncStepCustomerNewText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const name = text.trim();
  if (!name) return sendMessage(chatId, "နာမည် ဗလာ မဖြစ်ရပါ။ ပြန်ရိုက်ပါ:");
  const customer = await prisma.contact.create({
    data: { businessId: user.businessId, branchId: data.branchId as string, name, type: "CUSTOMER" },
  });
  await setSession(user.id, chatId, "nc.amount", { ...data, customerId: customer.id, customerName: customer.name, currency: customer.currency });
  await sendMessage(chatId, `ဖောက်သည်: ${customer.name}\n\nအကြွေး ဘယ်လောက် ယူလဲ? (${customer.currency})`, {
    replyMarkup: keyboard([CANCEL_ROW]),
  });
}

async function ncStepAmountText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  const raw = text.trim().replace(/,/g, "");
  if (!isValidDecimalString(raw) || Number(raw) <= 0) return sendMessage(chatId, "မှန်ကန်တဲ့ ပမာဏ ရိုက်ထည့်ပါ:");
  await setSession(user.id, chatId, "nc.note", { ...data, amount: raw });
  await sendMessage(chatId, "မှတ်ချက် (မရှိရင် ကျော်ပါ):", { replyMarkup: keyboard([SKIP_ROW, CANCEL_ROW]) });
}

/** Ask which wallet the cash was handed out from. Handing out cash is optional —
 *  a credit sale moves goods, not money — so "no wallet" stays a first-class choice. */
async function ncAskWallet(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  const { rows } = await walletButtons(user.businessId, data.branchId as string, data.currency as string);
  await setSession(user.id, chatId, "nc.wallet", data);
  await sendMessage(
    chatId,
    "ငွေသား ဘယ် wallet ကနေ ထွက်လဲ?\n\nငွေ တကယ် ထုတ်ပေးခဲ့မှသာ wallet ရွေးပါ — ချက်ချင်း နုတ်ပါမယ်။ ပစ္စည်း အကြွေးရောင်းတာဆိုရင် \"Wallet မသုံးပါ\" ကို ရွေးပါ။",
    { replyMarkup: keyboard([...rows, [btn("⏭ Wallet မသုံးပါ (ပစ္စည်း အကြွေး)", "w:none")], CANCEL_ROW]) }
  );
}

async function ncStepWallet(chatId: string, user: AuthUser, data: Record<string, unknown>, walletId: string) {
  if (walletId === "none") return ncAskConfirm(chatId, user, data);
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet || wallet.businessId !== user.businessId) return sendMessage(chatId, "Wallet မတွေ့ပါ။");
  await ncAskConfirm(chatId, user, { ...data, walletId, walletName: wallet.name });
}

async function ncAskConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  const lines = [
    "အကြွေးသစ် အတည်ပြုပါ",
    `ဖောက်သည်: ${data.customerName}`,
    `ပမာဏ: ${money(data.amount as string)} ${data.currency}`,
    data.walletName ? `ထုတ်ပေးတဲ့ wallet: ${data.walletName}` : "ထုတ်ပေးတဲ့ wallet: — (ပစ္စည်း အကြွေး၊ ငွေသား မထွက်ပါ)",
    data.notes ? `မှတ်ချက်: ${data.notes}` : undefined,
  ].filter(Boolean);
  await setSession(user.id, chatId, "nc.confirm", data);
  await sendMessage(chatId, lines.join("\n"), { replyMarkup: keyboard([[btn("✅ အတည်ပြု", "confirm:yes"), btn("✕ မလုပ်တော့ပါ", "confirm:no")]]) });
}

async function ncStepNoteText(chatId: string, user: AuthUser, data: Record<string, unknown>, text: string) {
  await ncAskWallet(chatId, user, { ...data, notes: text.trim() });
}

async function ncStepNoteSkip(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  await ncAskWallet(chatId, user, data);
}

async function ncConfirm(chatId: string, user: AuthUser, data: Record<string, unknown>) {
  try {
    const rec = await prisma.$transaction((tx) =>
      createReceivable(tx, {
        businessId: user.businessId,
        branchId: data.branchId as string,
        userId: user.id,
        customerId: data.customerId as string,
        amount: toMinor(data.amount as string),
        currency: data.currency as string,
        creditDate: todayBusinessDate(),
        notes: data.notes as string | undefined,
        walletId: data.walletId as string | undefined,
      })
    );
    await clearSession(user.id, chatId);
    await sendMessage(chatId, `✅ သိမ်းပြီး — ${rec.txnNo}`);
    notifyAuditFeed(user.businessId, newCreditNotice({
      txnNo: rec.txnNo, customerName: data.customerName as string,
      amount: rec.originalAmount, currency: rec.currency, createdByName: user.name,
      notes: data.notes as string | undefined,
    }), chatId);
    await showMenu(chatId, user);
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "အမှားတစ်ခု ဖြစ်သွားပါတယ်။"}`);
  }
}

// ---------------------------------------------------------------------------
// Flow: Repair status — type a voucher number, then tap the status it is in now
// ---------------------------------------------------------------------------

/** Moves a technician makes from the bench. Handing a phone back takes the money and
 *  cancelling closes the job, so both stay in the app. */
const BOT_REPAIR_MOVES = (from: string): RepairStatus[] => nextStatuses(from).filter((s) => s !== "DELIVERED" && s !== "CANCELLED");

const statusText = (s: string) => REPAIR_STATUS_MM[s] ?? REPAIR_STATUS_LABELS[s as RepairStatus] ?? s;

type BotRepairJob = NonNullable<Awaited<ReturnType<typeof findRepairJob>>>;

async function startRepair(chatId: string, user: AuthUser) {
  await setSession(user.id, chatId, "rp.voucher", {});
  await sendMessage(chatId, "🔧 Voucher နံပါတ် ရိုက်ထည့်ပါ (ဥပမာ MS0012):", { replyMarkup: keyboard([CANCEL_ROW]) });
}

async function showRepairJob(chatId: string, user: AuthUser, job: BotRepairJob, heading?: string) {
  const moves = BOT_REPAIR_MOVES(job.status);
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) rows.push(moves.slice(i, i + 2).map((m) => btn(REPAIR_STATUS_MM[m] ?? REPAIR_STATUS_LABELS[m], `rs:${job.id}:${m}`)));
  rows.push([btn("✕ ပိတ်မည်", "cancel")]);
  const lines = [
    heading,
    `🔧 ${job.jobNo} · ${job.deviceBrand} ${job.deviceModel}`,
    job.customerName || job.customerPhone ? `👤 ${[job.customerName, job.customerPhone].filter(Boolean).join(" · ")}` : null,
    `ပြဿနာ: ${job.problem}`,
    `အခြေအနေ: ${statusText(job.status)}`,
    job.technicianName ? `ပြင်သူ: ${job.technicianName}` : null,
    moves.length ? "\nလက်ရှိ အခြေအနေကို နှိပ်ပါ (သို့) တခြား voucher နံပါတ် ရိုက်ပါ:" : "\nဒီ job ပိတ်ပြီးပါပြီ၊ app ထဲမှာပဲ ပြင်လို့ရပါတယ်။",
  ].filter(Boolean);
  // Stays ready for the next voucher number.
  await setSession(user.id, chatId, "rp.voucher", {});
  await sendMessage(chatId, lines.join("\n"), { replyMarkup: keyboard(rows) });
}

async function rpFind(chatId: string, user: AuthUser, text: string) {
  const job = await findRepairJob(user, text);
  if (!job) {
    await setSession(user.id, chatId, "rp.voucher", {});
    return sendMessage(chatId, `Voucher ${text} နဲ့ ပြင်ဆင်မှု မရှိပါ။ နံပါတ် စစ်ပြီး ပြန်ရိုက်ပါ:`, { replyMarkup: keyboard([CANCEL_ROW]) });
  }
  return showRepairJob(chatId, user, job);
}

async function rpMove(chatId: string, user: AuthUser, jobId: string, to: string) {
  const before = await prisma.repairJob.findFirst({ where: { id: jobId, businessId: user.businessId, deletedAt: null, ...branchScope(user) } });
  if (!before) return sendMessage(chatId, "ဒီ ပြင်ဆင်မှု မရှိတော့ပါ။");
  if (!BOT_REPAIR_MOVES(before.status).includes(to as RepairStatus)) {
    return showRepairJob(chatId, user, before, `အခု ${statusText(before.status)} ဖြစ်နေလို့ ဒီမှာ ${statusText(to)} ပြောင်းလို့ မရပါ။\n`);
  }
  const job = await prisma.$transaction(async (tx) => {
    // A technician who moves a job nobody was given takes it, so it counts as theirs.
    if (!before.technicianName?.trim() && user.roleName === "Service Tech") {
      await updateRepairDetails(tx, { businessId: user.businessId, userId: user.id, jobId, details: { technicianName: user.name } });
    }
    return updateRepairStatus(tx, { businessId: user.businessId, userId: user.id, jobId, status: to as RepairStatus });
  });
  notifyAuditFeed(user.businessId, repairStatusNotice({
    ...job, from: before.status, to: job.status, paidNow: 0n, createdByName: user.name,
  }), chatId);
  return showRepairJob(chatId, user, job, `✅ ${job.jobNo} ကို ${statusText(job.status)} ပြောင်းပြီးပါပြီ။\n`);
}

/** This month so far for the technician whose bot this is, with what they have earned. */
async function showMyRepairs(chatId: string, user: AuthUser) {
  const month = todayBusinessDate().slice(0, 7);
  const { technicians } = await technicianPerformance(user.businessId, month);
  const mine = technicians.find((t) => t.userId === user.id) ?? technicians.find((t) => t.name && t.name === user.name.trim());
  if (!mine) return showMenu(chatId, user, `📊 ${month}: ${user.name} အမည်နဲ့ ပြင်ဆင်မှု မရှိသေးပါ။`);
  const lines = [
    `📊 ${mine.name} · ${month}`,
    `လက်ခံ: ${mine.takenIn}`,
    `ပြင်ပြီး: ${mine.repaired}`,
    `မပြင်နိုင်: ${mine.cannotRepair}`,
    `ပြင်နေဆဲ: ${mine.working}`,
    `ပျမ်းမျှ ရက်: ${mine.avgDays ?? "—"}`,
    mine.userId ? `💰 ကော်မရှင်: ${fmtMoney(mine.commission.toString())}` : null,
  ].filter(Boolean);
  return showMenu(chatId, user, lines.join("\n"));
}

// ---------------------------------------------------------------------------
// AI helper — the user's own OpenAI or Gemini key answers questions about the shop.
// Set up with /ai or the menu; after that, anything typed outside a flow is a question.
// ---------------------------------------------------------------------------

const AI_QUESTIONS_KEPT = "သင်မေးတဲ့ မေးခွန်းတွေကို ဝန်ဆောင်မှု ပိုကောင်းအောင် Mahar Mini POS က မှတ်ထားပါမယ်။ (AI ရဲ့ အဖြေနဲ့ ဆိုင်ရဲ့ ကိန်းဂဏန်းတွေကိုတော့ မသိမ်းပါ)";

const AI_EXAMPLES ="ဥပမာ:\n• ဒီလ အမြတ် ဘယ်လောက်လဲ?\n• ဘယ်ပစ္စည်း အရောင်းရဆုံးလဲ?\n• အကြွေး ဘယ်သူတွေ ကျန်လဲ?\n• Stock နည်းနေတာ ဘာတွေလဲ?\n• အရောင်း တိုးဖို့ အကြံပေးပါ";

async function startAi(chatId: string, user: AuthUser) {
  await clearSession(user.id, chatId);
  const saved = await loadAiKey(user.id);
  if (saved) {
    return sendMessage(
      chatId,
      `🤖 AI ချိတ်ထားပြီးပါပြီ (${PROVIDER_NAME[saved.provider]} · …${saved.hint})\n\nမေးချင်တာ စာရိုက်ပြီး မေးလိုက်ပါ။\n\n${AI_EXAMPLES}\n\nℹ️ ${AI_QUESTIONS_KEPT}`,
      { replyMarkup: keyboard([[btn("🔑 Key ပြောင်းရန်", "ai:key"), btn("🗑 Key ဖျက်ရန်", "ai:remove")], [btn("✕ ပိတ်မည်", "cancel")]]) },
    );
  }
  return sendMessage(
    chatId,
    [
      "🤖 AI ကို မေးရန်",
      "",
      "ကိုယ်ပိုင် OpenAI၊ Gemini သို့မဟုတ် DeepSeek API key ထည့်ပြီး ဆိုင်ရဲ့ အရောင်း၊ အမြတ်၊ Stock၊ အကြွေး၊ ပြင်ဆင်မှု အကြောင်း မေးလို့ရပါတယ်။ အကြံဉာဏ်လည်း တောင်းလို့ရပါတယ်။",
      "",
      "သိထားရန်:",
      "• မေးတဲ့အခါ ဆိုင်ရဲ့ စာရင်း data တချို့ကို သင့် key ရဲ့ company (OpenAI၊ Google သို့မဟုတ် DeepSeek) ဆီ ပို့ပါမယ်။ DeepSeek ရဲ့ server တွေက တရုတ်နိုင်ငံမှာ ရှိပါတယ်။",
      "• ကုန်ကျစရိတ်က သင့် key ရဲ့ account ကနေ ကျပါမယ်။ Gemini မှာ အခမဲ့ ပမာဏ ရှိပါတယ်။",
      "• AI က စာရင်းကို ဖတ်ပဲ ဖတ်နိုင်ပြီး ဘာမှ ပြင်လို့ မရပါ။ သင့်အကောင့် ကြည့်ခွင့်ရှိတာကိုပဲ မြင်ပါမယ်။",
      "• Key ကို encrypt လုပ်ပြီး သိမ်းပါမယ်။ Key ပါတဲ့ message ကို chat ထဲက ဖျက်ပေးပါမယ်။",
      `• ${AI_QUESTIONS_KEPT}`,
    ].join("\n"),
    { replyMarkup: keyboard([[btn("✅ သဘောတူပါတယ် — Key ထည့်မယ်", "ai:key")], CANCEL_ROW]) },
  );
}

async function aiAskKey(chatId: string, user: AuthUser) {
  await setSession(user.id, chatId, "ai.key", {});
  return sendMessage(
    chatId,
    "🔑 API key ကို ဒီ chat ထဲ ပို့ပါ:\n\n• OpenAI — sk- နဲ့ စတယ် (platform.openai.com/api-keys)\n• Gemini — AIza နဲ့ စတယ် (aistudio.google.com/apikey)\n• DeepSeek — sk- နဲ့ စတယ် (platform.deepseek.com/api_keys)",
    { replyMarkup: keyboard([CANCEL_ROW]) },
  );
}

async function aiKeyText(chatId: string, user: AuthUser, text: string, messageId?: number) {
  // The key is out of the chat history before anything else happens.
  if (messageId) await deleteMessage(chatId, messageId);
  const candidates = providerCandidates(text);
  if (!candidates.length) {
    return sendMessage(chatId, "❌ OpenAI / DeepSeek (sk-…) သို့မဟုတ် Gemini (AIza…) key ပုံစံ မဟုတ်ပါ။ ပြန်ပို့ပါ:", { replyMarkup: keyboard([CANCEL_ROW]) });
  }
  // An sk- key may be OpenAI's or DeepSeek's: the provider that accepts it is the one.
  let provider: AiProvider | null = null;
  let unreachable = false;
  for (const p of candidates) {
    const check = await checkAiKey(p, text.trim());
    if (check === "ok") {
      provider = p;
      break;
    }
    if (check === "failed") unreachable = true;
  }
  const names = candidates.map((p) => PROVIDER_NAME[p]).join(" / ");
  if (!provider && unreachable) {
    return sendMessage(chatId, `⚠️ ${names} ကို ခု ဆက်သွယ်လို့ မရပါ။ ခဏနေ key ကို ပြန်ပို့ပါ:`, { replyMarkup: keyboard([CANCEL_ROW]) });
  }
  if (!provider) {
    return sendMessage(chatId, `❌ ဒီ key ကို ${names} က လက်မခံပါ။ Key မှန်မမှန် စစ်ပြီး ပြန်ပို့ပါ:`, { replyMarkup: keyboard([CANCEL_ROW]) });
  }
  await saveAiKey(user.id, provider, text);
  await clearSession(user.id, chatId);
  return sendMessage(chatId, `✅ ${PROVIDER_NAME[provider]} key ချိတ်ပြီးပါပြီ။\n\nအခု မေးချင်တာ စာရိုက်ပြီး မေးလိုက်ပါ။\n\n${AI_EXAMPLES}`);
}

async function aiRemove(chatId: string, user: AuthUser) {
  await removeAiKey(user.id);
  return showMenu(chatId, user, "🗑 AI key ကို ဖျက်ပြီးပါပြီ။");
}

/** Questions one user may ask in AI_WINDOW_MS — a guard against a loop or a stuck key
 *  running up the shop's bill, not a quota. In memory: one server runs the bot. */
const AI_LIMIT = 20;
const AI_WINDOW_MS = 10 * 60 * 1000;
const aiAsked = new Map<string, number[]>();

function aiAllowed(userId: string): boolean {
  const now = Date.now();
  const recent = (aiAsked.get(userId) ?? []).filter((t) => now - t < AI_WINDOW_MS);
  if (recent.length >= AI_LIMIT) return false;
  recent.push(now);
  aiAsked.set(userId, recent);
  return true;
}

/** Answers in the background: a model with lookups can take longer than Telegram waits
 *  for the webhook, and a late reply would make Telegram send the question again. */
async function aiAnswer(chatId: string, user: AuthUser, question: string, key: NonNullable<Awaited<ReturnType<typeof loadAiKey>>>) {
  if (!aiAllowed(user.id)) {
    return sendMessage(chatId, "⏳ မေးခွန်း များလွန်းနေပါတယ်။ ၁၀ မိနစ်လောက် နားပြီးမှ ပြန်မေးပါ။");
  }
  // A key saved before questions were kept: say so once, and keep from the next question on.
  const keep = await questionsNoticeGiven(user.id);
  if (!keep) await sendMessage(chatId, `ℹ️ ${AI_QUESTIONS_KEPT}`);
  const record = (answered: boolean) =>
    keep
      ? recordAiQuestion({ userId: user.id, businessId: user.businessId, question, provider: key.provider, answered })
          .catch((e) => console.error("[telegram ai] could not record question:", e))
      : undefined;
  void (async () => {
    const typing = setInterval(() => void sendChatAction(chatId), 4500);
    try {
      const business = await prisma.business.findUnique({ where: { id: user.businessId }, select: { name: true } });
      const answer = await askShopAgent(user, business?.name ?? "", question, key);
      await sendMessage(chatId, answer);
      await record(true);
    } catch (e) {
      await record(false);
      const kind = e instanceof AiError ? e.kind : "failed";
      if (kind !== "bad_key" && kind !== "quota") console.error("[telegram ai] failed:", e);
      const text = kind === "bad_key"
        ? `❌ ${PROVIDER_NAME[key.provider]} key အလုပ်မလုပ်တော့ပါ။ /ai နှိပ်ပြီး key အသစ် ထည့်ပါ။`
        : kind === "quota"
          ? `⚠️ ${PROVIDER_NAME[key.provider]} key ရဲ့ quota (သို့) ငွေ ကုန်နေပါတယ်။ Account မှာ စစ်ပြီးမှ ပြန်မေးပါ။`
          : "⚠️ AI က ခု အဖြေမပေးနိုင်ပါ။ ခဏနေ ပြန်မေးပါ။";
      await sendMessage(chatId, text);
    } finally {
      clearInterval(typing);
    }
  })();
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

const FLOW_REQUIRED_PERM: Record<string, string> = {
  income: "income_expense.create",
  expense: "income_expense.create",
  withdraw: "wallet.withdraw",
  transfer: "wallet.transfer",
  money: "wallet.transfer",
  credit: "credit.collect",
  payable: "payable.pay",
  newcredit: "credit.create",
  topup: "biller.trade",
  repair: "repair.update",
  myrepairs: "repair.view",
};

const FLOW_FEATURE: Record<string, FeatureKey> = {
  income: "incomeExpense",
  expense: "incomeExpense",
  withdraw: "withdraw",
  transfer: "transfers",
  money: "transfers",
  credit: "credit",
  payable: "credit",
  newcredit: "credit",
  topup: "biller",
  repair: "repair",
  myrepairs: "repair",
};

/** ownerUserId identifies whose bot this webhook belongs to — resolved from
 *  the webhook URL by the caller (one bot = one Mahar Mini POS user). */
export async function handleUpdate(update: TgUpdate, ownerUserId: string) {
  const chatId =
    update.message?.chat.id.toString() ?? update.callback_query?.message?.chat.id.toString();
  if (!chatId) return;

  // A shop's bot answers the staff member whose chat it is linked to. Anyone else who
  // finds the bot is told to contact the shop rather than shown a staff menu, in Myanmar:
  // they are a customer, not an app user, and never chose a language.
  const owner = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { telegramChatId: true },
  });
  if (owner?.telegramChatId && owner.telegramChatId !== chatId) {
    return sendMessage(
      chatId,
      `မင်္ဂလာပါ 🙏

ဤ bot မှတစ်ဆင့် ဝန်ဆောင်မှု မရှိပါ။ ဆိုင်သို့ တိုက်ရိုက် ဆက်သွယ်ပါ။`
    );
  }

  // "typing…" while the reply is worked out, so a slow answer does not look like silence.
  void sendChatAction(chatId);
  try {
    if (update.message) return await handleMessage(ownerUserId, chatId, update.message.text ?? "", update.message.message_id);
    if (update.callback_query) return await handleCallback(ownerUserId, update.callback_query);
  } catch (e) {
    // Whatever broke, the person gets an answer instead of a bot that went quiet.
    console.error("[telegram bot] update failed:", e);
    await sendMessage(chatId, `⚠️ ${e instanceof ApiError ? e.message : "စနစ်မှာ အမှားတစ်ခု ဖြစ်သွားပါတယ်။"}\n\nခဏနေ ပြန်ကြိုးစားပါ (သို့) /menu ကို နှိပ်ပါ။`);
  }
}

/** Said when a message is not what the bot is waiting for. */
function helpText(user: AuthUser, repairOn: boolean): string {
  const lines = ["🤔 နားမလည်ပါ။", "", "အောက်က menu ကနေ ရွေးပါ။"];
  if (repairOn && can(user, "repair.update")) lines.push("(သို့) ပြင်ဆင်မှု voucher နံပါတ် ရိုက်ပါ၊ ဥပမာ MS0012။");
  lines.push("", "🤖 ဆိုင်အကြောင်း AI ကို မေးချင်ရင် /ai ကို နှိပ်ပါ။");
  return lines.join("\n");
}

async function handleMessage(ownerUserId: string, chatId: string, text: string, messageId?: number) {
  const resolved = await resolveOwner(ownerUserId, chatId);
  if (resolved.kind === "not_found") return sendMessage(chatId, "ဒီ bot ကို မှန်မှန် မချိတ်ထားပါ။ Mahar Mini POS admin ကို ဆက်သွယ်ပါ။");
  if (resolved.kind === "chat_mismatch") return sendMessage(chatId, "ဒီ bot ကို တခြား Telegram အကောင့်နဲ့ ချိတ်ထားပြီးပါပြီ။ သင်ဖြစ်ရင် Mahar Mini POS မှာ အရင် ဖြုတ်ပါ။");
  const { user, justLinked } = resolved;
  if (justLinked) return showMenu(chatId, user, `✅ ${user.name} (${user.roleName}) အဖြစ် ချိတ်ပြီးပါပြီ။\n\nစတင်ရန်:`);

  const trimmed = text.trim();
  if (trimmed === "/start" || trimmed === "/menu" || trimmed === "/cancel") return showMenu(chatId, user);
  if (trimmed === "/ai") return startAi(chatId, user);

  const session = await getSession(ownerUserId, chatId);
  if (session?.step === "ai.key" && trimmed) return aiKeyText(chatId, user, trimmed, messageId);
  try {
    // A voucher number typed straight into the chat opens that repair.
    if ((!session || session.step === "rp.voucher") && VOUCHER_LIKE.test(trimmed)
      && can(user, "repair.update") && (await businessFeatures(user.businessId)).repair) {
      return await rpFind(chatId, user, trimmed);
    }
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "အမှားတစ်ခု ဖြစ်သွားပါတယ်။"}`);
    return;
  }
  if (!trimmed) {
    // A photo, sticker or voice note: the bot only reads text and buttons.
    return sendMessage(chatId, "📝 စာနဲ့ ခလုတ်ကိုပဲ ဖတ်နိုင်ပါတယ်။ စာရိုက်ပါ (သို့) /menu ကို နှိပ်ပါ။");
  }
  if (!session) {
    // Outside any flow, typing is a question for the AI helper once a key is set.
    const aiKey = await loadAiKey(user.id);
    if (aiKey) return aiAnswer(chatId, user, trimmed, aiKey);
    return showMenu(chatId, user, helpText(user, (await businessFeatures(user.businessId)).repair));
  }

  const [flow, step] = session.step.split(".");
  if (step === "saving") return sendMessage(chatId, "⏳ ခုနက စာရင်းကို သိမ်းနေဆဲပါ၊ ခဏစောင့်ပါ…");
  try {
    if (flow === "rp" && step === "voucher") return await rpFind(chatId, user, trimmed);
    if (flow === "bl") {
      if (step === "face") return blStepFaceText(chatId, user, session.data, trimmed);
      if (step === "cash") return blStepCashText(chatId, user, session.data, trimmed);
    }
    if (flow === "ie") {
      if (step === "category_new") return ieStepCategoryNewText(chatId, user, session.data, trimmed);
      if (step === "amount") return ieStepAmountText(chatId, user, session.data, trimmed);
      if (step === "description") return ieStepDescriptionText(chatId, user, session.data, trimmed);
    }
    if (flow === "tr") {
      if (step === "amount") return trStepAmountText(chatId, user, session.data, trimmed);
      if (step === "rate") return trStepRateText(chatId, user, session.data, trimmed);
      if (step === "fee") return trStepFeeText(chatId, user, session.data, trimmed);
    }
    if (flow === "ms") {
      if (step === "amount") return msStepAmountText(chatId, user, session.data, trimmed);
      if (step === "fee") return msAskConfirm(chatId, user, session.data, trimmed);
    }
    if (flow === "cp") {
      if (step === "amount") return cpStepAmountText(chatId, user, session.data, trimmed);
    }
    if (flow === "nc") {
      if (step === "customer_new") return ncStepCustomerNewText(chatId, user, session.data, trimmed);
      if (step === "amount") return ncStepAmountText(chatId, user, session.data, trimmed);
      if (step === "note") return ncStepNoteText(chatId, user, session.data, trimmed);
    }
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "အမှားတစ်ခု ဖြစ်သွားပါတယ်။"}`);
    return;
  }
  // A flow is open and waiting on a button, not on typing.
  return sendMessage(chatId, "👆 အပေါ်က ခလုတ်တစ်ခုကို နှိပ်ပါ (သို့) ပြန်စဖို့ မလုပ်တော့ပါ ကို နှိပ်ပါ။", { replyMarkup: keyboard([CANCEL_ROW]) });
}

/** Every flow's Confirm step, as "<flow>.confirm". */
const CONFIRM_STEP = /^(bl|ie|tr|ms|cp|nc)\.confirm$/;

/** Takes the Confirm tap for this chat, once. A double tap, or Telegram sending the same
 *  tap twice, finds the step already taken and saves nothing a second time. */
async function claimConfirm(ownerUserId: string, chatId: string, step: string): Promise<boolean> {
  const flow = step.split(".")[0];
  const { count } = await prisma.telegramSession.updateMany({
    where: { ownerUserId, chatId, step },
    data: { step: `${flow}.saving` },
  });
  return count === 1;
}

async function handleCallback(ownerUserId: string, cq: { id: string; message?: { chat: { id: number } }; data?: string }) {
  const chatId = cq.message?.chat.id.toString();
  const data = cq.data ?? "";
  if (!chatId) return answerCallbackQuery(cq.id);
  // The small toast on the button is the first sign the tap arrived.
  await answerCallbackQuery(cq.id, data === "confirm:yes" ? "⏳ သိမ်းနေသည်…" : undefined);

  const resolved = await resolveOwner(ownerUserId, chatId);
  if (resolved.kind === "not_found") return sendMessage(chatId, "ဒီ bot ကို မှန်မှန် မချိတ်ထားပါ။ Mahar Mini POS admin ကို ဆက်သွယ်ပါ။");
  if (resolved.kind === "chat_mismatch") return sendMessage(chatId, "ဒီ bot ကို တခြား Telegram အကောင့်နဲ့ ချိတ်ထားပြီးပါပြီ။ သင်ဖြစ်ရင် Mahar Mini POS မှာ အရင် ဖြုတ်ပါ။");
  const { user, justLinked } = resolved;
  if (justLinked) return showMenu(chatId, user, `✅ ${user.name} (${user.roleName}) အဖြစ် ချိတ်ပြီးပါပြီ။\n\nစတင်ရန်:`);

  if (data === "cancel") {
    await clearSession(ownerUserId, chatId);
    return showMenu(chatId, user, "မလုပ်တော့ပါ။");
  }

  if (data.startsWith("menu:")) {
    const key = data.slice(5);
    const perm = FLOW_REQUIRED_PERM[key];
    if (perm && !can(user, perm)) return sendMessage(chatId, "ဒါကို လုပ်ခွင့် မရှိပါ။");
    const feature = FLOW_FEATURE[key];
    if (feature && !(await businessFeatures(user.businessId))[feature]) {
      return sendMessage(chatId, "ဒီ function ကို Mahar Mini POS Settings မှာ ပိတ်ထားပါတယ်။");
    }
    if (key === "income") return startIncomeExpense(chatId, user, "INCOME");
    if (key === "expense") return startIncomeExpense(chatId, user, "EXPENSE");
    if (key === "withdraw") return startIncomeExpense(chatId, user, "WITHDRAW");
    if (key === "transfer") return startTransfer(chatId, user);
    if (key === "money") return startMoneyService(chatId, user);
    if (key === "credit") return startCreditPayable(chatId, user, "credit");
    if (key === "payable") return startCreditPayable(chatId, user, "payable");
    if (key === "newcredit") return startNewCredit(chatId, user);
    if (key === "topup") return startBiller(chatId, user);
    if (key === "repair") return startRepair(chatId, user);
    if (key === "myrepairs") return showMyRepairs(chatId, user);
    if (key === "ai") return startAi(chatId, user);
    return;
  }

  if (data.startsWith("rs:")) {
    const [, jobId, to] = data.split(":");
    if (!can(user, "repair.update")) return sendMessage(chatId, "ဒါကို လုပ်ခွင့် မရှိပါ။");
    if (!(await businessFeatures(user.businessId)).repair) return sendMessage(chatId, "ဒီ function ကို Mahar Mini POS Settings မှာ ပိတ်ထားပါတယ်။");
    try {
      return await rpMove(chatId, user, jobId, to);
    } catch (e) {
      return sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "အမှားတစ်ခု ဖြစ်သွားပါတယ်။"}`);
    }
  }

  if (data === "ai:key") return aiAskKey(chatId, user);
  if (data === "ai:remove") return aiRemove(chatId, user);

  const session = await getSession(ownerUserId, chatId);
  // A button from a flow that is finished or was cancelled.
  if (!session) return showMenu(chatId, user, "⌛ ဒီခလုတ် သက်တမ်းကုန်ပါပြီ။ menu ကနေ ပြန်စပါ:");
  const [flow, step] = session.step.split(".");
  if (step === "saving") return sendMessage(chatId, "⏳ သိမ်းနေဆဲပါ၊ ခဏစောင့်ပါ…");

  if (data === "confirm:yes" && CONFIRM_STEP.test(session.step)) {
    if (!(await claimConfirm(ownerUserId, chatId, session.step))) return sendMessage(chatId, "⏳ သိမ်းနေပြီးသားပါ၊ ခဏစောင့်ပါ…");
    await sendMessage(chatId, "⏳ သိမ်းနေပါတယ်၊ ခဏစောင့်ပါ…");
    try {
      if (flow === "bl") return await blConfirm(chatId, user, session.data);
      if (flow === "ie") return await ieConfirm(chatId, user, session.data);
      if (flow === "tr") return await trConfirm(chatId, user, session.data);
      if (flow === "ms") return await msConfirm(chatId, user, session.data);
      if (flow === "cp") return await cpConfirm(chatId, user, session.data);
      if (flow === "nc") return await ncConfirm(chatId, user, session.data);
    } finally {
      // Saved: the flow has cleared its session. Failed: put Confirm back so it can be tapped again.
      await prisma.telegramSession.updateMany({ where: { ownerUserId, chatId, step: `${flow}.saving` }, data: { step: session.step } });
    }
  }

  try {
    if (flow === "bl") {
      if (step === "biller" && data.startsWith("b:")) return blStepBiller(chatId, user, session.data, data.slice(2));
      if (step === "kind" && data.startsWith("k:")) return blStepKind(chatId, user, session.data, data.slice(2));
      if (step === "cash" && data.startsWith("c:")) return blStepCashText(chatId, user, session.data, data.slice(2));
      if (step === "wallet" && data.startsWith("w:")) return blStepWallet(chatId, user, session.data, data.slice(2));
      if (step === "confirm" && data === "confirm:no") return showMenu(chatId, user, "မလုပ်တော့ပါ။");
      if (step === "expense" && data === "fx:yes") return blAddExpense(chatId, user, session.data);
      if (step === "expense" && data === "fx:no") {
        await clearSession(ownerUserId, chatId);
        return showMenu(chatId, user, "ထွက်ငွေထဲ မထည့်ပါ။");
      }
    }
    if (flow === "ie") {
      if (step === "wallet" && data.startsWith("w:")) return ieStepWallet(chatId, user, session.data, data.slice(2));
      if (step === "category" && data.startsWith("cat:")) return ieStepCategoryPick(chatId, user, session.data, data.slice(4));
      if (step === "description" && data === "skip") return ieStepDescriptionSkip(chatId, user, session.data);
      if (step === "confirm" && data === "confirm:no") return showMenu(chatId, user, "မလုပ်တော့ပါ။");
    }
    if (flow === "tr") {
      if (step === "source" && data.startsWith("w:")) return trStepSource(chatId, user, session.data, data.slice(2));
      if (step === "dest" && data.startsWith("w:")) return trStepDest(chatId, user, session.data, data.slice(2));
      if (step === "fee" && data === "skip") return trStepFeeSkip(chatId, user, session.data);
      if (step === "confirm" && data === "confirm:no") return showMenu(chatId, user, "မလုပ်တော့ပါ။");
    }
    if (flow === "ms") {
      if (step === "kind" && data.startsWith("mk:")) return msStepKind(chatId, user, session.data, data.slice(3));
      if (step === "account" && data.startsWith("w:")) return msStepAccount(chatId, user, session.data, data.slice(2));
      if (step === "cash" && data.startsWith("w:")) return msStepCash(chatId, user, session.data, data.slice(2));
      if (step === "fee" && data === "skip") return msAskConfirm(chatId, user, session.data, "0");
      if (step === "confirm" && data === "confirm:no") return showMenu(chatId, user, "မလုပ်တော့ပါ။");
    }
    if (flow === "cp") {
      if (step === "pick" && data.startsWith("r:")) return cpStepPick(chatId, user, session.data, data.slice(2));
      if (step === "wallet" && data.startsWith("w:")) return cpStepWallet(chatId, user, session.data, data.slice(2));
      if (step === "confirm" && data === "confirm:no") return showMenu(chatId, user, "မလုပ်တော့ပါ။");
    }
    if (flow === "nc") {
      if (step === "customer" && data.startsWith("c:")) return ncStepCustomerPick(chatId, user, session.data, data.slice(2));
      if (step === "note" && data === "skip") return ncStepNoteSkip(chatId, user, session.data);
      if (step === "wallet" && data.startsWith("w:")) return ncStepWallet(chatId, user, session.data, data.slice(2));
      if (step === "confirm" && data === "confirm:no") return showMenu(chatId, user, "မလုပ်တော့ပါ။");
    }
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof ApiError ? e.message : "အမှားတစ်ခု ဖြစ်သွားပါတယ်။"}`);
    return;
  }
  // A button from an earlier step of this flow.
  return sendMessage(chatId, "⌛ ဒီခလုတ်က အရင်အဆင့်က ဖြစ်ပါတယ်။ နောက်ဆုံး message ကို သုံးပါ (သို့) မလုပ်တော့ပါ ကို နှိပ်ပါ။", { replyMarkup: keyboard([CANCEL_ROW]) });
}
