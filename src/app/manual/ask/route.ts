import type { NextRequest } from "next/server";
import { z } from "zod";
import { AiError } from "@/lib/aiAgent";
import { clientIp } from "@/lib/client-ip";
import { askSupport, forgetSupportKey, takeSupportTurn } from "@/lib/supportAgent";

export const dynamic = "force-dynamic";

const body = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(2000),
  })).min(1).max(12),
});

const reply = (status: number, data: { answer?: string; error?: string }) =>
  Response.json(data.error ? { ok: false, error: data.error } : { ok: true, data: { answer: data.answer } }, {
    status, headers: { "cache-control": "no-store" },
  });

/** "Ask for support" on the manual pages. Under /manual so it is the same address on
 *  maharpos.shop/manual and here. Public; no shop's records are read. */
export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply(400, { error: "မေးခွန်း ရေးပြီးမှ ပို့ပါ။" });
  // Only the last few turns go to the model; the last must be the visitor's question.
  const turns = parsed.data.messages.slice(-8);
  if (turns[turns.length - 1].role !== "user") return reply(400, { error: "မေးခွန်း ရေးပြီးမှ ပို့ပါ။" });
  if (turns[turns.length - 1].content.length > 1000) return reply(400, { error: "မေးခွန်းကို စာလုံး ၁၀၀၀ အောက် တိုပေးပါ။" });

  const turn = takeSupportTurn(clientIp(req.headers));
  if (turn === "visitor") return reply(429, { error: "တစ်နာရီအတွင်း မေးခွန်း များလွန်းနေပါသည်။ ခဏနေမှ ပြန်မေးပါ၊ သို့မဟုတ် Telegram မှ မေးပါ။" });
  if (turn === "day") return reply(429, { error: "ယနေ့ မေးခွန်း အရေအတွက် ပြည့်သွားပါပြီ။ Telegram မှ Support Team ကို မေးပါ။" });

  try {
    const answer = await askSupport(turns);
    if (!answer) return reply(503, { error: "Support AI ကို ယခု မဖွင့်ရသေးပါ။ Telegram မှ Support Team ကို မေးပါ။" });
    return reply(200, { answer });
  } catch (e) {
    if (e instanceof AiError && e.kind === "bad_key") forgetSupportKey();
    console.error("[manual ask]", e instanceof Error ? e.message : e);
    return reply(502, { error: "အဖြေ ယခု မရပါ။ ခဏနေမှ ပြန်မေးပါ၊ သို့မဟုတ် Telegram မှ မေးပါ။" });
  }
}
