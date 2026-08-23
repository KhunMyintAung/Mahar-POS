import { describe, expect, it } from "vitest";

/** Mirrors isHeaderSafe() in the admin page. fetch() throws
 *  "String contains non ISO-8859-1 code point" when a header value falls outside Latin-1,
 *  which is exactly what happens if a Burmese passcode reaches a request. */
function isHeaderSafe(value: string): boolean {
  for (const ch of value) if (ch.codePointAt(0)! > 255) return false;
  return true;
}

/** Proves the rule matches the browser's, so the guard is not merely plausible. */
function browserAcceptsAsHeader(value: string): boolean {
  try {
    new Headers({ "x-admin-secret": value });
    return true;
  } catch {
    return false;
  }
}

describe("admin passcode header safety", () => {
  const cases = [
    "plain-ascii-passcode",
    "64charhexabcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
    "with-symbols!@#$%^&*()",
    "café", // Latin-1 accented — still legal in a header
    "မြန်မာ", // Burmese — the reported crash
    "ဖုန်းအပိုပစ္စည်း",
    "mixed ascii နှင့် မြန်မာ",
    "emoji 🔐",
  ];

  it("agrees with what the browser will actually accept", () => {
    for (const value of cases) {
      expect(isHeaderSafe(value), value).toBe(browserAcceptsAsHeader(value));
    }
  });

  it("rejects Burmese and accepts ASCII", () => {
    expect(isHeaderSafe("မြန်မာ")).toBe(false);
    expect(isHeaderSafe("ဖုန်းအပိုပစ္စည်း")).toBe(false);
    expect(isHeaderSafe("plain-ascii-passcode")).toBe(true);
  });

  it("does not throw when the guard is applied before building headers", () => {
    const burmese = "မြန်မာ";
    expect(() => {
      const headers = isHeaderSafe(burmese) ? { "x-admin-secret": burmese } : undefined;
      new Headers(headers);
    }).not.toThrow();
  });
});
