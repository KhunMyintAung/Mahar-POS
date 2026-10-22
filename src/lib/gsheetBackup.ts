import { randomBytes } from "crypto";
import { prisma } from "./prisma";
import { TIME_PATTERN } from "./telegramReports";
import { todayBusinessDate } from "./dates";
import { reportSheets, resolvePeriod } from "./reportSheets";
import { buildReport } from "@/services/reportService";
import type { Sheet } from "./xlsx";

/** Backup of the reports to the owner's own Google Sheet.
 *
 *  The owner adds a small Apps Script (shown on the Reports page) to a sheet of their own
 *  and deploys it as a web app; we post the report sheets to that URL and the script writes
 *  each one to its own tab. No Google sign-in or API key lives here, only the script's URL
 *  and a key the script checks, so nobody else can write to the sheet.
 *
 *  Kept under its own SystemSetting key, which the settings API leaves out. */
export const GSHEET_KEY = "gsheet_backup";

export const SCRIPT_URL = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]{20,200}\/exec$/;

export interface GsheetBackup {
  url: string | null;
  secret: string;
  /** Back up this month and this year once a day at `time`. */
  auto: boolean;
  time: string;
  lastSent: string | null;
  lastResult: string | null;
}

export function parseGsheet(raw: unknown): GsheetBackup {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<GsheetBackup>;
  return {
    url: typeof v.url === "string" && SCRIPT_URL.test(v.url) ? v.url : null,
    secret: typeof v.secret === "string" && v.secret.length >= 16 ? v.secret : randomBytes(12).toString("hex"),
    auto: Boolean(v.auto),
    time: typeof v.time === "string" && TIME_PATTERN.test(v.time) ? v.time : "22:00",
    lastSent: typeof v.lastSent === "string" ? v.lastSent : null,
    lastResult: typeof v.lastResult === "string" ? v.lastResult : null,
  };
}

export async function loadGsheet(businessId: string): Promise<GsheetBackup> {
  const row = await prisma.systemSetting.findUnique({ where: { businessId_key: { businessId, key: GSHEET_KEY } } });
  let cfg: GsheetBackup;
  try { cfg = parseGsheet(row ? JSON.parse(row.value) : undefined); } catch { cfg = parseGsheet(undefined); }
  // The key is made once and kept, so the script pasted into the sheet keeps working.
  if (!row) await saveGsheet(businessId, cfg);
  return cfg;
}

export async function saveGsheet(businessId: string, cfg: GsheetBackup) {
  const value = JSON.stringify(cfg);
  await prisma.systemSetting.upsert({
    where: { businessId_key: { businessId, key: GSHEET_KEY } },
    create: { businessId, key: GSHEET_KEY, value },
    update: { value },
  });
}

/** The report sheets for one period, each tab named after the period ("2026-10 Grand Report").
 *  Stock is as it stands now, so its tab is just "Stock". */
async function periodSheets(businessId: string, kind: "month" | "year" | "day" | "range", value: string | null, from?: string | null, to?: string | null): Promise<Sheet[]> {
  const p = resolvePeriod(kind, value, from, to);
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
  const report = await buildReport(businessId, p.from, p.to);
  const sheets = reportSheets(report, `${business?.name ?? "Business"} · ${p.label}`);
  return sheets.map((s) => (s.name === "Stock" ? s : { ...s, name: `${p.label} ${s.name}`.slice(0, 31) }));
}

/** Posts sheets to the owner's script. Throws with the reason when it does not take them. */
export async function sendSheets(cfg: GsheetBackup, sheets: Sheet[]): Promise<number> {
  if (!cfg.url) throw new Error("Add the Google Sheet script URL first");
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ secret: cfg.secret, sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.map((r) => r.map((c) => c ?? "")), boldRows: s.boldRows ?? [] })) }),
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let out: { ok?: boolean; error?: string } = {};
  try { out = JSON.parse(text); } catch { /* not JSON: a Google error page */ }
  if (!res.ok || !out.ok) {
    throw new Error(out.error ?? (res.status === 200 ? "The script did not answer. Check it is deployed as a web app for \"Anyone\"." : `Google answered ${res.status}`));
  }
  return sheets.length;
}

/** A backup of the given period, or of this month and this year when none is given. */
export async function backupNow(businessId: string, period?: { kind: "day" | "month" | "year" | "range"; value: string | null; from?: string | null; to?: string | null }) {
  const cfg = await loadGsheet(businessId);
  const sheets = period
    ? await periodSheets(businessId, period.kind, period.value, period.from, period.to)
    : await defaultSheets(businessId);
  const count = await sendSheets(cfg, sheets);
  return count;
}

/** This month in full, and this year's summary and month-by-month table. On the first of
 *  a month last month goes again, so its last day is in. */
async function defaultSheets(businessId: string): Promise<Sheet[]> {
  const today = todayBusinessDate();
  const sheets = [...await periodSheets(businessId, "month", today.slice(0, 7))];
  if (today.endsWith("-01")) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(0);
    sheets.push(...await periodSheets(businessId, "month", d.toISOString().slice(0, 7)));
  }
  const year = await periodSheets(businessId, "year", today.slice(0, 4));
  sheets.push(...year.filter((s) => s.name !== "Stock"));
  // Last month carries a Stock tab too; send it once.
  return sheets.filter((s, i) => s.name !== "Stock" || sheets.findIndex((x) => x.name === "Stock") === i);
}

/** Called every minute: each shop's automatic backup, once a day after its time. */
export async function runDueGsheetBackups() {
  const rows = await prisma.systemSetting.findMany({ where: { key: GSHEET_KEY } });
  const date = todayBusinessDate();
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Yangon", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  for (const row of rows) {
    let cfg: GsheetBackup;
    try { cfg = parseGsheet(JSON.parse(row.value)); } catch { continue; }
    if (!cfg.auto || !cfg.url || time < cfg.time || cfg.lastSent === date) continue;
    // Marked first, so a slow backup never runs twice.
    await saveGsheet(row.businessId, { ...cfg, lastSent: date });
    let result: string;
    try {
      const n = await sendSheets(cfg, await defaultSheets(row.businessId));
      result = `${new Date().toISOString()} · ${n} sheets backed up`;
    } catch (e) {
      result = `${new Date().toISOString()} · failed: ${e instanceof Error ? e.message : "error"}`;
      console.error("[gsheet backup]", row.businessId, result);
    }
    await saveGsheet(row.businessId, { ...cfg, lastSent: date, lastResult: result });
  }
}

/** The Apps Script the owner pastes into their sheet (Extensions → Apps Script). */
export function appsScript(secret: string): string {
  return `// Mahar Mini POS → Google Sheet backup
const KEY = "${secret}";

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.secret !== KEY) return reply({ ok: false, error: "Wrong key. Copy the script again from Reports." });
  const book = SpreadsheetApp.getActiveSpreadsheet();
  body.sheets.forEach(function (s) {
    const sheet = book.getSheetByName(s.name) || book.insertSheet(s.name);
    sheet.clear();
    const width = Math.max.apply(null, [1].concat(s.rows.map(function (r) { return r.length; })));
    const rows = s.rows.map(function (r) { const x = r.slice(); while (x.length < width) x.push(""); return x; });
    if (!rows.length) return;
    // Columns holding numbers get #,##0; the rest stay plain text, so dates and vouchers are not reshaped.
    for (let j = 0; j < width; j++) {
      const numeric = rows.some(function (r) { return typeof r[j] === "number"; });
      sheet.getRange(1, j + 1, rows.length, 1).setNumberFormat(numeric ? "#,##0" : "@");
    }
    sheet.getRange(1, 1, rows.length, width).setValues(rows);
    [0].concat(s.boldRows || []).forEach(function (i) { sheet.getRange(i + 1, 1, 1, width).setFontWeight("bold"); });
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, width);
  });
  return reply({ ok: true, sheets: body.sheets.length });
}

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
`;
}
