import { crc32, deflateRawSync } from "zlib";

/** A small Excel (.xlsx) writer: one sheet per table, text and numbers, a bold first row
 *  and columns sized to their contents. Enough for reports, with no extra dependency.
 *  Myanmar text is kept as UTF-8, which Excel, Google Sheets and LibreOffice all read. */

export type Cell = string | number | null | undefined;
export interface Sheet {
  name: string;
  rows: Cell[][];
  /** Rows (0-based) to show in bold besides the header, such as a totals row. */
  boldRows?: number[];
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
    // Characters XML 1.0 does not allow.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Sheet names: at most 31 characters, none of []:*?/\ and unique in the workbook. */
function sheetNames(sheets: Sheet[]): string[] {
  const seen = new Set<string>();
  return sheets.map((s) => {
    const base = (s.name.replace(/[[\]:*?/\\]/g, " ").trim() || "Sheet").slice(0, 31);
    let name = base;
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${base.slice(0, 28)} ${n}`;
    seen.add(name.toLowerCase());
    return name;
  });
}

function sheetXml(sheet: Sheet): string {
  const bold = new Set([0, ...(sheet.boldRows ?? [])]);
  const widths: number[] = [];
  const rows = sheet.rows.map((row, r) => {
    const cells = row.map((v, c) => {
      if (v === null || v === undefined || v === "") return "";
      const ref = `${colName(c)}${r + 1}`;
      const style = bold.has(r) ? ` s="1"` : typeof v === "number" ? ` s="2"` : "";
      const len = typeof v === "number" ? v.toLocaleString("en-US").length : Math.max(...String(v).split("\n").map((l) => l.length));
      widths[c] = Math.max(widths[c] ?? 6, Math.min(len + 2, 60));
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
      return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
    }).join("");
    return `<row r="${r + 1}">${cells}</row>`;
  }).join("");
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w ?? 8}" customWidth="1"/>`).join("")}</cols>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" numFmtId="164" applyFont="1" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`;

/** Zip (deflate) of the given files, as Excel expects. */
function zip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const packed = deflateRawSync(f.data);
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(0x0800, 8); head.writeUInt16LE(8, 10);
    head.writeUInt32LE(0, 12); head.writeUInt32LE(crc, 16); head.writeUInt32LE(packed.length, 20); head.writeUInt32LE(f.data.length, 24);
    head.writeUInt16LE(name.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, name, packed);
    central.push(head, name);
    offset += 30 + name.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

export function buildXlsx(sheets: Sheet[]): Buffer {
  const names = sheetNames(sheets);
  const f = (name: string, text: string) => ({ name, data: Buffer.from(text, "utf8") });
  return zip([
    f("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`),
    f("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    f("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
    f("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    f("xl/styles.xml", STYLES),
    ...sheets.map((s, i) => f(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s))),
  ]);
}
