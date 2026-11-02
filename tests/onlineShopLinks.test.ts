import { describe, expect, it } from "vitest";
import { parseOnlineShop, shopLinkHref, shopMapHref, webUrl } from "../src/lib/onlineShop";

describe("online shop links", () => {
  it("keeps web links and adds https to a bare address", () => {
    expect(webUrl("https://maps.app.goo.gl/abc")).toBe("https://maps.app.goo.gl/abc");
    expect(webUrl("facebook.com/maharshwe")).toBe("https://facebook.com/maharshwe");
    expect(webUrl("javascript:alert(1)")).toBe("");
    expect(webUrl("data:text/html,hi")).toBe("");
    expect(webUrl("just words")).toBe("");
  });

  it("makes a name into the site's link", () => {
    expect(shopLinkHref("telegram", "@maharshwe")).toBe("https://t.me/maharshwe");
    expect(shopLinkHref("tiktok", "@mahar.shwe")).toBe("https://www.tiktok.com/@mahar.shwe");
    expect(shopLinkHref("messenger", "maharshwe")).toBe("https://m.me/maharshwe");
    expect(shopLinkHref("facebook", "https://www.facebook.com/maharshwe")).toBe("https://www.facebook.com/maharshwe");
    expect(shopLinkHref("facebook", "<script>")).toBe("");
  });

  it("opens a Viber chat from a Myanmar number", () => {
    expect(shopLinkHref("viber", "09 7777 1234")).toBe("viber://chat?number=%2B95977771234");
    expect(shopLinkHref("viber", "+959777712345")).toBe("viber://chat?number=%2B959777712345");
  });

  it("finds the shop on the map from its link, its location, or its address", () => {
    expect(shopMapHref("https://maps.app.goo.gl/x", 16.8, 96.1, "Yangon")).toBe("https://maps.app.goo.gl/x");
    expect(shopMapHref("", 16.8, 96.1, "Yangon")).toBe("https://www.google.com/maps?q=16.8,96.1");
    expect(shopMapHref("", null, null, "No 5, Yangon")).toBe("https://www.google.com/maps/search/?api=1&query=No%205%2C%20Yangon");
    expect(shopMapHref("", null, null, "")).toBe("");
  });

  it("drops a bad link when settings are read", () => {
    const cfg = parseOnlineShop({ mapUrl: "javascript:x", gameTopupUrl: "maharpos.shop/digital/game/?shop=a", links: { telegram: " @a " } });
    expect(cfg.mapUrl).toBe("");
    expect(cfg.gameTopupUrl).toBe("https://maharpos.shop/digital/game/?shop=a");
    expect(cfg.links).toEqual({ facebook: "", messenger: "", telegram: "@a", viber: "", tiktok: "" });
  });
});
