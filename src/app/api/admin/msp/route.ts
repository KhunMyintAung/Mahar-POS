import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAccess";
import { adminMspOverview } from "@/services/mspWalletService";

export const dynamic = "force-dynamic";

/** Who holds how much MSP, the rewards wallet on chain, and every movement. Admin only. */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ ok: true, data: await adminMspOverview() });
}
