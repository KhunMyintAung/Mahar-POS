import { prisma } from "./prisma";

/** The notice shown at the top of every shop's app, set from the admin portal. */
export const ANNOUNCEMENT_KEY = "announcement";

export interface Announcement {
  enabled: boolean;
  text: string;
  /** info (blue), success (green), warning (amber) */
  tone: "info" | "success" | "warning";
  link: string | null;
  linkLabel: string | null;
  /** Changes on every save, so a notice someone closed comes back when it changes. */
  version: string;
}

export async function loadAnnouncement(): Promise<Announcement | null> {
  const row = await prisma.platformSetting.findUnique({ where: { key: ANNOUNCEMENT_KEY } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as Announcement;
  } catch {
    return null;
  }
}
