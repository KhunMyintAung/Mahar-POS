import { prisma, type Tx } from "./prisma";

/** The donations listed on the About page, kept by hand in the admin portal (a donation comes
 *  in by KPay or PromptPay, outside the app, so there is nothing to read it from). */
export const DONATIONS_KEY = "donations";

export interface Donation {
  id: string;
  name: string;
  /** Whole kyat. */
  amount: number;
  method: string;
  /** YYYY-MM-DD, or empty. */
  date: string;
  note?: string;
}

export async function loadDonations(): Promise<Donation[]> {
  const row = await prisma.platformSetting.findUnique({ where: { key: DONATIONS_KEY } });
  if (!row) return [];
  try {
    const list = JSON.parse(row.value);
    return Array.isArray(list) ? (list as Donation[]) : [];
  } catch {
    return [];
  }
}

/** Biggest first; the same amount, the earlier one first. */
export function topDonations(list: Donation[]): Donation[] {
  return [...list].sort((a, b) => b.amount - a.amount || (a.date || "").localeCompare(b.date || ""));
}

/** The admin editor accepts at most this many; the list is kept inside it. */
const MAX_DONATIONS = 200;

/** The list with `entry` in it (replacing one with the same id, so an approval is never listed
 *  twice), biggest first and cut to what the admin editor accepts. */
export function withDonation(list: Donation[], entry: Donation): Donation[] {
  return topDonations([...list.filter((d) => d.id !== entry.id), entry]).slice(0, MAX_DONATIONS);
}

/** The list without the entry with this id. */
export function withoutDonation(list: Donation[], id: string): Donation[] {
  return list.filter((d) => d.id !== id);
}

async function saveInTx(tx: Tx, update: (list: Donation[]) => Donation[]): Promise<void> {
  const row = await tx.platformSetting.findUnique({ where: { key: DONATIONS_KEY } });
  let list: Donation[] = [];
  try {
    const parsed = row ? JSON.parse(row.value) : [];
    if (Array.isArray(parsed)) list = parsed as Donation[];
  } catch { /* an unreadable list is started again rather than blocking the payment */ }
  const value = JSON.stringify(update(list));
  await tx.platformSetting.upsert({ where: { key: DONATIONS_KEY }, create: { key: DONATIONS_KEY, value }, update: { value } });
}

/** Lists an approved Pro payment among the donations, inside the approval's own transaction. */
export function addDonation(tx: Tx, entry: Donation): Promise<void> {
  return saveInTx(tx, (list) => withDonation(list, entry));
}

/** Takes a payment's entry back off the list when its approval is voided. */
export function removeDonation(tx: Tx, id: string): Promise<void> {
  return saveInTx(tx, (list) => withoutDonation(list, id));
}
