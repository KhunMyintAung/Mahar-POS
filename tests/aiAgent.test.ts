import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runAiTool: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/aiTools", async (orig) => ({
  ...(await orig<typeof import("@/lib/aiTools")>()),
  runAiTool: mocks.runAiTool,
}));

import { decryptKey, detectProvider, encryptKey } from "@/lib/aiKey";
import { AiError, askShopAgent, checkAiKey } from "@/lib/aiAgent";
import type { AuthUser } from "@/lib/auth";

const user: AuthUser = {
  id: "u1", businessId: "b1", name: "Khun", username: "khun", roleName: "Owner",
  permissions: ["report.view"], allBranches: true, branchIds: [], commissionRate: "0",
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("AI keys", () => {
  beforeEach(() => { process.env.AUTH_SECRET = "test-secret"; });

  it("tells OpenAI and Gemini keys apart and refuses anything else", () => {
    expect(detectProvider("sk-proj-abcdefghijklmnopqrstuvwxyz123456")).toBe("OPENAI");
    expect(detectProvider(" AIzaSyA1234567890abcdefghijklmnopqrstu ")).toBe("GEMINI");
    expect(detectProvider("hello")).toBeNull();
    expect(detectProvider("sk-short")).toBeNull();
  });

  it("stores a key encrypted and reads it back", () => {
    const stored = encryptKey("sk-secret-value");
    expect(stored).not.toContain("sk-secret-value");
    expect(decryptKey(stored)).toBe("sk-secret-value");
  });

  it("cannot read a key once AUTH_SECRET changes", () => {
    const stored = encryptKey("sk-secret-value");
    process.env.AUTH_SECRET = "another-secret";
    expect(() => decryptKey(stored)).toThrow();
  });
});

describe("askShopAgent", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    mocks.runAiTool.mockResolvedValue({ net_profit: 125000 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    mocks.runAiTool.mockReset();
  });

  it("runs an OpenAI tool call and answers with what came back", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { choices: [{ message: { content: null, tool_calls: [
        { id: "c1", type: "function", function: { name: "shop_report", arguments: '{"from":"2026-10-01","to":"2026-10-31"}' } },
      ] } }] }))
      .mockResolvedValueOnce(reply(200, { choices: [{ message: { content: "ဒီလ အသားတင် အမြတ် 125,000 ကျပ်ပါ။" } }] }));

    const answer = await askShopAgent(user, "Mahar", "ဒီလ အမြတ်?", { provider: "OPENAI", key: "sk-x" });

    expect(answer).toBe("ဒီလ အသားတင် အမြတ် 125,000 ကျပ်ပါ။");
    expect(mocks.runAiTool).toHaveBeenCalledWith(user, "shop_report", { from: "2026-10-01", to: "2026-10-31" });
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(second.messages.at(-1)).toEqual({ role: "tool", tool_call_id: "c1", content: '{"net_profit":125000}' });
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer sk-x");
  });

  it("runs a Gemini function call and sends the model's turn back unchanged", async () => {
    const modelTurn = { role: "model", parts: [{ functionCall: { name: "shop_report", args: { from: "2026-10-01", to: "2026-10-31" } }, thoughtSignature: "sig" }] };
    fetchMock
      .mockResolvedValueOnce(reply(200, { candidates: [{ content: modelTurn }] }))
      .mockResolvedValueOnce(reply(200, { candidates: [{ content: { role: "model", parts: [{ text: "အမြတ် 125,000 ကျပ်" }] } }] }));

    const answer = await askShopAgent(user, "Mahar", "အမြတ်?", { provider: "GEMINI", key: "AIza-x" });

    expect(answer).toBe("အမြတ် 125,000 ကျပ်");
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(second.contents[1]).toEqual(modelTurn);
    expect(second.contents[2].parts[0].functionResponse).toEqual({ name: "shop_report", response: { result: { net_profit: 125000 } } });
    // The tool without inputs goes to Gemini without an empty parameter object.
    const repairs = second.tools[0].functionDeclarations.find((t: { name: string }) => t.name === "open_repairs");
    expect(repairs.parameters).toBeUndefined();
  });

  it("says when the key is rejected or out of quota", async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error: { message: "Incorrect API key provided" } }));
    await expect(askShopAgent(user, "M", "q", { provider: "OPENAI", key: "sk-x" })).rejects.toMatchObject({ kind: "bad_key" });

    fetchMock.mockResolvedValueOnce(reply(429, { error: { status: "RESOURCE_EXHAUSTED" } }));
    await expect(askShopAgent(user, "M", "q", { provider: "GEMINI", key: "AIza-x" })).rejects.toBeInstanceOf(AiError);
  });

  it("checks a key before it is saved", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { data: [] }));
    expect(await checkAiKey("OPENAI", "sk-x")).toBe("ok");
    fetchMock.mockResolvedValueOnce(reply(400, { error: { message: "API key not valid. Please pass a valid API key." } }));
    expect(await checkAiKey("GEMINI", "AIza-x")).toBe("bad_key");
  });
});
