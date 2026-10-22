import { z } from "zod";
import { withAuth, json, parseBody, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { TIME_PATTERN } from "@/lib/telegramReports";
import { SCRIPT_URL, appsScript, backupNow, loadGsheet, saveGsheet } from "@/lib/gsheetBackup";

// Google Sheet backup. Owner only: the script URL and its key never reach anyone else.

export const GET = withAuth("settings.manage", async ({ user }) => {
  const cfg = await loadGsheet(user.businessId);
  return json({ url: cfg.url, auto: cfg.auto, time: cfg.time, lastSent: cfg.lastSent, lastResult: cfg.lastResult, script: appsScript(cfg.secret) });
});

const putSchema = z.object({
  url: z.string().trim().refine((u) => u === "" || SCRIPT_URL.test(u), "Paste the web app URL, like https://script.google.com/macros/s/…/exec"),
  auto: z.boolean(),
  time: z.string().regex(TIME_PATTERN, "Time must be HH:MM, e.g. 22:00"),
});

export const PUT = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, putSchema);
  const cfg = await loadGsheet(user.businessId);
  const next = { ...cfg, url: body.url || null, auto: body.auto && Boolean(body.url), time: body.time };
  await saveGsheet(user.businessId, next);
  await audit(prisma, {
    businessId: user.businessId, userId: user.id, action: "UPDATE", module: "settings",
    resourceType: "SystemSetting", resourceId: "gsheet_backup", after: { url: next.url ? "set" : null, auto: next.auto, time: next.time },
  });
  return json({ url: next.url, auto: next.auto, time: next.time, lastSent: next.lastSent, lastResult: next.lastResult });
});

const postSchema = z.object({
  period: z.enum(["day", "month", "year", "range"]).optional(),
  date: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

/** Back up now: the period on screen, or this month and year. */
export const POST = withAuth("settings.manage", async ({ req, user }) => {
  const body = await parseBody(req, postSchema);
  const cfg = await loadGsheet(user.businessId);
  try {
    const sheets = await backupNow(user.businessId, body.period ? { kind: body.period, value: body.date ?? null, from: body.from, to: body.to } : undefined);
    await saveGsheet(user.businessId, { ...cfg, lastResult: `${new Date().toISOString()} · ${sheets} sheets backed up` });
    return json({ ok: true, sheets });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(502, e instanceof Error ? e.message : "Backup failed");
  }
});
