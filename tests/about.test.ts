import { describe, expect, it } from "vitest";
import { DEFAULT_ABOUT, externalUrl, telegramUrl, tiktokUrl } from "../src/lib/about";

describe("about content", () => {
  it("points the website and customer live card at maharshwe.shop", () => {
    expect(DEFAULT_ABOUT.website).toBe("https://maharshwe.shop");
    expect(DEFAULT_ABOUT.customerLiveUrl).toBe("https://maharshwe.shop/#live");
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
