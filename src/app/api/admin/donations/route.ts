import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/adminAccess";
import { DONATIONS_KEY, loadDonations } from "@/lib/community";

export const dynamic = "force-dynamic";

const schema = z.array(z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1, "Write the donor's name").max(80),
  amount: z.number().int().min(1, "Amount must be more than 0"),
  method: z.string().trim().max(40),
  date: z.string().trim().refine((d) => d === "" || /^\d{4}-\d{2}-\d{2}$/.test(d), "Date must be YYYY-MM-DD"),
  note: z.string().trim().max(200).optional(),
})).max(200);

/** The donations list shown on the About page. Admin only. */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ ok: true, data: await loadDonations() });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 422 });
  const value = JSON.stringify(parsed.data);
  await prisma.platformSetting.upsert({ where: { key: DONATIONS_KEY }, create: { key: DONATIONS_KEY, value }, update: { value } });
  return NextResponse.json({ ok: true, data: parsed.data });
}
