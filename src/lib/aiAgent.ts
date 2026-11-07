import type { AuthUser } from "./auth";
import type { AiProvider } from "./aiKey";
import { AI_TOOLS, runAiTool, type AiTool } from "./aiTools";
import { todayBusinessDate } from "./dates";

/** The Telegram AI helper: a shop's question, answered from its own records with the
 *  shop's own OpenAI, Gemini or DeepSeek key.
 *
 *  The model gets the read-only tools in aiTools.ts and decides what to look up; this loop
 *  runs the lookups and hands the results back until the model answers. Plain fetch, no
 *  SDK, the same way the Telegram client is written. */

// Overridable without a deploy of code, in case a provider retires a model.
const GEMINI_MODEL = process.env.AI_GEMINI_MODEL || "gemini-flash-latest";

/** OpenAI and DeepSeek take the same chat-completions request; only where and which model differ. */
const CHAT_API = {
  OPENAI: { url: "https://api.openai.com/v1", model: process.env.AI_OPENAI_MODEL || "gpt-5-mini" },
  DEEPSEEK: { url: "https://api.deepseek.com", model: process.env.AI_DEEPSEEK_MODEL || "deepseek-chat" },
} as const;

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
    "Before saying something is not found, try again: search with fewer or single words, fix likely spelling (spear → spare), and use close_matches and categories from stock_list to offer what the shop does have.",
    "Look across tools when a question needs it: sales for what sold, purchases for what was bought, income_expense for entries, wallets and billers for balances now, customers and find_repair for people and phones.",
    "When asked for advice, base it on the figures you looked up and give a few concrete, practical steps.",
    "Telegram shows plain text: do not use Markdown (no **, #, or tables). Use short lines, • for lists and a few emoji. Write numbers with thousands separators.",
    "You can only read records. If asked to record or change something, tell the user to use the bot menu (/menu) or the app.",
  ].join("\n");
}

function failure(status: number, body: string): AiError {
  if (status === 401 || status === 403 || /API key not valid|invalid_api_key|Incorrect API key/i.test(body)) {
    return new AiError("bad_key", `key rejected (${status})`);
  }
  // DeepSeek answers 402 "Insufficient Balance" when the account has run out.
  if (status === 429 || status === 402 || /quota|rate limit|insufficient_quota|RESOURCE_EXHAUSTED|Insufficient Balance/i.test(body)) {
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

type GeminiPart = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } };
type GeminiContent = { role: string; parts: (GeminiPart | Record<string, unknown>)[] };
type GeminiReply = { candidates?: { content?: GeminiContent }[]; promptFeedback?: { blockReason?: string } };

export type ChatTurn = { role: "user" | "assistant"; content: string };
/** A lookup the model may make: its description for the model, and what runs it. */
export interface ToolSet {
  tools: AiTool[];
  run: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

async function askChat(
  api: (typeof CHAT_API)[keyof typeof CHAT_API], apiKey: string, system: string, turns: ChatTurn[], toolSet?: ToolSet,
): Promise<string> {
  const messages: OpenAiMessage[] = [{ role: "system", content: system }, ...turns];
  const tools = toolSet?.tools.length ? toolSet.tools.map((t) => ({ type: "function", function: t })) : undefined;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const data = (await post(`${api.url}/chat/completions`, { authorization: `Bearer ${apiKey}` }, {
      model: api.model, messages, ...(tools ? { tools } : {}),
    })) as OpenAiReply;
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new AiError("failed", "empty chat reply");
    if (!msg.tool_calls?.length || !toolSet) return msg.content ?? "";
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      const result = await toolSet.run(call.function.name, parseArgs(call.function.arguments));
      messages.push({ role: "tool", tool_call_id: call.id, content: json(result) });
    }
  }
  throw new AiError("failed", "too many lookups");
}

// Gemini refuses an object schema with no properties; a tool without inputs leaves it out.
const geminiTools = (tools: AiTool[]) =>
  tools.map((t) => (Object.keys(t.parameters.properties).length ? t : { name: t.name, description: t.description }));

async function askGemini(apiKey: string, system: string, turns: ChatTurn[], toolSet?: ToolSet): Promise<string> {
  const contents: GeminiContent[] = turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const tools = toolSet?.tools.length ? [{ functionDeclarations: geminiTools(toolSet.tools) }] : undefined;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const data = (await post(url, { "x-goog-api-key": apiKey }, {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      ...(tools ? { tools } : {}),
    })) as GeminiReply;
    const content = data.candidates?.[0]?.content;
    if (!content) throw new AiError("failed", `empty Gemini reply ${data.promptFeedback?.blockReason ?? ""}`);
    const parts = (content.parts ?? []) as GeminiPart[];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length || !toolSet) return parts.map((p) => p.text ?? "").join("").trim();
    // The model's turn goes back unchanged: newer Gemini models attach signatures to it.
    contents.push({ role: "model", parts: content.parts });
    const responses = [];
    for (const p of calls) {
      const { name, args } = p.functionCall!;
      const result = await toolSet.run(name, args ?? {});
      responses.push({ functionResponse: { name, response: { result: JSON.parse(json(result)) } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  throw new AiError("failed", "too many lookups");
}

/** A conversation with the shop's key: the model may make the given lookups until it answers. */
export async function askAgent(
  key: { provider: AiProvider; key: string }, system: string, turns: ChatTurn[], toolSet?: ToolSet, maxReply = MAX_REPLY,
): Promise<string> {
  const answer = key.provider === "GEMINI"
    ? await askGemini(key.key, system, turns, toolSet)
    : await askChat(CHAT_API[key.provider], key.key, system, turns, toolSet);
  const text = answer.trim();
  if (!text) throw new AiError("failed", "empty reply");
  return text.length > maxReply ? `${text.slice(0, maxReply)}…` : text;
}

export async function askShopAgent(
  user: AuthUser,
  businessName: string,
  question: string,
  key: { provider: AiProvider; key: string },
): Promise<string> {
  return askAgent(key, systemPrompt(user, businessName), [{ role: "user", content: question }], {
    tools: AI_TOOLS, run: (name, args) => runAiTool(user, name, args),
  }).catch((e) => {
    if (e instanceof AiError && e.message === "empty reply") return "…";
    throw e;
  });
}

/** A cheap call that tells a working key from a wrong one before it is saved. */
export async function checkAiKey(provider: AiProvider, apiKey: string): Promise<"ok" | "bad_key" | "failed"> {
  const req: { url: string; headers: Record<string, string> } = provider === "GEMINI"
    ? { url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", headers: { "x-goog-api-key": apiKey } }
    : { url: `${CHAT_API[provider].url}/models`, headers: { authorization: `Bearer ${apiKey}` } };
  try {
    const res = await fetch(req.url, { headers: req.headers, signal: AbortSignal.timeout(15_000) });
    if (res.ok) return "ok";
    const body = await res.text();
    return failure(res.status, body).kind === "bad_key" ? "bad_key" : "failed";
  } catch {
    return "failed";
  }
}
