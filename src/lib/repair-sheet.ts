/** Phone-repair logs kept in a published Google Sheet, one tab per shop that sends phones
 *  in. /repair-sheet/<shop> shows a tab on maharpos.shop instead of Google's bare table.
 *
 *  The tab list is read from the workbook each time, so a shop added as a new tab gets its
 *  page without a deploy, and every page refetches within a minute of the sheet changing. */

const SHEET_BASE =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSSUU9FmNjc0BBT7xznOdFM7855qtbgDbMJMZjADhhQVIPg5OgkE5LROllfMb_KzP5YH7CTXQ81s1cP";

const REVALIDATE_SECONDS = 60;

export type RepairShop = { name: string; slug: string; gid: string };

export type RepairSheetRow = {
  /** As typed in the sheet: blank on a customer's second and later phones. */
  sheetDate: string;
  sheetOwner: string;
  /** Carried down from the line above when the sheet leaves them blank, for searching. */
  date: string;
  owner: string;
  model: string;
  part: string;
  repairStatus: string;
  cost: number;
  pickupStatus: string;
  paymentStatus: string;
  done: boolean;
  pickedUp: boolean;
};

export type RepairSheet = {
  rows: RepairSheetRow[];
  /** The tab's own first line, e.g. "ငွေရှင်းရန် စုစုပေါင်း - 3217000", split into its words and number. */
  totalLabel: string | null;
  sheetTotal: number | null;
};

export const shopSlug = (name: string) =>
  name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

/** RFC 4180 CSV: quoted fields may hold commas, newlines and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** A shop tab has the total on its first line and the headers ("Phone Model", …) on the
 *  second. A customer bringing several phones fills date and name on the first line only,
 *  so those carry down to the lines under it. Returns null for a tab that is not a shop's
 *  log, such as the "Link Short" tab. */
export function toRepairSheet(cells: string[][]): RepairSheet | null {
  if (!cells[1]?.some((cell) => /phone\s*model/i.test(cell))) return null;

  const first = cells[0]?.[0]?.trim() ?? "";
  const totalMatch = first.match(/(\d[\d,]*)(?!.*\d)/);
  const sheetTotal = totalMatch ? Number(totalMatch[1].replace(/,/g, "")) : null;
  const totalLabel = first ? first.slice(0, totalMatch?.index ?? first.length).replace(/[\s:\-–]+$/, "") : null;

  const rows: RepairSheetRow[] = [];
  let date = "";
  let owner = "";
  for (const line of cells.slice(2)) {
    const [d = "", o = "", model = "", part = "", repairStatus = "", cost = "", pickupStatus = "", paymentStatus = ""] =
      line.map((value) => value.trim());
    if (!model && !part && !cost) continue;
    if (d) { date = d; owner = o; }
    else if (o) owner = o;
    rows.push({
      sheetDate: d,
      sheetOwner: o,
      date,
      owner,
      model,
      part,
      repairStatus,
      cost: Number(cost.replace(/[^\d.]/g, "")) || 0,
      pickupStatus,
      paymentStatus,
      done: repairStatus.includes("ပြီး") || repairStatus.includes("✅"),
      pickedUp: pickupStatus.includes("ပြီး") || pickupStatus.includes("✅"),
    });
  }
  return { rows, totalLabel: totalLabel || null, sheetTotal };
}

/** Every tab of the workbook, as the published page lists them. */
export async function fetchRepairTabs(): Promise<RepairShop[]> {
  const response = await fetch(`${SHEET_BASE}/pubhtml`, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!response.ok) throw new Error(`Google Sheet returned ${response.status}`);
  const html = await response.text();
  const tabs: RepairShop[] = [];
  for (const match of html.matchAll(/items\.push\(\{name: "((?:[^"\\]|\\.)*)",[^}]*?gid: "(\d+)"/g)) {
    const name = JSON.parse(`"${match[1]}"`) as string;
    tabs.push({ name, slug: shopSlug(name), gid: match[2] });
  }
  return tabs;
}

export async function fetchRepairSheet(gid: string): Promise<RepairSheet | null> {
  const response = await fetch(`${SHEET_BASE}/pub?gid=${gid}&single=true&output=csv`, {
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!response.ok) throw new Error(`Google Sheet returned ${response.status}`);
  return toRepairSheet(parseCsv(await response.text()));
}

/** The shops: tabs that read as a repair log. */
export async function fetchRepairShops(): Promise<RepairShop[]> {
  const tabs = await fetchRepairTabs();
  const sheets = await Promise.all(tabs.map((tab) => fetchRepairSheet(tab.gid).catch(() => null)));
  return tabs.filter((_, i) => sheets[i]);
}
