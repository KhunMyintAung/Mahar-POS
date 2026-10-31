import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/adminAccess";
import { profileOf, TOPIC_LABEL, type AiTopic } from "@/lib/aiQuestions";

export const dynamic = "force-dynamic";

const deny = () => NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });

/** What shops ask the Telegram AI helper: a profile per user (how much they ask, about
 *  what, what that says about them) and the latest questions. Admin only. */
export async function GET() {
  if (!(await isAdminRequest())) return deny();

  const rows = await prisma.aiQuestion.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, username: true, business: { select: { name: true } } },
  });
  const who = new Map(users.map((u) => [u.id, { name: u.name, username: u.username, shop: u.business.name }]));

  const byUser = new Map<string, typeof rows>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);

  const profiles = [...byUser.entries()]
    .map(([userId, list]) => ({
      ...profileOf(userId, list),
      ...(who.get(userId) ?? { name: "—", username: "", shop: "—" }),
      provider: list[0].provider,
      unanswered: list.filter((q) => !q.answered).length,
      latest: list.slice(0, 5).map((q) => q.question),
    }))
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());

  const recent = rows.slice(0, 200).map((r) => ({
    id: r.id,
    question: r.question,
    topic: TOPIC_LABEL[r.topic as AiTopic] ?? r.topic,
    answered: r.answered,
    createdAt: r.createdAt,
    ...(who.get(r.userId) ?? { name: "—", username: "", shop: "—" }),
  }));

  return NextResponse.json({ ok: true, data: { total: rows.length, profiles, recent } });
}
