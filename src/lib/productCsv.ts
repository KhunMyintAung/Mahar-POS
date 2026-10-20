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
  /** pcs, box, kg… Empty leaves an existing item's unit as it is. */
  unit: string;
  costPrice: string;
  sellingPrice: string;
  /** Stock on hand. Null when the cell is empty: an existing item keeps the stock it has,
   *  a new one starts at 0. */
  quantity: number | null;
  minStock: number;
  /** Which of cost, price and min stock the row actually filled in. An existing item keeps
   *  the value of any it left empty, rather than having it zeroed. */
  given: { costPrice: boolean; sellingPrice: boolean; minStock: boolean };
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
  name: ["name", "product", "product name", "product_name", "item", "item name", "title", "အမည်", "ပစ္စည်းအမည်"],
  sku: ["sku", "code", "item code", "product code", "barcode2"],
  barcode: ["barcode", "bar code", "ean", "upc"],
  category: ["category", "group", "type", "အမျိုးအစား"],
  unit: ["unit", "uom", "unit of measure", "ယူနစ်"],
  costPrice: ["cost", "cost price", "cost_price", "buy price", "purchase price", "ဝယ်ဈေး"],
  sellingPrice: ["price", "selling price", "selling_price", "sell price", "sale price", "retail", "ရောင်းဈေး", "ဈေးနှုန်း"],
  quantity: ["quantity", "qty", "stock", "stock quantity", "stock_quantity", "on hand", "stock on hand", "လက်ကျန်", "အရေအတွက်"],
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
    // An empty stock cell means "not given", not zero: re-importing a price list must not
    // wipe out the stock of everything on it.
    const rawQuantity = get("quantity");
    const quantity = rawQuantity.replace(/[,\s]/g, "") === "" ? null : readCount(rawQuantity);
    if (rawQuantity.replace(/[,\s]/g, "") !== "" && quantity === null) {
      rejected.push({ row: rowNumber, raw: line, reason: `Stock "${rawQuantity}" is not a whole number` });
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
      unit: get("unit").trim(),
      costPrice,
      sellingPrice,
      quantity,
      minStock,
      given: {
        costPrice: get("costPrice").trim() !== "",
        sellingPrice: get("sellingPrice").trim() !== "",
        minStock: get("minStock").trim() !== "",
      },
    });
  }

  return { products, rejected, unknownColumns };
}

const CSV_HEADER = "name,sku,barcode,category,unit,cost,price,stock,min stock";

/** The template a shop downloads to fill in, with example rows from a mini mart. */
export const CSV_TEMPLATE = [
  CSV_HEADER,
  "Coca Cola 330ml,,8851959132012,Drinks,PCS,600,800,24,6",
  "Coca Cola 330ml (Box of 24),COKE-BOX24,,Drinks,BOX,13500,18000,5,1",
  "Rice 5kg,RICE5,,Grocery,PCS,12000,14000,10,2",
].join("\n");

/** The same template with a phone shop's stock as the examples: handsets and the
 *  accessories sold beside them, so the categories already make sense to that shop. */
export const PHONE_SHOP_CSV_TEMPLATE = [
  CSV_HEADER,
  "Vivo Y28 (8/128GB),VIVO-Y28-128,,Phone New,PCS,420000,465000,3,1",
  "iPhone 11 (64GB),IP11-64-USED,,Phone Second,PCS,450000,520000,2,1",
  "Type-C Fast Charger 33W,CHG-33W,,Chargers & Cables,PCS,6000,9000,15,5",
  "Type-C Cable 1m,CBL-TC-1M,,Chargers & Cables,PCS,1500,3000,30,10",
  "Tempered Glass - Vivo Y28,TG-VIVO-Y28,,Glass,PCS,800,2000,20,5",
  "Tempered Glass - Vivo Y28 (Box of 10),TG-VIVO-Y28-BOX,,Glass,BOX,7000,15000,2,1",
  "Phone Case - Redmi Note 13,CASE-RN13,,Cases,PCS,2000,5000,10,3",
  "LCD Vivo Y28,LCD-VIVO-Y28,,Spare Parts,PCS,25000,45000,5,1",
].join("\n");

/** The template for a business category: the phone shop one for a mobile shop, the mini
 *  mart one for everyone else. */
export function csvTemplateFor(category: string | undefined): { csv: string; fileName: string } {
  return category === "MOBILE_SHOP"
    ? { csv: PHONE_SHOP_CSV_TEMPLATE, fileName: "phone-shop-products.csv" }
    : { csv: CSV_TEMPLATE, fileName: "wallet-note-products.csv" };
}
