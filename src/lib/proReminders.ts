import { prisma } from "./prisma";
import { notifyAuditFeed } from "./telegramNotify";
import { proDaysLeft, PRO_PRICE_MMK } from "./plan";

// Reminds a shop by push and Telegram as its Pro nears its end (7, 3 and 1 days before) and
// once it has ended, so the owner can pay before losing reports, the bot, extra branches and
// the rest. Sent at most once a day per shop (Business.proRemindedOn).

/** The days-before marks a reminder is sent on; 0 is "just ended". */
const MARKS = [7, 3, 1, 0];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function reminderText(daysLeft: number): string {
  const price = `${PRO_PRICE_MMK.toLocaleString("en-US")} Ks/month`;
  return daysLeft > 0
    ? `⭐ Mahar POS Pro ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.\nPay ${price} to keep Reports, the online shop, the Telegram bot, billers and more than one branch.`
    : `⭐ Your Mahar POS Pro has ended — you are on Free now.\nPay ${price} to switch Reports, the bot, billers and extra branches back on.`;
}

/** Called from the scheduler. Finds shops whose Pro is within a week of ending or has just
 *  ended and have not been reminded today, and sends each one reminder. Never throws. */
export async function runDueProReminders(now: Date = new Date()): Promise<number> {
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);
  let sent = 0;
  try {
    const shops = await prisma.business.findMany({
      where: { proUntil: { not: null, gte: dayAgo, lte: weekAhead } },
      select: { id: true, proUntil: true, proRemindedOn: true },
    });
    for (const shop of shops) {
      if (shop.proRemindedOn && sameDay(shop.proRemindedOn, now)) continue; // already today
      const expired = shop.proUntil! <= now;
      const mark = expired ? 0 : proDaysLeft(shop.proUntil, now);
      if (!MARKS.includes(mark)) continue;
      notifyAuditFeed(shop.id, reminderText(expired ? 0 : mark), undefined, undefined, { url: "/settings?upgrade=1", perm: "settings.manage" });
      await prisma.business.update({ where: { id: shop.id }, data: { proRemindedOn: now } });
      sent++;
    }
  } catch (e) {
    console.error("[pro reminders]", e);
  }
  return sent;
}
