import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/adminAccess";
import { ANNOUNCEMENT_KEY, loadAnnouncement } from "@/lib/announcement";

export const dynamic = "force-dynamic";

const schema = z.object({
  enabled: z.boolean(),
  text: z.string().trim().max(500),
  tone: z.enum(["info", "success", "warning"]),
  link: z.string().trim().max(300).refine((u) => u === "" || /^https:\/\/\S+$/.test(u), "Link must start with https://"),
  linkLabel: z.string().trim().max(40),
});

/** The banner every shop sees at the top of the app. Admin only. */
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ ok: true, data: await loadAnnouncement() });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 422 });
  const b = parsed.data;
  if (b.enabled && !b.text) return NextResponse.json({ ok: false, error: "Write the announcement text" }, { status: 422 });
  const value = { enabled: b.enabled, text: b.text, tone: b.tone, link: b.link || null, linkLabel: b.linkLabel || null, version: Date.now().toString(36) };
  await prisma.platformSetting.upsert({
    where: { key: ANNOUNCEMENT_KEY },
    create: { key: ANNOUNCEMENT_KEY, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });
  return NextResponse.json({ ok: true, data: value });
}
