import { describe, expect, it } from "vitest";
import { autoCorrectDevice, autoCorrectName } from "../src/lib/autoCorrect";

describe("auto-correct names", () => {
  it("mends misspelt phone models", () => {
    expect(autoCorrectName("iPHNe 12prnax")).toBe("iPhone 12 Pro Max");
    expect(autoCorrectName("iphnoe 14 plsu")).toBe("iPhone 14 Plus");
    expect(autoCorrectName("samsng a15 5g")).toBe("Samsung A15 5G");
    expect(autoCorrectName("galxy s23 ultar")).toBe("Galaxy S23 Ultra");
    expect(autoCorrectName("redmi note13 pro")).toBe("Redmi Note 13 Pro");
    expect(autoCorrectName("vivo y28 128gb")).toBe("Vivo Y28 128GB");
    expect(autoCorrectName("samsung galaxy a05s")).toBe("Samsung Galaxy A05s");
  });

  it("leaves words it does not know as typed", () => {
    expect(autoCorrectName("IPHONE 11 TL BLACK INCELL GX(IDM ပျောက်လို့ရ)")).toBe("iPhone 11 TL BLACK INCELL GX(IDM ပျောက်လို့ရ)");
    expect(autoCorrectName("Infinix Smart 6 / X6511 / X6511B")).toBe("Infinix Smart 6 / X6511 / X6511B");
    expect(autoCorrectName("Type-C Cable 1m")).toBe("Type-C Cable 1m");
    expect(autoCorrectName("Wall Plug")).toBe("Wall Plug");
    expect(autoCorrectName("Mint Green")).toBe("Mint Green");
  });

  it("moves a brand typed into the model to the brand field", () => {
    expect(autoCorrectDevice("", "iphne 12 promax")).toEqual({ brand: "iPhone", model: "12 Pro Max" });
    expect(autoCorrectDevice("Vivo", "vivo y28")).toEqual({ brand: "Vivo", model: "Y28" });
    expect(autoCorrectDevice("samsng", "a15")).toEqual({ brand: "Samsung", model: "A15" });
  });
});
