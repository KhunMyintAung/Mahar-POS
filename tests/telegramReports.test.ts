import { describe, expect, it } from "vitest";
import { DEFAULT_TELEGRAM_REPORTS, parseTelegramReports } from "@/lib/telegramReports";

describe("telegram reports settings", () => {
  it("falls back to safe defaults", () => {
    expect(parseTelegramReports(undefined)).toEqual(DEFAULT_TELEGRAM_REPORTS);
    expect(parseTelegramReports({ dailyTime: "25:99" }).dailyTime).toBe("21:00");
  });

  it("keeps valid chats and drops empty ones", () => {
    const cfg = parseTelegramReports({
      enabled: true, botToken: "x", dailyTime: "20:30",
      targets: [{ chatId: " -1001234567890 ", name: "Staff", live: true, daily: false }, { chatId: "", name: "blank", live: true, daily: true }],
    });
    expect(cfg.dailyTime).toBe("20:30");
    expect(cfg.targets).toEqual([{ chatId: "-1001234567890", name: "Staff", live: true, daily: false }]);
  });
});
