"use client";

import { useEffect, useState } from "react";
import { Bot, MessageCircleQuestion } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import type { AiProvider } from "@/lib/aiKey";

// Not imported from aiKey: that module pulls in Prisma and node crypto, which a client component can't.
const PROVIDER_NAME: Record<AiProvider, string> = { OPENAI: "OpenAI", GEMINI: "Gemini", DEEPSEEK: "DeepSeek" };

interface Profile {
  userId: string; name: string; username: string; shop: string; provider: string;
  count: number; unanswered: number; persona: string; firstAt: string; lastAt: string;
  topics: { topic: string; label: string; count: number; percent: number }[];
  latest: string[];
}

interface Recent {
  id: string; question: string; topic: string; answered: boolean; createdAt: string; name: string; username: string; shop: string;
}

/** What users ask the Telegram AI helper: one card per user saying what they care about,
 *  then the latest questions from everyone. */
export function AdminAiQuestions() {
  const [data, setData] = useState<{ total: number; profiles: Profile[]; recent: Recent[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/ai-questions", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => (b.ok ? setData(b.data) : setError(b.error || "Failed")))
      .catch(() => setError("Failed"));
  }, []);

  if (error) return <p className="p-4 text-sm text-red-600">{error}</p>;
  if (!data) return <p className="p-4 text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <section className="border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="flex items-center gap-2 font-semibold"><Bot className="size-4" /> Users who ask the AI</h2>
        <p className="mt-1 text-xs text-gray-500">{data.total} questions from {data.profiles.length} users. Users are told in /ai that their questions are kept; answers are not.</p>
        {data.profiles.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No questions yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.profiles.map((p) => (
              <article key={p.userId} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name} <span className="text-xs font-normal text-gray-500">@{p.username}</span></p>
                    <p className="truncate text-xs text-gray-500">{p.shop} · {PROVIDER_NAME[p.provider as AiProvider] ?? p.provider}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">{p.count} questions</span>
                </div>
                <p className="mt-2 text-sm font-medium text-teal-700 dark:text-teal-300">{p.persona}</p>
                <div className="mt-2 space-y-1">
                  {p.topics.map((t) => (
                    <div key={t.topic} className="flex items-center gap-2 text-xs">
                      <span className="w-24 shrink-0 truncate">{t.label}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                        <span className="block h-full bg-teal-500" style={{ width: `${t.percent}%` }} />
                      </span>
                      <span className="w-14 shrink-0 text-right tabular-nums text-gray-500">{t.count} · {t.percent}%</span>
                    </div>
                  ))}
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
                  {p.latest.map((q, i) => <li key={i} className="truncate">• {q}</li>)}
                </ul>
                <p className="mt-2 text-[11px] text-gray-400">
                  First {fmtDateTime(p.firstAt)} · Last {fmtDateTime(p.lastAt)}{p.unanswered ? ` · ${p.unanswered} unanswered` : ""}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <h2 className="flex items-center gap-2 border-b border-gray-200 p-4 font-semibold dark:border-gray-800"><MessageCircleQuestion className="size-4" /> Latest questions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-800/60">
              <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Topic</th><th className="px-3 py-2">Question</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.recent.map((q) => (
                <tr key={q.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{fmtDateTime(q.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{q.name}<br /><span className="text-gray-500">{q.shop}</span></td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{q.topic}</td>
                  <td className="px-3 py-2">{q.question}{q.answered ? "" : <span className="ml-1 text-xs text-red-500">(no answer)</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
