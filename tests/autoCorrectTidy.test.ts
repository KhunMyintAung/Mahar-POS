import { describe, expect, it } from "vitest";
import { autoCorrectName } from "../src/lib/autoCorrect";

describe("tidying product names", () => {
  it("capitalises words typed in small letters and mends accessory words", () => {
    expect(autoCorrectName("type c cable 1m")).toBe("Type-C Cable 1m");
    expect(autoCorrectName("samsung fast chargr 25w")).toBe("Samsung Fast Charger 25W");
    expect(autoCorrectName("powerbank 10000mah")).toBe("Power Bank 10000mAh");
    expect(autoCorrectName("usb otg adaptor")).toBe("USB OTG Adapter");
    expect(autoCorrectName("Tecno Saprk 7")).toBe("Tecno Spark 7");
    expect(autoCorrectName("redmi 13c 4g /13r")).toBe("Redmi 13c 4G/13r");
  });

  it("keeps the shop's own capitals, plurals and small joining words", () => {
    expect(autoCorrectName("iPhone 11 GX inCell")).toBe("iPhone 11 GX inCell");
    expect(autoCorrectName("silicone cases for iphone 15")).toBe("Silicone Cases for iPhone 15");
    expect(autoCorrectName("Redmi 10A")).toBe("Redmi 10A");
    expect(autoCorrectName("Hot 30i")).toBe("Hot 30i");
    expect(autoCorrectName("ဖုန်းကြိုး type-c")).toBe("ဖုန်းကြိုး Type-C");
  });
});
