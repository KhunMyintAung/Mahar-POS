import { describe, expect, it } from "vitest";
import { shopCountry } from "@/lib/shopCountry";

describe("shopCountry", () => {
  it("reads the country from the sign-up time zone", () => {
    expect(shopCountry("Asia/Bangkok", "THB")).toBe("Thailand");
    expect(shopCountry("Asia/Bangkok", "MMK")).toBe("Thailand");
    expect(shopCountry("Asia/Yangon", "MMK")).toBe("Myanmar");
  });
  it("lets the currency decide for shops left on the default zone", () => {
    expect(shopCountry("Asia/Yangon", "THB")).toBe("Thailand");
    expect(shopCountry(null, "MMK")).toBe("Myanmar");
  });
  it("says nothing when it cannot tell", () => {
    expect(shopCountry("Asia/Yangon", "USD")).toBe("");
    expect(shopCountry("America/New_York", "USD")).toBe("");
  });
});
