import { prisma } from "./prisma";

/** The donations listed on the About page, kept by hand in the admin portal (a donation comes
 *  in by KPay or crypto, outside the app, so there is nothing to read it from). */
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
