import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { adminUsers, isAdminRequest } from "@/lib/adminAccess";
import { mailEnabled, renderBroadcast, sendMail } from "@/lib/mail";
import { audienceEmails, runBroadcast } from "@/lib/emailAdmin";

export const dynamic = "force-dynamic";

const schema = z.object({
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(5).max(20000),
  audience: z.enum(["owners", "users", "custom"]),
  emails: z.array(z.string()).max(2000).optional(),
  /** Send only to this address (or the admin's own) to check how it looks. */
  test: z.boolean().optional(),
  testTo: z.string().email().optional(),
});

/** Sends a test, or starts a broadcast in the background and returns its id. Admin only. */
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  if (!mailEnabled()) return NextResponse.json({ ok: false, error: "Email is not set up (RESEND_API_KEY / RESEND_FROM)" }, { status: 503 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 422 });
  const body = parsed.data;

  if (body.test) {
    const session = await getAuthUser();
    const me = session ? await prisma.user.findUnique({ where: { id: session.id }, select: { email: true } }) : null;
    const to = body.testTo ?? me?.email ?? adminUsers().find((x) => x.includes("@"));
    if (!to) return NextResponse.json({ ok: false, error: "No address to send the test to" }, { status: 422 });
    const { html, text } = renderBroadcast(body.subject, body.body);
    try {
      await sendMail({ to, subject: `[TEST] ${body.subject}`, html, text, kind: "TEST" });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, data: { test: true, to } });
  }

  const emails = await audienceEmails(body.audience, body.emails ?? []);
  if (emails.length === 0) return NextResponse.json({ ok: false, error: "Nobody to send to" }, { status: 422 });
  const session = await getAuthUser();
  const broadcast = await prisma.emailBroadcast.create({
    data: { subject: body.subject, body: body.body, audience: body.audience, recipients: emails.length, createdBy: session?.username ?? "admin" },
  });
  runBroadcast(broadcast.id, body.subject, body.body, emails);
  return NextResponse.json({ ok: true, data: { id: broadcast.id, recipients: emails.length } });
}

/** The rendered email, for the composer's preview. */
export async function PUT(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { subject?: string; body?: string };
  return NextResponse.json({ ok: true, data: renderBroadcast(String(b.subject ?? ""), String(b.body ?? "")) });
}
