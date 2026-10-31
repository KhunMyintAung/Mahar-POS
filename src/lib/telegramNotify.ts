import { prisma } from "./prisma";
import { sendMessage, withBotToken } from "./telegram";
import { notifyReportTargets } from "./telegramReports";

// Live audit feed over Telegram: after a Sale / 3D / Transfer / Withdraw /
// Income & Expense / Exchange transaction is committed, push a short summary
// to every linked user who can view the audit log, and to the person who did it, so a
// Service Tech without the audit log still gets a log of their own work on their own bot.
//
// Fire-and-forget by design: callers should NOT await this — the HTTP
// response (or the bot's own confirmation message) must not wait on Telegram
// delivery. Recipients are messaged in parallel, and every failure is caught
// internally so a bad send can never surface as an unhandled rejection or
// affect the transaction that already committed.
export function notifyAuditFeed(businessId: string, text: string, excludeChatId?: string, actorUserId?: string): void {
  run(businessId, text, excludeChatId, actorUserId).catch((e) => console.error("[telegram notify] failed:", e));
  // The shop's send-only reports bot gets the same feed, in the chats set up for it.
  notifyReportTargets(businessId, text);
}

async function run(businessId: string, text: string, excludeChatId?: string, actorUserId?: string) {
  const users = await prisma.user.findMany({
    where: { businessId, active: true, deletedAt: null, telegramChatId: { not: null }, telegramBotToken: { not: null } },
    include: { role: true },
  });
  const recipients = users.filter((u) => {
    if (u.telegramChatId === excludeChatId) return false; // already got a direct confirmation
    if (u.id === actorUserId) return true;
    try {
      const perms: string[] = JSON.parse(u.role.permissions);
      return perms.includes("audit.view");
    } catch (e) {
      // One corrupt Role.permissions row must not silence the feed for everyone else.
      console.error(`[telegram notify] bad permissions JSON for role ${u.roleId}:`, e);
      return false;
    }
  });
  // Each recipient reads this over their OWN bot, so each send runs with that
  // recipient's own token as the active Telegram client.
  await Promise.all(
    recipients.map((u) => withBotToken(u.telegramBotToken!, () => sendMessage(u.telegramChatId!, text)))
  );
}

function money(minor: bigint | string, currency = "MMK") {
  const v = typeof minor === "string" ? BigInt(minor) : minor;
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = abs % 100n;
  const s = frac === 0n ? whole : `${whole}.${frac.toString().padStart(2, "0")}`;
  return `${neg ? "-" : ""}${s} ${currency}`;
}

function noteLine(note?: string | null) {
  return note?.trim() ? `\nNote: ${note.trim()}` : "";
}

/** How many lines are named before the rest are summed up.
 *
 *  A basket of thirty items would make the feed unreadable and Telegram would split the
 *  message, so a long sale is named down to a point and then counted. */
const ITEMS_SHOWN = 8;

/** What was sold, one line each.
 *
 *  A total on its own tells nobody what left the shelf, which is the first thing an owner
 *  reading the feed on their phone wants to know. */
export function itemLines(items: { name: string; quantity: number }[]): string {
  if (items.length === 0) return "";
  const shown = items.slice(0, ITEMS_SHOWN).map((i) => `• ${i.name} × ${i.quantity}`);
  const rest = items.length - ITEMS_SHOWN;
  if (rest > 0) shown.push(`• …and ${rest} more`);
  return `\n${shown.join("\n")}`;
}

export function saleNotice(opts: {
  txnNo: string;
  total: bigint;
  profit: bigint;
  createdByName: string;
  items?: { name: string; quantity: number }[];
  notes?: string | null;
}) {
  return (
    `🧾 Sale ${opts.txnNo}` +
    itemLines(opts.items ?? []) +
    `\nBy: ${opts.createdByName} · Total: ${money(opts.total)} · Profit: ${money(opts.profit)}` +
    noteLine(opts.notes)
  );
}

export function billerNotice(opts: {
  txnNo: string;
  kind: string;
  billerName: string;
  faceAmount: bigint;
  cashAmount: bigint;
  profit: bigint;
  balanceAfter: bigint;
  createdByName: string;
}) {
  const what = opts.kind === "TOPUP" ? "float bought" : opts.kind === "SALE" ? "top-up sold" : "float adjusted";
  return (
    `📱 ${opts.billerName} — ${what} ${opts.txnNo}\n` +
    `Credit: ${money(opts.faceAmount)} · Cash: ${money(opts.cashAmount)} · Margin: ${money(opts.profit)}\n` +
    `Float now: ${money(opts.balanceAfter)} · By: ${opts.createdByName}`
  );
}

export function transferNotice(opts: { txnNo: string; sourceName: string; destName: string; sourceAmount: bigint; sourceCurrency: string; destAmount: bigint; destCurrency: string; createdByName: string; notes?: string | null }) {
  const amount = opts.sourceCurrency === opts.destCurrency
    ? money(opts.sourceAmount, opts.sourceCurrency)
    : `${money(opts.sourceAmount, opts.sourceCurrency)} → ${money(opts.destAmount, opts.destCurrency)}`;
  return `🔁 Transfer ${opts.txnNo}\n${opts.sourceName} → ${opts.destName} · ${amount}\nBy: ${opts.createdByName}${noteLine(opts.notes)}`;
}

export function incomeExpenseNotice(opts: { txnNo: string; type: string; categoryName: string; amount: bigint; currency: string; createdByName: string; description?: string | null }) {
  const icon = opts.type === "INCOME" ? "💰" : opts.type === "WITHDRAW" ? "➖" : "💸";
  const label = opts.type === "INCOME" ? "Income" : opts.type === "WITHDRAW" ? "Withdraw" : "Expense";
  return `${icon} ${label} ${opts.txnNo}\n${opts.categoryName} · ${money(opts.amount, opts.currency)}\nBy: ${opts.createdByName}${noteLine(opts.description)}`;
}

export function creditPayableNotice(opts: { kind: "credit" | "payable"; txnNo: string; partyName: string; amount: bigint; currency: string; createdByName: string }) {
  const icon = opts.kind === "credit" ? "🤝" : "📤";
  const label = opts.kind === "credit" ? "Credit collected" : "Payable paid";
  return `${icon} ${label} — ${opts.txnNo}\n${opts.partyName} · ${money(opts.amount, opts.currency)}\nBy: ${opts.createdByName}`;
}

export function newCreditNotice(opts: { txnNo: string; customerName: string; amount: bigint; currency: string; createdByName: string; notes?: string | null }) {
  return `🆕 New credit — ${opts.txnNo}\n${opts.customerName} · ${money(opts.amount, opts.currency)}\nBy: ${opts.createdByName}${noteLine(opts.notes)}`;
}

/** Sent after a REVERSE action — different verb, includes the required reason. */
export function reversalNotice(opts: { icon: string; label: string; txnNo: string; reason: string; createdByName: string }) {
  return `${opts.icon} ${opts.label} REVERSED — ${opts.txnNo}\nReason: ${opts.reason}\nBy: ${opts.createdByName}`;
}

const REPAIR_STATUS_LABEL: Record<string, string> = {
  RECEIVED: "Taken in", CHECKING: "Checking", IN_PROGRESS: "In progress", WAITING_PARTS: "Waiting part",
  DONE: "Completed", CANNOT_REPAIR: "Cannot repair", DELIVERED: "Delivered", CANCELLED: "Cancelled",
};
const statusLabel = (s: string) => REPAIR_STATUS_LABEL[s] ?? s;

/** The repair fields every repair alert shows. */
export interface RepairForNotice {
  jobNo: string; deviceBrand: string; deviceModel: string; problem: string;
  customerName?: string | null; customerPhone?: string | null;
  estimatedCost: bigint; finalCost?: bigint | null; depositAmount?: bigint; paidAmount?: bigint;
}

const ks = (minor: bigint) => `${money(minor, "").trim()} Ks`;

/** One detail per line, so it reads at a glance on a phone:
 *  job · status, device, customer, problem, amount, then who did it. */
function repairLines(job: RepairForNotice, amountLine: string) {
  const customer = [job.customerName?.trim(), job.customerPhone?.trim()].filter(Boolean).join(" · ");
  return [
    `📱 ${job.deviceBrand} ${job.deviceModel}`.trim(),
    customer ? `👤 ${customer}` : "",
    job.problem?.trim() ? `🛠 ${job.problem.trim()}` : "",
    amountLine,
  ].filter(Boolean).join("\n");
}

/** A phone taken in for repair. */
export function repairNewNotice(job: RepairForNotice & { createdByName: string }) {
  const amount = `💰 ${ks(job.estimatedCost)}` + (job.depositAmount && job.depositAmount > 0n ? ` · Deposit ${ks(job.depositAmount)}` : "");
  return [
    `🆕 Repair ${job.jobNo} · New`,
    repairLines(job, amount),
    "Status: Taken in",
    `By: ${job.createdByName}`,
  ].join("\n");
}

/** A repair moving from one status to the next, or paid. */
export function repairStatusNotice(job: RepairForNotice & {
  from: string; to: string; paidNow?: bigint; createdByName: string; notes?: string | null;
}) {
  const icon = job.to === "DONE" ? "✅" : job.to === "DELIVERED" ? "📦" : job.to === "CANCELLED" || job.to === "CANNOT_REPAIR" ? "⛔" : "🔄";
  const charge = job.finalCost && job.finalCost > 0n ? job.finalCost : job.estimatedCost;
  const paid = job.paidAmount ?? 0n;
  const due = charge - paid;
  const amount = `💰 ${ks(charge)}` +
    (paid > 0n ? ` · Paid ${ks(paid)}` : "") +
    (due > 0n && paid > 0n ? ` · Due ${ks(due)}` : "") +
    (job.paidNow && job.paidNow > 0n ? `\n💵 Paid now: ${ks(job.paidNow)}` : "");
  return [
    `${icon} Repair ${job.jobNo} · ${statusLabel(job.to)}`,
    repairLines(job, amount),
    job.from === job.to ? `Status: ${statusLabel(job.to)}` : `Status: ${statusLabel(job.from)} → ${statusLabel(job.to)}`,
    `By: ${job.createdByName}` + (job.notes?.trim() ? `\nNote: ${job.notes.trim()}` : ""),
  ].join("\n");
}

/** A stock movement entered by hand: in, out, used for repair, correction. */
export function stockMoveNotice(opts: {
  itemName: string; label: string; quantity: number; qtyAfter: number; createdByName: string; detail?: string | null;
}) {
  const sign = opts.quantity > 0 ? `+${opts.quantity}` : String(opts.quantity);
  return (
    `📦 Stock ${opts.label}: ${opts.itemName} ${sign}\n` +
    `Now in stock: ${opts.qtyAfter} · By: ${opts.createdByName}` +
    noteLine(opts.detail)
  );
}

/** An order a customer sent from the Online Shop. */
export function onlineOrderNotice(opts: {
  orderNo: string; customerName: string; customerPhone: string; address?: string | null; note?: string | null;
  lines: { name: string; quantity: number; unitPrice: bigint }[]; total: bigint;
}) {
  return [
    `🛍️ Online order ${opts.orderNo} · New`,
    `👤 ${opts.customerName} · ${opts.customerPhone}`,
    ...(opts.address?.trim() ? [`📍 ${opts.address.trim()}`] : []),
    ...opts.lines.map((l) => `• ${l.name} × ${l.quantity} = ${money(l.unitPrice * BigInt(l.quantity))}`),
    `💰 Total: ${money(opts.total)}`,
  ].join("\n") + noteLine(opts.note);
}
