import type { AuthUser } from "./auth";
import type { AiProvider } from "./aiKey";
import { AI_TOOLS, runAiTool } from "./aiTools";
import { todayBusinessDate } from "./dates";

/** The Telegram AI helper: a shop's question, answered from its own records with the
 *  shop's own OpenAI or Gemini key.
 *
 *  The model gets the read-only tools in aiTools.ts and decides what to look up; this loop
 *  runs the lookups and hands the results back until the model answers. Plain fetch, no
 *  SDK, the same way the Telegram client is written. */

// Overridable without a deploy of code, in case a provider retires a model.
const OPENAI_MODEL = process.env.AI_OPENAI_MODEL || "gpt-5-mini";
const GEMINI_MODEL = process.env.AI_GEMINI_MODEL || "gemini-flash-latest";

/** Lookups one question may make before the answer has to come. */
const MAX_ROUNDS = 6;
const TIMEOUT_MS = 60_000;
/** Telegram's limit is 4096 characters a message. */
const MAX_REPLY = 4000;

/** Why a call failed, in words the bot can turn into a Myanmar reply. */
export class AiError extends Error {
  constructor(public kind: "bad_key" | "quota" | "failed", message: string) {
    super(message);
  }
}

function systemPrompt(user: AuthUser, businessName: string): string {
  return [
    `You are the business assistant inside Mahar Mini POS, talking over Telegram to ${user.name} (${user.roleName}) of the shop "${businessName}" in Myanmar.`,
    `Today is ${todayBusinessDate()} (Asia/Yangon). Money is Myanmar kyat (MMK) unless a record says otherwise.`,
    "Always answer in Myanmar (Burmese) language, briefly and clearly, the way a helpful shop accountant would talk.",
    "Use the tools to look up the shop's real figures before answering any question about its numbers; never guess or invent figures.",
    "If a tool says the user has no permission, say so politely. If the records do not hold the answer, say that.",
    "When asked for advice, base it on the figures you looked up and give a few concrete, practical steps.",
    "Telegram shows plain text: do not use Markdown (no **, #, or tables). Use short lines, • for lists and a few emoji. Write numbers with thousands separators.",
    "You can only read records. If asked to record or change something, tell the user to use the bot menu (/menu) or the app.",
  ].join("\n");
}

function failure(status: number, body: string): AiError {
  if (status === 401 || status === 403 || /API key not valid|invalid_api_key|Incorrect API key/i.test(body)) {
    return new AiError("bad_key", `key rejected (${status})`);
  }
  if (status === 429 || /quota|rate limit|insufficient_quota|RESOURCE_EXHAUSTED/i.test(body)) {
    return new AiError("quota", `quota (${status})`);
  }
  return new AiError("failed", `${status}: ${body.slice(0, 300)}`);
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new AiError("failed", e instanceof Error ? e.message : String(e));
  }
  const text = await res.text();
  if (!res.ok) throw failure(res.status, text);
  return JSON.parse(text);
}

const parseArgs = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw ?? "{}")) as Record<string, unknown>;
  } catch {
    return {};
  }
};

// The tool results carry BigInt-free numbers already; this is a guard for anything missed.
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x));

type OpenAiMessage = Record<string, unknown>;
type OpenAiReply = { choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[] };

async function askOpenAi(user: AuthUser, apiKey: string, system: string, question: string): Promise<string> {
  const messages: OpenAiMessage[] = [{ role: "system", content: system }, { role: "user", content: question }];
  const tools = AI_TOOLS.map((t) => ({ type: "function", function: t }));
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const data = (await post("https://api.openai.com/v1/chat/completions", { authorization: `Bearer ${apiKey}` }, {
      model: OPENAI_MODEL, messages, tools,
    })) as OpenAiReply;
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new AiError("failed", "empty OpenAI reply");
    if (!msg.tool_calls?.length) return msg.content ?? "";
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      const result = await runAiTool(user, call.function.name, parseArgs(call.function.arguments));
      messages.push({ role: "tool", tool_call_id: call.id, content: json(result) });
    }
  }
  throw new AiError("failed", "too many lookups");
}

// Gemini refuses an object schema with no properties; a tool without inputs leaves it out.
const GEMINI_TOOLS = AI_TOOLS.map((t) => (Object.keys(t.parameters.properties).length ? t : { name: t.name, description: t.description }));

type GeminiPart ={ text?: string; functionCall?: { name: string; args?: Record<string, unknown> } };
type GeminiContent = { role: string; parts: (GeminiPart | Record<string, unknown>)[] };
type GeminiReply = { candidates?: { content?: GeminiContent }[]; promptFeedback?: { blockReason?: string } };

async function askGemini(user: AuthUser, apiKey: string, system: string, question: string): Promise<string> {
  const contents: GeminiContent[] = [{ role: "user", parts: [{ text: question }] }];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const data = (await post(url, { "x-goog-api-key": apiKey }, {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: [{ functionDeclarations: GEMINI_TOOLS }],
    })) as GeminiReply;
    const content = data.candidates?.[0]?.content;
    if (!content) throw new AiError("failed", `empty Gemini reply ${data.promptFeedback?.blockReason ?? ""}`);
    const parts = (content.parts ?? []) as GeminiPart[];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) return parts.map((p) => p.text ?? "").join("").trim();
    // The model's turn goes back unchanged: newer Gemini models attach signatures to it.
    contents.push({ role: "model", parts: content.parts });
    const responses = [];
    for (const p of calls) {
      const { name, args } = p.functionCall!;
      const result = await runAiTool(user, name, args ?? {});
      responses.push({ functionResponse: { name, response: { result: JSON.parse(json(result)) } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  throw new AiError("failed", "too many lookups");
}

export async function askShopAgent(
  user: AuthUser,
  businessName: string,
  question: string,
  key: { provider: AiProvider; key: string },
): Promise<string> {
  const system = systemPrompt(user, businessName);
  const answer = key.provider === "OPENAI"
    ? await askOpenAi(user, key.key, system, question)
    : await askGemini(user, key.key, system, question);
  const text = answer.trim() || "…";
  return text.length > MAX_REPLY ? `${text.slice(0, MAX_REPLY)}…` : text;
}

/** A cheap call that tells a working key from a wrong one before it is saved. */
export async function checkAiKey(provider: AiProvider, apiKey: string): Promise<"ok" | "bad_key" | "failed"> {
  const req: { url: string; headers: Record<string, string> } = provider === "OPENAI"
    ? { url: "https://api.openai.com/v1/models", headers: { authorization: `Bearer ${apiKey}` } }
    : { url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", headers: { "x-goog-api-key": apiKey } };
  try {
    const res = await fetch(req.url, { headers: req.headers, signal: AbortSignal.timeout(15_000) });
    if (res.ok) return "ok";
    const body = await res.text();
    return failure(res.status, body).kind === "bad_key" ? "bad_key" : "failed";
  } catch {
    return "failed";
  }
}
