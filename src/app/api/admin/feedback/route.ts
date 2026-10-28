import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

const deny = () => NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });

/** Every shop's feedback, newest first. Admin only. */
export async function GET() {
  if (!(await isAdminRequest())) return deny();
  const data = await prisma.feedback.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  return NextResponse.json({ ok: true, data });
}

/** Show or hide one on the About page. */
export async function PATCH(req: NextRequest) {
  if (!(await isAdminRequest())) return deny();
  const parsed = z.object({ id: z.string().min(1), shown: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid" }, { status: 422 });
  const row = await prisma.feedback.update({ where: { id: parsed.data.id }, data: { shown: parsed.data.shown } });
  return NextResponse.json({ ok: true, data: row });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdminRequest())) return deny();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Invalid" }, { status: 422 });
  await prisma.feedback.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
