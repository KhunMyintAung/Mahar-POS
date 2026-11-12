import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMessage, withBotToken, withTranscript } from "@/lib/telegram";

// The conversation log keeps what the bot said to the customer's chat while it answered,
// and nothing it sent anywhere else (the shop's own chat gets slips and questions).
describe("withTranscript", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the messages to the one chat, in order", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: true, result: {} })));
    const { result, lines } = await withTranscript("555", () =>
      withBotToken("t", async () => {
        await sendMessage("555", "first");
        await sendMessage("999", "to staff");
        await sendMessage("555", "second");
        return 7;
      }),
    );
    expect(result).toBe(7);
    expect(lines).toEqual(["first", "second"]);
  });
});
