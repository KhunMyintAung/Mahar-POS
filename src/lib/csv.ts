import type { Cell, Sheet } from "./xlsx";

/** A cell as CSV: quoted when it holds a comma, quote or line break, quotes doubled. */
function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The report's tables in one CSV file: each under its own name, a blank line between them.
 *  Starts with a byte-order mark so Excel opens the Myanmar text as UTF-8. */
export function buildCsv(sheets: Sheet[]): string {
  const blocks = sheets.map((sheet) =>
    [csvCell(sheet.name), ...sheet.rows.map((row) => row.map(csvCell).join(","))].join("\r\n")
  );
  return "﻿" + blocks.join("\r\n\r\n") + "\r\n";
}

/** One table as CSV text (with the byte-order mark, so Excel reads Myanmar text). */
export function rowsToCsv(rows: Cell[][]): string {
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Saves CSV text as a file in the browser. */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
