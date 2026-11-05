/** Reading customers and suppliers out of a CSV. Parsing and checking only, so it can be
 *  tested without a database. Every row is reported, good or bad. */
import { readAmount, splitCsvLine } from "./productCsv";

export const CONTACT_TYPES = ["CUSTOMER", "SUPPLIER", "AGENT", "CREDITOR", "DEBTOR", "OTHER"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export interface ParsedContact {
  row: number;
  name: string;
  phone: string;
  type: ContactType;
  telegram: string;
  address: string;
  notes: string;
  /** In kyat, as typed ("50000"); empty when the column is empty. */
  creditLimit: string;
}

export interface ParsedContacts {
  contacts: ParsedContact[];
  rejected: { row: number; raw: string; reason: string }[];
  unknownColumns: string[];
}

const HEADERS: Record<string, keyof Omit<ParsedContact, "row">> = {
  name: "name", "customer name": "name", "supplier name": "name", အမည်: "name",
  phone: "phone", "phone number": "phone", mobile: "phone", ဖုန်း: "phone", ဖုန်းနံပါတ်: "phone",
  type: "type", အမျိုးအစား: "type",
  telegram: "telegram",
  address: "address", လိပ်စာ: "address",
  notes: "notes", note: "notes", မှတ်ချက်: "notes",
  "credit limit": "creditLimit", creditlimit: "creditLimit",
};

const TYPE_WORDS: Record<string, ContactType> = {
  customer: "CUSTOMER", ဖောက်သည်: "CUSTOMER",
  supplier: "SUPPLIER", ကုန်သည်: "SUPPLIER", ကုန်သွင်းသူ: "SUPPLIER",
  agent: "AGENT", creditor: "CREDITOR", debtor: "DEBTOR", other: "OTHER",
};

/** The template a shop downloads to fill in. */
export const CONTACT_TEMPLATE = "Name,Phone,Type,Telegram,Address,Notes,Credit limit\r\nKo Aung,09123456789,Customer,,Yangon,,0\r\nKK Phone Parts,09987654321,Supplier,,Mandalay,,\r\n";

/** Reads the file. Rows with no name are rejected; a row with no type takes `fallbackType`
 *  (the list it was imported into). */
export function parseContactCsv(text: string, fallbackType: ContactType = "CUSTOMER"): ParsedContacts {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => l.trim() !== "");
  if (headerIndex < 0) return { contacts: [], rejected: [], unknownColumns: [] };
  const header = splitCsvLine(lines[headerIndex]).map((h) => h.toLowerCase().replace(/\s+/g, " ").trim());
  const fields = header.map((h) => HEADERS[h] ?? null);
  const unknownColumns = header.filter((h, i) => h && !fields[i]);
  const out: ParsedContacts = { contacts: [], rejected: [], unknownColumns };
  if (!fields.includes("name")) {
    out.rejected.push({ row: headerIndex + 1, raw: lines[headerIndex], reason: "No Name column" });
    return out;
  }

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cells = splitCsvLine(raw);
    const get = (f: keyof Omit<ParsedContact, "row">) => {
      const at = fields.indexOf(f);
      return at >= 0 ? (cells[at] ?? "").trim() : "";
    };
    const row = i + 1;
    const name = get("name");
    if (!name) { out.rejected.push({ row, raw, reason: "Name is empty" }); continue; }
    if (name.length > 120) { out.rejected.push({ row, raw, reason: "Name is too long" }); continue; }
    const typeText = get("type");
    const upper = typeText.toUpperCase();
    const type: ContactType | null = !typeText
      ? fallbackType
      : TYPE_WORDS[typeText.toLowerCase()] ?? ((CONTACT_TYPES as readonly string[]).includes(upper) ? upper as ContactType : null);
    if (!type) { out.rejected.push({ row, raw, reason: `Unknown type "${typeText}"` }); continue; }
    const limitText = get("creditLimit");
    const creditLimit = limitText ? readAmount(limitText) : "";
    if (creditLimit === null) { out.rejected.push({ row, raw, reason: `Credit limit "${limitText}" is not a number` }); continue; }
    out.contacts.push({
      row, name, type, creditLimit,
      phone: get("phone").replace(/[^\d+]/g, ""),
      telegram: get("telegram"), address: get("address"), notes: get("notes"),
    });
  }
  return out;
}
