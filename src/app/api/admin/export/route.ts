import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

// BOM first, so Excel opens the UTF-8 (Myanmar text) correctly.
const csv = (rows: (string | number | null | undefined)[][]) =>
  "﻿" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");

/** Shops or users as a CSV file. Admin only. ?type=shops|users */
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const type = req.nextUrl.searchParams.get("type") === "users" ? "users" : "shops";
  let body: string;
  if (type === "users") {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { name: true, username: true, email: true, phone: true, active: true, createdAt: true, role: { select: { name: true } }, business: { select: { name: true } } },
    });
    body = csv([
      ["Shop", "Name", "Username", "Email", "Phone", "Role", "Active", "Registered"],
      ...users.map((u) => [u.business.name, u.name, u.username, u.email, u.phone, u.role.name, u.active ? "Yes" : "No", u.createdAt.toISOString()]),
    ]);
  } else {
    const shops = await prisma.business.findMany({
      orderBy: { createdAt: "desc" },
      select: { name: true, phone: true, city: true, address: true, createdAt: true, _count: { select: { users: true } } },
    });
    body = csv([
      ["Shop", "Phone", "City", "Address", "Users", "Registered"],
      ...shops.map((s) => [s.name, s.phone, s.city, s.address, s._count.users, s.createdAt.toISOString()]),
    ]);
  }
  return new NextResponse(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
