import { prisma } from "./prisma";

/** What shops ask the Telegram AI helper: each question with a topic, and from those a
 *  short picture of what each user cares about, for the admin portal.
 *
 *  Topics come from keywords, not another AI call, so sorting costs nothing and the same
 *  question always lands in the same place. Users are told their questions are kept (the
 *  /ai consent text, the privacy page) before any is saved. */

export type AiTopic = "profit" | "sales" | "stock" | "debt" | "repair" | "expense" | "advice" | "other";

// First match wins, so the more telling topics come first: "how do I raise profit" is advice.
const TOPIC_WORDS: [AiTopic, RegExp][] = [
  ["advice", /အကြံ|ဘယ်လို လုပ်|ဘယ်လိုလုပ်|တိုးအောင်|တိုးဖို့|ပိုကောင်း|advice|suggest|idea|improve|how (can|do|to)/i],
  ["debt", /အကြွေး|ကြွေး|ပေးရန်|debt|credit|owe|payable|receivable/i],
  ["repair", /ပြင်ဆင်|ပြင်|repair|voucher|technician|ဖုန်းပြင်/i],
  ["stock", /stock|လက်ကျန်|ကုန်ပစ္စည်း|ပစ္စည်း|inventory|item/i],
  ["profit", /အမြတ်|အရှုံး|profit|loss|margin/i],
  ["expense", /ထွက်ငွေ|အသုံးစရိတ်|ကုန်ကျ|လစာ|expense|cost|salary/i],
  ["sales", /အရောင်း|ရောင်း|ဝင်ငွေ|sale|sell|revenue|income/i],
];

export function questionTopic(question: string): AiTopic {
  return TOPIC_WORDS.find(([, re]) => re.test(question))?.[0] ?? "other";
}

export const TOPIC_LABEL: Record<AiTopic, string> = {
  profit: "အမြတ်/အရှုံး", sales: "အရောင်း/ဝင်ငွေ", stock: "Stock", debt: "အကြွေး",
  repair: "ပြင်ဆင်မှု", expense: "ထွက်ငွေ", advice: "အကြံဉာဏ်", other: "အခြား",
};

/** What a user's questions say about them, in a line. */
const PERSONA: Record<AiTopic, string> = {
  profit: "အမြတ်ကို အဓိက စောင့်ကြည့်တဲ့ ပိုင်ရှင်",
  sales: "နေ့စဉ် အရောင်းကို စောင့်ကြည့်သူ",
  stock: "Stock နဲ့ ကုန်ပစ္စည်း စီမံသူ",
  debt: "အကြွေး လိုက်စစ်သူ",
  repair: "ဖုန်းပြင် ဝန်ဆောင်မှု ဦးစားပေးသူ",
  expense: "ကုန်ကျစရိတ် ချွေတာချင်သူ",
  advice: "လုပ်ငန်း တိုးတက်ချင်လို့ အကြံ မကြာခဏ တောင်းသူ",
  other: "အထွေထွေ မေးမြန်းသူ",
};

export interface AiUserProfile {
  userId: string;
  count: number;
  topics: { topic: AiTopic; label: string; count: number; percent: number }[];
  persona: string;
  firstAt: Date;
  lastAt: Date;
}

/** Topic counts, busiest first, and the persona of the busiest topic other than "other". */
export function profileOf(userId: string, rows: { topic: string; createdAt: Date }[]): AiUserProfile {
  const counts = new Map<AiTopic, number>();
  for (const r of rows) counts.set(r.topic as AiTopic, (counts.get(r.topic as AiTopic) ?? 0) + 1);
  const topics = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([topic, count]) => ({ topic, label: TOPIC_LABEL[topic] ?? topic, count, percent: Math.round((count / rows.length) * 100) }));
  const main = topics.find((t) => t.topic !== "other")?.topic ?? "other";
  const times = rows.map((r) => r.createdAt.getTime());
  return {
    userId, count: rows.length, topics, persona: PERSONA[main],
    firstAt: new Date(Math.min(...times)), lastAt: new Date(Math.max(...times)),
  };
}

export async function recordAiQuestion(opts: {
  userId: string; businessId: string; question: string; provider: string; answered: boolean;
}) {
  await prisma.aiQuestion.create({
    data: { ...opts, question: opts.question.slice(0, 2000), topic: questionTopic(opts.question) },
  });
}

/** True once the user has been told their questions are kept; tells them now if not. */
export async function questionsNoticeGiven(userId: string): Promise<boolean> {
  const row = await prisma.telegramAiKey.findUnique({ where: { userId }, select: { questionsNoticeAt: true } });
  if (!row) return false;
  if (row.questionsNoticeAt) return true;
  await prisma.telegramAiKey.update({ where: { userId }, data: { questionsNoticeAt: new Date() } });
  return false;
}
