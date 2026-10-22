import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAccess";
import { refreshStatuses } from "@/lib/emailAdmin";

export const dynamic = "force-dynamic";

/** Reads the latest delivery event of recent emails from Resend. Admin only. */
export async function POST() {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ ok: true, data: { changed: await refreshStatuses() } });
}
