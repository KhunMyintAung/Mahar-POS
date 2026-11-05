import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { todayBusinessDate } from "@/lib/dates";
import { loadModuleAccess } from "@/lib/moduleAccess";
import { isPhoneShop } from "@/lib/modules";
import { CATEGORY_SEP } from "@/lib/productCsv";

/** The item list as a CSV in exactly the columns the import reads, so a shop can export,
 *  change prices or stock in a spreadsheet, and import the same file back.
 *
 *  ?category=<name> limits it to one category ("—" for items without one). A mini mart's
 *  file has an expiry column too; a phone shop's has it only when an item has a date.
 */

const HEADER = ["name", "sku", "barcode", "category", "sub category", "unit", "cost", "price", "stock", "min stock"];

/** Whole kyat without ".00", which is how shops write prices and how the import reads them. */
function amount(minor: bigint): string {
  const whole = minor / 100n;
  const cents = minor % 100n;
  return cents === 0n ? whole.toString() : `${whole}.${String(cents < 0n ? -cents : cents).padStart(2, "0")}`;
}

function cell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const GET = withAuth("item.view", async ({ req, user }) => {
  const category = req.nextUrl.searchParams.get("category");
  // Every category, so a sub-category is written under its own category's name.
  const cats = await prisma.itemCategory.findMany({ where: { businessId: user.businessId }, select: { id: true, name: true, parentId: true } });
  const byId = new Map(cats.map((c) => [c.id, c]));
  const split = (id: string | null) => {
    const c = id ? byId.get(id) : undefined;
    if (!c) return { category: "", sub: "" };
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    return parent ? { category: parent.name, sub: c.name } : { category: c.name, sub: "" };
  };
  // ?category= is a name ("Phone": it and every sub-category under it) or "Phone › New".
  let categoryIds: string[] | null = null;
  if (category && category !== "—") {
    const [top, sub] = category.split(CATEGORY_SEP);
    categoryIds = cats
      .filter((c) => {
        const s = split(c.id);
        return sub ? s.category === top && s.sub === sub : c.name === top || s.category === top;
      })
      .map((c) => c.id);
  }
  const items = await prisma.item.findMany({
    where: {
      businessId: user.businessId,
      deletedAt: null,
      ...(category === "—" ? { categoryId: null } : categoryIds ? { categoryId: { in: categoryIds } } : {}),
    },
    include: {
      unit: { select: { name: true } },
      stockLevels: { select: { quantity: true } },
    },
    orderBy: [{ name: "asc" }],
  });
  const sortKey = (id: string | null) => { const s = split(id); return `${s.category}\u0000${s.sub}`; };
  items.sort((a, b) => sortKey(a.categoryId).localeCompare(sortKey(b.categoryId)) || a.name.localeCompare(b.name));

  const withExpiry = !isPhoneShop(await loadModuleAccess(user.businessId)) || items.some((it) => it.expiresAt);
  const header = withExpiry ? [...HEADER, "expiry"] : HEADER;
  const rows = items.map((it) => [
    it.name,
    it.sku,
    it.barcode ?? "",
    split(it.categoryId).category,
    split(it.categoryId).sub,
    it.unit?.name ?? "",
    amount(it.costPrice),
    amount(it.sellingPrice),
    it.stockLevels.reduce((sum, l) => sum + l.quantity, 0),
    it.minStock,
    ...(withExpiry ? [it.expiresAt ? it.expiresAt.toISOString().slice(0, 10) : ""] : []),
  ]);
  const body = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const suffix = category && category !== "—" ? `-${category.replace(/[^\w-]+/g, "-")}` : "";

  // The BOM makes Excel read Myanmar names as UTF-8.
  return new NextResponse(`﻿${body}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="items${suffix}-${todayBusinessDate()}.csv"`,
      "cache-control": "no-store",
    },
  });
});
