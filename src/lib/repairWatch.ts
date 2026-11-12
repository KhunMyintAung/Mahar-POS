import { prisma } from "./prisma";
import { sendMessageWith } from "./telegram";
import { repairCardText } from "./customerBot";

/** The moves a waiting customer is told about. The rest (checking, repairing) are the shop's
 *  own steps and would only be noise. */
const TELL: ReadonlySet<string> = new Set(["WAITING_PARTS", "DONE", "CANNOT_REPAIR", "DELIVERED", "CANCELLED"]);
/** After these there is nothing more to wait for. */
const FINAL: ReadonlySet<string> = new Set(["DELIVERED", "CANCELLED"]);

/** Remember that this chat asked after this repair, so it hears when the repair is ready. */
export async function watchRepair(repairJobId: string, ownerUserId: string, chatId: string) {
  await prisma.repairWatch.upsert({
    where: { repairJobId_chatId: { repairJobId, chatId } },
    create: { repairJobId, ownerUserId, chatId },
    update: { ownerUserId },
  });
}

/** Tell the customers waiting on a repair that it moved, through the shop's bot they asked on.
 *  Called after the move is saved; a failed message never undoes the move. */
export async function notifyRepairWatchers(repairJobId: string): Promise<void> {
  const watches = await prisma.repairWatch.findMany({ where: { repairJobId } });
  if (watches.length === 0) return;
  const job = await prisma.repairJob.findUnique({ where: { id: repairJobId } });
  if (!job || job.deletedAt) {
    await prisma.repairWatch.deleteMany({ where: { repairJobId } });
    return;
  }
  if (!TELL.has(job.status)) return;
  const business = await prisma.business.findUnique({ where: { id: job.businessId }, select: { currency: true, name: true } });
  const text = repairCardText(job, business?.currency ?? "MMK", `🔔 ${business?.name ?? ""} မှ အသိပေးချက်`.trim());

  for (const w of watches) {
    const owner = await prisma.user.findUnique({ where: { id: w.ownerUserId }, select: { telegramBotToken: true, businessId: true, active: true } });
    // The bot it was asked on is gone, or belongs to another shop now: nobody to send it.
    if (!owner?.telegramBotToken || !owner.active || owner.businessId !== job.businessId) {
      await prisma.repairWatch.delete({ where: { id: w.id } }).catch(() => {});
      continue;
    }
    try {
      await sendMessageWith(owner.telegramBotToken, w.chatId, text);
    } catch (e) {
      // A customer who blocked the bot will never get one; stop trying.
      if (e instanceof Error && /blocked|chat not found|deactivated/i.test(e.message)) {
        await prisma.repairWatch.delete({ where: { id: w.id } }).catch(() => {});
      } else {
        console.error("[repair watch] notice failed:", e instanceof Error ? e.message : e);
      }
    }
  }
  if (FINAL.has(job.status)) await prisma.repairWatch.deleteMany({ where: { repairJobId } });
}
