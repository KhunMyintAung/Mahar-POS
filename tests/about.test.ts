import { describe, expect, it } from "vitest";
import { DEFAULT_ABOUT, externalUrl, mergeAbout, telegramUrl, tiktokUrl } from "../src/lib/about";

describe("about content", () => {
  it("keeps required identity fields when legacy settings are blank", () => {
    const about = mergeAbout({ appName: "", developer: "", description: "" });
    expect(about.appName).toBe(DEFAULT_ABOUT.appName);
    expect(about.developer).toBe("Khun Myint Aung");
    expect(about.description).toBe(DEFAULT_ABOUT.description);
  });

  it("builds safe external support links", () => {
    expect(telegramUrl("@Mylifemychoice68")).toBe("https://t.me/Mylifemychoice68");
    expect(tiktokUrl("@maharshwemobile")).toBe("https://www.tiktok.com/@maharshwemobile");
    expect(externalUrl("maharshwe.online")).toBe("https://maharshwe.online");
  });

  it("preserves configured URLs", () => {
    expect(externalUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(telegramUrl("https://t.me/example")).toBe("https://t.me/example");
    expect(DEFAULT_ABOUT.facebook).toBe("https://www.facebook.com/Mychoicemylife2018");
    expect(DEFAULT_ABOUT.community).toBe("https://t.me/+2gc9ml7iMgk1ZThl");
  });
});
