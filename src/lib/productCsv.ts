/** Reading a product list out of a CSV.
 *
 *  Parsing and checking only — nothing here touches the database, so the awkward parts can
 *  be tested against the files shops actually have: quoted names with commas in them,
 *  prices written "1,500", a stray blank line at the end, a BOM from Excel.
 *
 *  Every row is reported, good or bad. A shop importing two hundred products needs to see
 *  which four are wrong and why, not a single "import failed".
 */

export interface ParsedProduct {
  row: number;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  costPrice: string;
  sellingPrice: string;
  quantity: number;
  minStock: number;
}

export interface RejectedRow {
  row: number;
  /** Kept so the person can see the line they need to fix. */
  raw: string;
  reason: string;
}

export interface ParsedCsv {
  products: ParsedProduct[];
  rejected: RejectedRow[];
  /** Header names that were not recognised, so a mis-titled column is visible rather than
   *  silently ignored. */
  unknownColumns: string[];
}

/** Split one CSV line, honouring quotes and doubled quotes inside them. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

/** Which of our fields a header names.
 *
 *  Several spellings each, because the file usually comes out of whatever the shop used
 *  before and nobody should have to rename columns to import their own products.
 */
const COLUMNS: Record<string, string[]> = {
  name: ["name", "product", "product name", "product_name", "item", "item name", "title"],
  sku: ["sku", "code", "item code", "product code", "barcode2"],
  barcode: ["barcode", "bar code", "ean", "upc"],
  category: ["category", "group", "type"],
  costPrice: ["cost", "cost price", "cost_price", "buy price", "purchase price"],
  sellingPrice: ["price", "selling price", "selling_price", "sell price", "sale price", "retail"],
  quantity: ["quantity", "qty", "stock", "stock quantity", "stock_quantity", "on hand"],
  minStock: ["min stock", "min_stock", "minimum stock", "low stock", "low_stock_alert", "reorder"],
};

function fieldFor(header: string): string | null {
  const clean = header.trim().toLowerCase().replace(/\s+/g, " ");
  for (const [field, names] of Object.entries(COLUMNS)) {
    if (names.includes(clean)) return field;
  }
  return null;
}

/** A price as a shop writes it: "1500", "1,500", "1500.00", or empty for nothing. */
export function readAmount(raw: string): string | null {
  const clean = raw.replace(/[,\s]/g, "");
  if (!clean) return "0";
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return clean;
}

function readCount(raw: string): number | null {
  const clean = raw.replace(/[,\s]/g, "");
  if (!clean) return 0;
  if (!/^\d+$/.test(clean)) return null;
  return Number(clean);
}

export function parseProductCsv(text: string): ParsedCsv {
  // Excel writes a byte-order mark, which otherwise becomes part of the first header.
  const body = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = body.split("\n");

  const headerLine = lines.findIndex((line) => line.trim() !== "");
  if (headerLine === -1) {
    return { products: [], rejected: [], unknownColumns: [] };
  }

  const headers = splitCsvLine(lines[headerLine]);
  const fields = headers.map(fieldFor);
  const unknownColumns = headers.filter((header, i) => header !== "" && fields[i] === null);

  const products: ParsedProduct[] = [];
  const rejected: RejectedRow[] = [];
  const seenSku = new Set<string>();

  for (let i = headerLine + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "") continue;
    // 1-based and counting the header, so it matches what the spreadsheet shows.
    const rowNumber = i + 1;

    const cells = splitCsvLine(line);
    const get = (field: string) => {
      const index = fields.indexOf(field);
      return index === -1 ? "" : (cells[index] ?? "");
    };

    const name = get("name");
    if (!name) {
      rejected.push({ row: rowNumber, raw: line, reason: "No product name" });
      continue;
    }

    const costPrice = readAmount(get("costPrice"));
    if (costPrice === null) {
      rejected.push({ row: rowNumber, raw: line, reason: `Cost "${get("costPrice")}" is not a number` });
      continue;
    }
    const sellingPrice = readAmount(get("sellingPrice"));
    if (sellingPrice === null) {
      rejected.push({ row: rowNumber, raw: line, reason: `Price "${get("sellingPrice")}" is not a number` });
      continue;
    }
    const quantity = readCount(get("quantity"));
    if (quantity === null) {
      rejected.push({ row: rowNumber, raw: line, reason: `Quantity "${get("quantity")}" is not a whole number` });
      continue;
    }
    const minStock = readCount(get("minStock"));
    if (minStock === null) {
      rejected.push({ row: rowNumber, raw: line, reason: `Min stock "${get("minStock")}" is not a whole number` });
      continue;
    }

    const sku = get("sku");
    // A file that repeats a code would otherwise import the first and fail the rest at the
    // database, halfway through, with nothing said about which.
    if (sku && seenSku.has(sku.toLowerCase())) {
      rejected.push({ row: rowNumber, raw: line, reason: `SKU ${sku} appears more than once in this file` });
      continue;
    }
    if (sku) seenSku.add(sku.toLowerCase());

    products.push({
      row: rowNumber,
      name,
      sku,
      barcode: get("barcode"),
      category: get("category"),
      costPrice,
      sellingPrice,
      quantity,
      minStock,
    });
  }

  return { products, rejected, unknownColumns };
}

/** The header line for the template a shop downloads to fill in. */
export const CSV_TEMPLATE = [
  "name,sku,barcode,category,cost,price,quantity,min stock",
  "Coca Cola 330ml,,8851959132012,Drinks,600,800,24,6",
  "Rice 5kg,RICE5,,Grocery,12000,14000,10,2",
].join("\n");
